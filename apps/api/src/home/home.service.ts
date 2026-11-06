import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  ATTENTION_DAYS,
  UNMARKED_DAYS,
  addDays,
  attentionRank,
  hasFeature,
  localDate,
  patientFullName,
  type AttentionItem,
  type AttentionKind,
  type HomeAppointment,
  type OrgHome,
  type Template,
} from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL, isoOrNull } from '../common/firestore';
import { AuthUser } from '../auth/decorators';
import { OrganizationsService } from '../organizations/organizations.service';
import { TemplatesService } from '../templates/templates.service';
import { OutboxService } from '../patients/outbox.service';
import { AppointmentsService } from '../patients/appointments.service';

const DAY_MS = 86_400_000;
const MAX_ITEMS = 50;
/** Límite de valores de un filtro `in` de Firestore. */
const IN_LIMIT = 30;

const MEDIA_LABELS: Record<string, string> = {
  image: 'Envió una imagen',
  audio: 'Envió un audio',
  video: 'Envió un video',
  document: 'Envió un documento',
  sticker: 'Envió un sticker',
  location: 'Envió una ubicación',
  contacts: 'Envió un contacto',
};

const chunks = <T>(list: T[]) => Array.from({ length: Math.ceil(list.length / IN_LIMIT) }, (_, i) => list.slice(i * IN_LIMIT, (i + 1) * IN_LIMIT));

/**
 * Inicio de la clínica: lo que hay que atender (alertas de los botones,
 * envíos fallidos y mensajes de pacientes) y la agenda del día. Lo atendido
 * se marca en el envío (`attention_resolved_at`) o en los mensajes (`handled`).
 */
@Injectable()
export class HomeService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly orgs: OrganizationsService,
    private readonly templates: TemplatesService,
    private readonly outbox: OutboxService,
    private readonly appointments: AppointmentsService,
  ) {}

  private ref(orgId: string) {
    return this.firebase.db.collection(COL.organizations).doc(orgId);
  }

  async get(orgId: string): Promise<OrgHome> {
    const org = await this.orgs.get(orgId);
    const now = new Date();
    const today = localDate(now, org.timezone);
    const since = Timestamp.fromMillis(now.getTime() - ATTENTION_DAYS * DAY_MS);

    const [responded, recent, inbound, appts, templates] = await Promise.all([
      this.outbox
        .col(orgId)
        .where('response.at', '>=', since)
        .select('template_key', 'response', 'patient_id', 'patient_name', 'step_label', 'attention_resolved_at')
        .get(),
      this.outbox
        .col(orgId)
        .where('send_at', '>=', since)
        .where('send_at', '<=', Timestamp.fromDate(now))
        .select(
          'status',
          'delivery_status',
          'status_reason',
          'patient_id',
          'patient_name',
          'step_label',
          'send_at',
          'sent_at',
          'template_key',
          'response',
          'attention_resolved_at',
        )
        .get(),
      this.ref(orgId)
        .collection(COL.messages)
        .where('received_at', '>=', since)
        .select('direction', 'from', 'contact_name', 'type', 'text', 'outbox_id', 'received_at', 'handled', 'handoff_reason')
        .get(),
      this.appointments.list(orgId, addDays(today, -UNMARKED_DAYS), today),
      this.templates.list({ orgId }),
    ]);

    const tpl = new Map<string, Template>(templates.map((t) => [t.key, t]));
    const actionOf = (key: string, index: number) => {
      const t = tpl.get(key);
      return (t?.approved?.buttons ?? t?.buttons ?? [])[index]?.action ?? null;
    };

    const attention: AttentionItem[] = [];

    for (const doc of responded.docs) {
      const d = doc.data();
      const action = actionOf(d.template_key, d.response.index);
      const resolved = d.attention_resolved_at as Timestamp | undefined;
      // Una respuesta nueva después de atendida vuelve a aparecer
      if (action?.type !== 'alert' || (resolved && resolved.toMillis() >= d.response.at.toMillis())) continue;
      attention.push({
        kind: 'alert',
        id: doc.id,
        patient_id: d.patient_id,
        name: d.patient_name,
        at: isoOrNull(d.response.at)!,
        text: d.response.text,
        level: action.alert_level ?? 'info',
        context: d.step_label ?? null,
        count: 1,
      });
    }

    // Mensajes con botones que el paciente no ha contestado en el plazo de la clínica
    const hours = org.no_response_hours;
    const answerBy = hours ? now.getTime() - hours * 3_600_000 : null;
    const hasButtons = (key: string) => {
      const t = tpl.get(key);
      return (t?.approved?.buttons ?? t?.buttons ?? []).some((b) => b.type === 'QUICK_REPLY');
    };

    for (const doc of recent.docs) {
      const d = doc.data();
      if (d.attention_resolved_at) continue;
      const failed = d.status === 'failed' || (d.status === 'sent' && d.delivery_status === 'failed');
      const sentAt = d.sent_at ?? d.send_at;
      const unanswered =
        !failed && answerBy !== null && d.status === 'sent' && !d.response && sentAt.toMillis() <= answerBy && hasButtons(d.template_key);
      if (!failed && !unanswered) continue;
      attention.push({
        kind: failed ? 'failed' : 'no_response',
        id: doc.id,
        patient_id: d.patient_id,
        name: d.patient_name,
        at: isoOrNull(sentAt)!,
        text: failed ? d.status_reason || 'Sin detalle' : `Sin respuesta en ${hours} h`,
        level: null,
        context: d.step_label ?? null,
        count: 1,
      });
    }

    // Mensajes escritos por el paciente (las respuestas con botón van como alertas), uno por número
    const byContact = new Map<string, { latest: FirebaseFirestore.DocumentData; count: number; handoff: string | null }>();
    for (const doc of inbound.docs) {
      const d = doc.data();
      if (d.direction !== 'in' || d.handled || d.outbox_id) continue;
      const prev = byContact.get(d.from);
      if (!prev) byContact.set(d.from, { latest: d, count: 1, handoff: d.handoff_reason ?? null });
      else {
        prev.count++;
        prev.handoff ??= d.handoff_reason ?? null;
        if (d.received_at.toMillis() > prev.latest.received_at.toMillis()) prev.latest = d;
      }
    }
    const patientsByPhone = new Map<string, { id: string; name: string }>();
    for (const phones of chunks([...byContact.keys()])) {
      const snap = await this.ref(orgId).collection(COL.patients).where('phone', 'in', phones).select('first_name', 'last_name', 'phone').get();
      snap.docs.forEach((p) => patientsByPhone.set(p.get('phone'), { id: p.id, name: patientFullName(p.data() as any) }));
    }
    for (const [from, { latest, count, handoff }] of byContact) {
      const patient = patientsByPhone.get(from);
      attention.push({
        kind: 'inbound',
        id: from,
        patient_id: patient?.id ?? null,
        name: patient?.name ?? latest.contact_name ?? `+${from}`,
        at: isoOrNull(latest.received_at)!,
        text: latest.text || MEDIA_LABELS[latest.type] || 'Envió un mensaje',
        level: null,
        context: handoff ? `El asistente IA lo pasó al equipo: ${handoff}` : null,
        count,
      });
    }

    // Alertas de botones y faltas de respuesta: planes con `alerts` (fallas y mensajes escritos, en todos)
    const visible = hasFeature(org.plan, 'alerts') ? attention : attention.filter((i) => i.kind === 'failed' || i.kind === 'inbound');
    visible.sort((a, b) => attentionRank(a) - attentionRank(b) || b.at.localeCompare(a.at));

    // Agenda: la última respuesta a los recordatorios de cada cita
    const todayAppts = appts.filter((a) => a.date === today);
    const unmarked = appts.filter((a) => a.date < today && a.status === 'scheduled');
    const replies = new Map<string, { at: number; text: string; confirmed: boolean }>();
    for (const ids of chunks([...todayAppts, ...unmarked].map((a) => a.id))) {
      const snap = await this.outbox.col(orgId).where('appointment_id', 'in', ids).select('appointment_id', 'template_key', 'response').get();
      for (const doc of snap.docs) {
        const d = doc.data();
        if (!d.response) continue;
        const at = d.response.at?.toMillis() ?? 0;
        if ((replies.get(d.appointment_id)?.at ?? -1) >= at) continue;
        replies.set(d.appointment_id, { at, text: d.response.text, confirmed: actionOf(d.template_key, d.response.index)?.type === 'confirm' });
      }
    }
    const withReply = (a: (typeof appts)[number]): HomeAppointment => {
      const r = replies.get(a.id);
      return { ...a, reply: r ? { text: r.text, confirmed: r.confirmed } : null };
    };

    return {
      attention: visible.slice(0, MAX_ITEMS),
      today: todayAppts.map(withReply),
      unmarked: unmarked.map(withReply),
    };
  }

  /** Marca como atendida una alerta, falla o falta de respuesta (en el envío) o los mensajes de un número. */
  async resolve(orgId: string, kind: AttentionKind, id: string, user: AuthUser) {
    const mark = { at: FieldValue.serverTimestamp(), by: user.uid };
    if (kind === 'inbound') {
      const snap = await this.ref(orgId).collection(COL.messages).where('from', '==', id).select('direction', 'handled').get();
      const batch = this.firebase.db.batch();
      for (const doc of snap.docs) {
        if (doc.get('direction') === 'in' && !doc.get('handled')) {
          batch.update(doc.ref, { handled: true, handled_at: mark.at, handled_by: mark.by });
        }
      }
      // Atendido: el asistente con IA vuelve a responder a ese número
      batch.set(this.ref(orgId).collection(COL.waContacts).doc(id), { assistant_paused_until: FieldValue.delete() }, { merge: true });
      await batch.commit();
      return { ok: true };
    }
    if (!['alert', 'failed', 'no_response'].includes(kind)) throw new BadRequestException('Tipo inválido');
    const ref = this.outbox.col(orgId).doc(id);
    if (!(await ref.get()).exists) throw new NotFoundException('Envío no encontrado');
    await ref.update({ attention_resolved_at: mark.at, attention_resolved_by: mark.by });
    return { ok: true };
  }
}
