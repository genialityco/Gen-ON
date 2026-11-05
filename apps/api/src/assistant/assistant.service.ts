import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  ASSISTANT_DAILY_LIMIT,
  ASSISTANT_PAUSE_HOURS,
  KNOWLEDGE_MAX_ENTRIES,
  formatLongDate,
  formatTime12,
  hasFeature,
  localDate,
  localTime,
  type AssistantReply,
  type AssistantSettingsInput,
  type KnowledgeEntry,
  type KnowledgeInput,
  type Organization,
  type Patient,
} from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL, isoOrNull } from '../common/firestore';
import { AuthUser } from '../auth/decorators';
import { OrganizationsService } from '../organizations/organizations.service';
import { MetaGraphClient } from '../meta/graph.client';
import { MetaConnectionStore } from '../meta/meta-connection.store';
import { PatientsService } from '../patients/patients.service';
import { AlertNotifierService } from '../patients/alert-notifier.service';
import { GeminiClient, type GeminiTurn } from './gemini.client';
import { REPLY_SCHEMA, conversationTurns, systemPrompt, type PromptPatient } from './prompt';

const HISTORY_MS = 24 * 3_600_000;
const HISTORY_TURNS = 20;

type ModelReply = AssistantReply & { urgent?: boolean };

/**
 * Asistente con IA del plan IA Oráculo. Cuando un paciente escribe, espera
 * unos segundos (por si manda varios mensajes seguidos), arma el contexto
 * (clínica, contenido aprobado, su cita) y responde por WhatsApp. Si el
 * modelo decide pasar a una persona, avisa al equipo y se pausa para ese
 * número; también se pausa cuando alguien de la clínica le escribe.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  /** Espera antes de responder para juntar mensajes seguidos (0 en pruebas). */
  debounceMs = 4000;

  constructor(
    private readonly firebase: FirebaseService,
    private readonly orgs: OrganizationsService,
    private readonly patients: PatientsService,
    private readonly notifier: AlertNotifierService,
    private readonly store: MetaConnectionStore,
    private readonly graph: MetaGraphClient,
    private readonly gemini: GeminiClient,
  ) {}

  private ref(orgId: string) {
    return this.firebase.db.collection(COL.organizations).doc(orgId);
  }

  private knowledgeCol(orgId: string) {
    return this.ref(orgId).collection(COL.assistantKnowledge);
  }

  // ---- Configuración y contenido ----

  async updateSettings(orgId: string, input: AssistantSettingsInput): Promise<Organization> {
    const org = await this.orgs.withFeature(orgId, 'ai_assistant');
    const next = { ...org.assistant };
    if (input.enabled !== undefined) next.enabled = input.enabled;
    if (input.instructions !== undefined) next.instructions = input.instructions.trim();
    if (input.handoff_message !== undefined) {
      if (input.handoff_message.trim().length < 10) throw new BadRequestException('El mensaje de transferencia es muy corto');
      next.handoff_message = input.handoff_message.trim();
    }
    if (next.enabled && !this.gemini.configured) throw new BadRequestException('El asistente no está disponible: falta configurar la IA en el servidor');
    await this.ref(orgId).update({ assistant: next, updated_at: FieldValue.serverTimestamp() });
    return this.orgs.get(orgId);
  }

  private toEntry(id: string, d: FirebaseFirestore.DocumentData): KnowledgeEntry {
    return {
      id,
      title: d.title,
      content: d.content,
      approved: !!d.approved,
      approved_by_name: d.approved_by_name ?? null,
      approved_at: isoOrNull(d.approved_at),
      updated_at: isoOrNull(d.updated_at),
    };
  }

  async listKnowledge(orgId: string): Promise<KnowledgeEntry[]> {
    const snap = await this.knowledgeCol(orgId).get();
    return snap.docs.map((d) => this.toEntry(d.id, d.data())).sort((a, b) => a.title.localeCompare(b.title));
  }

  /** Guarda una entrada; al marcarla aprobada queda quién la aprobó (editarla exige aprobarla de nuevo). */
  async saveKnowledge(orgId: string, id: string | null, input: KnowledgeInput, user: AuthUser): Promise<KnowledgeEntry> {
    await this.orgs.withFeature(orgId, 'ai_assistant');
    const ref = id ? this.knowledgeCol(orgId).doc(id) : this.knowledgeCol(orgId).doc();
    const prev = id ? (await ref.get()).data() : null;
    if (id && !prev) throw new NotFoundException('Contenido no encontrado');
    if (!id && (await this.knowledgeCol(orgId).count().get()).data().count >= KNOWLEDGE_MAX_ENTRIES) {
      throw new BadRequestException(`Máximo ${KNOWLEDGE_MAX_ENTRIES} temas`);
    }
    const title = input.title.trim();
    const content = input.content.trim();
    const changed = !prev || prev.title !== title || prev.content !== content;
    const approved = input.approved;
    await ref.set(
      {
        title,
        content,
        approved,
        ...(approved && (changed || !prev?.approved)
          ? { approved_by: user.uid, approved_by_name: user.name || user.email, approved_at: FieldValue.serverTimestamp() }
          : {}),
        ...(!approved ? { approved_by: null, approved_by_name: null, approved_at: null } : {}),
        updated_by: user.uid,
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return this.toEntry(ref.id, (await ref.get()).data()!);
  }

  async removeKnowledge(orgId: string, id: string) {
    await this.knowledgeCol(orgId).doc(id).delete();
    return { ok: true };
  }

  /** Pregunta de prueba desde la configuración: no envía nada. */
  async test(orgId: string, question: string): Promise<ModelReply> {
    const org = await this.orgs.withFeature(orgId, 'ai_assistant');
    return this.ask(org, [{ role: 'user', text: question }], null);
  }

  // ---- Conversación ----

  /** Mensaje de texto de un paciente (lo llama el webhook sin esperar). */
  async handle(orgId: string, from: string, messageId: string) {
    const org = await this.orgs.get(orgId);
    if (!hasFeature(org.plan, 'ai_assistant') || !org.assistant.enabled || org.status !== 'active' || !this.gemini.configured) return;

    if (this.debounceMs) await new Promise((r) => setTimeout(r, this.debounceMs));
    const now = new Date();
    const contactRef = this.ref(orgId).collection(COL.waContacts).doc(from);
    const contact = (await contactRef.get()).data() ?? {};
    const pausedUntil = (contact.assistant_paused_until as Timestamp | undefined)?.toMillis() ?? 0;
    if (pausedUntil > now.getTime()) return;

    const history = await this.history(orgId, from, now);
    // Si llegó otro mensaje después de este, responde ese (con todo el historial)
    if (history.lastInboundId && history.lastInboundId !== messageId) return;

    const patient = await this.patients.findByPhone(orgId, from);
    if (patient?.opted_out) return;

    const today = localDate(now, org.timezone);
    const count = contact.assistant_day === today ? (contact.assistant_count ?? 0) : 0;
    let decision: ModelReply;
    if (count >= ASSISTANT_DAILY_LIMIT) {
      decision = { reply: '', handoff: true, reason: `Más de ${ASSISTANT_DAILY_LIMIT} respuestas del asistente hoy` };
    } else {
      try {
        decision = await this.ask(org, history.turns, await this.patientContext(orgId, org, patient));
      } catch (e) {
        // Sin respuesta de la IA el mensaje sigue en "Requiere atención"
        this.logger.error(`Asistente ${orgId} → ${from}: ${(e as Error).message}`);
        return;
      }
    }

    const text = decision.reply?.trim() || (decision.handoff ? org.assistant.handoff_message : '');
    if (text) await this.send(org, from, text, patient?.id ?? null);

    const batch = this.firebase.db.batch();
    batch.set(contactRef, { assistant_day: today, assistant_count: count + 1 }, { merge: true });
    if (decision.handoff) {
      batch.set(
        contactRef,
        { assistant_paused_until: Timestamp.fromMillis(now.getTime() + ASSISTANT_PAUSE_HOURS * 3_600_000) },
        { merge: true },
      );
      batch.update(this.ref(orgId).collection(COL.messages).doc(messageId), {
        handoff: true,
        handoff_reason: decision.reason || 'Pidió hablar con una persona',
      });
    } else {
      for (const id of history.unhandled) {
        batch.update(this.ref(orgId).collection(COL.messages).doc(id), {
          handled: true,
          handled_at: FieldValue.serverTimestamp(),
          handled_by: 'assistant',
        });
      }
    }
    await batch.commit();

    if (decision.handoff) {
      await this.notifier
        .notify(org, {
          patient: patient ? `${patient.first_name} ${patient.last_name}` : `+${from}`,
          button: history.lastText.slice(0, 80) || 'Mensaje',
          step: `Asistente IA: ${decision.reason || 'pidió una persona'}`,
          level: decision.urgent ? 'urgent' : 'warning',
        })
        .catch((e) => this.logger.warn(`Aviso de transferencia ${orgId}: ${(e as Error).message}`));
    }
  }

  /** Últimas 24 h con ese número, como turnos para el modelo. */
  private async history(orgId: string, phone: string, now: Date) {
    const since = now.getTime() - HISTORY_MS;
    const messages = this.ref(orgId).collection(COL.messages);
    const [incoming, outgoing] = await Promise.all([
      messages.where('from', '==', phone).select('direction', 'text', 'type', 'received_at', 'handled').get(),
      messages.where('to', '==', phone).select('direction', 'kind', 'type', 'text', 'template_key', 'created_at').get(),
    ]);
    const all: { at: number; turn: GeminiTurn; id: string; inbound: boolean; handled: boolean }[] = [];
    for (const doc of incoming.docs) {
      const d = doc.data();
      const at = d.received_at?.toMillis() ?? 0;
      if (d.direction !== 'in' || at < since) continue;
      all.push({ at, id: doc.id, inbound: true, handled: !!d.handled, turn: { role: 'user', text: d.text || `[Envió un mensaje de tipo ${d.type}]` } });
    }
    for (const doc of outgoing.docs) {
      const d = doc.data();
      const at = d.created_at?.toMillis() ?? 0;
      if (d.direction !== 'out' || d.kind === 'staff_alert' || at < since) continue;
      const text = d.type === 'text' ? d.text : `[Mensaje automático de la clínica: ${d.template_key ?? 'plantilla'}]`;
      all.push({ at, id: doc.id, inbound: false, handled: true, turn: { role: 'model', text: text ?? '' } });
    }
    all.sort((a, b) => a.at - b.at);
    const inbound = all.filter((m) => m.inbound);
    const last = inbound[inbound.length - 1];
    return {
      turns: conversationTurns(all.slice(-HISTORY_TURNS).map((m) => m.turn)),
      lastInboundId: last?.id ?? null,
      lastText: last?.turn.text ?? '',
      unhandled: inbound.filter((m) => !m.handled).map((m) => m.id),
    };
  }

  /** Próxima cita y protocolos activos del paciente, en texto. */
  private async patientContext(orgId: string, org: Organization, patient: Patient | null): Promise<PromptPatient | null> {
    if (!patient) return null;
    const now = new Date();
    const nowLocal = `${localDate(now, org.timezone)}${localTime(now, org.timezone)}`;
    const [appts, enrollments] = await Promise.all([
      this.ref(orgId).collection(COL.appointments).where('patient_id', '==', patient.id).get(),
      this.ref(orgId).collection(COL.enrollments).where('patient_id', '==', patient.id).get(),
    ]);
    const context: string[] = [];
    const next = appts.docs
      .map((d) => d.data())
      .filter((a) => a.status === 'scheduled' && `${a.date}${a.time}` >= nowLocal)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
    if (next) {
      context.push(
        `Próxima cita: ${formatLongDate(next.date)}, ${formatTime12(next.time)}${next.reason ? `, ${next.reason}` : ''}${next.professional ? `, con ${next.professional}` : ''}.`,
      );
    } else {
      context.push('No tiene citas próximas agendadas.');
    }
    for (const e of enrollments.docs.map((d) => d.data()).filter((e) => e.status === 'active')) {
      context.push(
        `En seguimiento: ${e.protocol_name}${e.procedure ? ` (${e.procedure})` : ''}, fecha del procedimiento ${formatLongDate(e.reference_date)}.`,
      );
    }
    return { first_name: patient.first_name, context };
  }

  private async ask(org: Organization, turns: GeminiTurn[], patient: PromptPatient | null): Promise<ModelReply> {
    if (!turns.length) throw new Error('No hay mensaje del paciente para responder');
    const knowledge = (await this.listKnowledge(org.id)).filter((k) => k.approved);
    const now = new Date();
    const system = systemPrompt({
      org,
      knowledge,
      patient,
      now: `${formatLongDate(localDate(now, org.timezone))}, ${formatTime12(localTime(now, org.timezone))}`,
    });
    const r = await this.gemini.json<ModelReply>(system, turns, REPLY_SCHEMA);
    return { reply: String(r.reply ?? '').slice(0, 1000), handoff: !!r.handoff, reason: r.reason ? String(r.reason).slice(0, 200) : null, urgent: !!r.urgent };
  }

  private async send(org: Organization, to: string, body: string, patientId: string | null) {
    const [conn, secrets] = await Promise.all([this.store.raw(org.id), this.store.getSecrets(org.id)]);
    if (!conn.phone_number_id || !secrets.access_token) return;
    try {
      const res = await this.graph.post(`/${conn.phone_number_id}/messages`, secrets.access_token, {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body, preview_url: false },
      });
      const wamid = res.messages?.[0]?.id;
      if (!wamid) return;
      await this.ref(org.id)
        .collection(COL.messages)
        .doc(wamid)
        .set({ direction: 'out', kind: 'assistant', patient_id: patientId, to, type: 'text', text: body, created_at: FieldValue.serverTimestamp() }, { merge: true });
    } catch (e) {
      this.logger.warn(`Respuesta del asistente ${org.id} → ${to}: ${(e as Error).message}`);
    }
  }
}
