import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  ASSISTANT_PAUSE_HOURS,
  CHAT_MAX_LENGTH,
  CHAT_WINDOW_HOURS,
  PLANS,
  type ChatMessage,
  type ChatMessageKind,
  type PatientConversation,
} from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL, isoOrNull } from '../common/firestore';
import { AuthUser } from '../auth/decorators';
import { OrganizationsService } from '../organizations/organizations.service';
import { TemplatesService } from '../templates/templates.service';
import { MetaGraphClient } from '../meta/graph.client';
import { MetaConnectionStore } from '../meta/meta-connection.store';
import { PatientsService } from './patients.service';

const MAX_MESSAGES = 300;
const WINDOW_MS = CHAT_WINDOW_HOURS * 3_600_000;
const OUT_KINDS: ChatMessageKind[] = ['outbox', 'chat', 'auto_reply', 'opt_out', 'test', 'assistant'];

/**
 * Conversación de WhatsApp con un paciente: todo lo enviado y recibido en su
 * número, y mensajes uno a uno de la clínica. Meta solo deja escribir texto
 * libre dentro de las 24 h siguientes al último mensaje del paciente; fuera
 * de esa ventana hay que usar una plantilla.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly orgs: OrganizationsService,
    private readonly templates: TemplatesService,
    private readonly store: MetaConnectionStore,
    private readonly graph: MetaGraphClient,
    private readonly patients: PatientsService,
  ) {}

  private messages(orgId: string) {
    return this.firebase.db.collection(COL.organizations).doc(orgId).collection(COL.messages);
  }

  /** Hasta cuándo está abierta la ventana de 24 h de ese número. */
  private async windowUntil(orgId: string, phone: string): Promise<Date | null> {
    const contact = await this.firebase.db.collection(COL.organizations).doc(orgId).collection(COL.waContacts).doc(phone).get();
    const last = contact.get('last_inbound_at') as Timestamp | undefined;
    if (!last) return null;
    const until = new Date(last.toMillis() + WINDOW_MS);
    return until > new Date() ? until : null;
  }

  async conversation(orgId: string, patientId: string): Promise<PatientConversation> {
    const patient = await this.patients.get(orgId, patientId);
    const [incoming, outgoing, templates, until] = await Promise.all([
      this.messages(orgId).where('from', '==', patient.phone).select('direction', 'type', 'text', 'reply', 'received_at').get(),
      this.messages(orgId)
        .where('to', '==', patient.phone)
        .select('direction', 'kind', 'type', 'text', 'template_key', 'template_name', 'status', 'created_at', 'sent_by_name')
        .get(),
      this.templates.list({ orgId }),
      this.windowUntil(orgId, patient.phone),
    ]);
    const labels = new Map(templates.map((t) => [t.key, t.label]));

    const messages: ChatMessage[] = [];
    for (const doc of incoming.docs) {
      const d = doc.data();
      if (d.direction !== 'in') continue;
      messages.push({
        id: doc.id,
        direction: 'in',
        kind: 'patient',
        text: d.reply ? null : d.text ?? `[${d.type}]`,
        template_label: null,
        reply: d.reply?.title ?? null,
        at: isoOrNull(d.received_at)!,
        status: null,
        sent_by_name: null,
      });
    }
    for (const doc of outgoing.docs) {
      const d = doc.data();
      // Los avisos al equipo (staff_alert) no son parte de la conversación con el paciente
      if (d.direction !== 'out' || !OUT_KINDS.includes(d.kind) || !d.created_at) continue;
      messages.push({
        id: doc.id,
        direction: 'out',
        kind: d.kind,
        text: d.type === 'text' ? d.text ?? null : null,
        template_label: d.type === 'template' ? (labels.get(d.template_key) ?? d.template_key ?? d.template_name ?? 'Plantilla') : null,
        reply: null,
        at: isoOrNull(d.created_at)!,
        status: d.status ?? null,
        sent_by_name: d.sent_by_name ?? null,
      });
    }
    messages.sort((a, b) => a.at.localeCompare(b.at));
    return { messages: messages.slice(-MAX_MESSAGES), window_until: until?.toISOString() ?? null };
  }

  /** Texto de la clínica al paciente; deja atendidos sus mensajes en "Requiere atención". */
  async send(orgId: string, patientId: string, text: string, user: AuthUser): Promise<PatientConversation> {
    const body = text.trim();
    if (!body) throw new BadRequestException('Escribe el mensaje');
    if (body.length > CHAT_MAX_LENGTH) throw new BadRequestException(`El mensaje supera ${CHAT_MAX_LENGTH} caracteres`);
    const [org, patient] = await Promise.all([this.orgs.get(orgId), this.patients.get(orgId, patientId)]);
    if (!PLANS[org.plan]?.features.one_to_one) throw new ForbiddenException('Los mensajes uno a uno son parte del plan Adherencia');
    if (org.status === 'suspended') throw new BadRequestException('La organización está suspendida: no se envían mensajes');
    if (patient.opted_out) throw new BadRequestException('El paciente se dio de baja');
    if (!(await this.windowUntil(orgId, patient.phone))) {
      throw new BadRequestException(`Pasaron más de ${CHAT_WINDOW_HOURS} h desde el último mensaje del paciente: envíale una plantilla`);
    }
    const [conn, secrets] = await Promise.all([this.store.raw(orgId), this.store.getSecrets(orgId)]);
    if (!conn.phone_number_id || !secrets.access_token) throw new BadRequestException('WhatsApp no está conectado');

    const res = await this.graph.post(`/${conn.phone_number_id}/messages`, secrets.access_token, {
      messaging_product: 'whatsapp',
      to: patient.phone,
      type: 'text',
      text: { body, preview_url: false },
    });
    const wamid = res.messages?.[0]?.id;
    if (!wamid) throw new BadRequestException('Meta no devolvió el id del mensaje');

    const batch = this.firebase.db.batch();
    batch.set(
      this.messages(orgId).doc(wamid),
      {
        direction: 'out',
        kind: 'chat',
        patient_id: patient.id,
        to: patient.phone,
        type: 'text',
        text: body,
        sent_by: user.uid,
        sent_by_name: user.name || user.email,
        created_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    const pending = await this.messages(orgId).where('from', '==', patient.phone).select('direction', 'handled').get();
    for (const doc of pending.docs) {
      if (doc.get('direction') === 'in' && !doc.get('handled')) {
        batch.update(doc.ref, { handled: true, handled_at: FieldValue.serverTimestamp(), handled_by: user.uid });
      }
    }
    // La clínica tomó la conversación: el asistente con IA no le responde por unas horas
    batch.set(
      this.firebase.db.collection(COL.organizations).doc(orgId).collection(COL.waContacts).doc(patient.phone),
      { assistant_paused_until: Timestamp.fromMillis(Date.now() + ASSISTANT_PAUSE_HOURS * 3_600_000) },
      { merge: true },
    );
    await batch.commit();
    return this.conversation(orgId, patientId);
  }
}
