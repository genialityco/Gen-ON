import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import {
  extractVariables,
  isHhmm,
  isYmd,
  orderedSteps,
  patientFullName,
  type CreateEnrollmentInput,
  type Enrollment,
} from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL, isoOrNull } from '../common/firestore';
import { OrganizationsService } from '../organizations/organizations.service';
import { TemplatesService } from '../templates/templates.service';
import { ProtocolsService } from '../templates/protocols.service';
import { AuthUser } from '../auth/decorators';
import { PatientsService } from './patients.service';
import { OutboxService } from './outbox.service';
import { UsageService } from './usage.service';
import { missingVariables, variableValues } from './variables';

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly orgs: OrganizationsService,
    private readonly patients: PatientsService,
    private readonly protocols: ProtocolsService,
    private readonly templates: TemplatesService,
    private readonly outbox: OutboxService,
    private readonly usage: UsageService,
  ) {}

  col(orgId: string) {
    return this.firebase.db.collection(COL.organizations).doc(orgId).collection(COL.enrollments);
  }

  toEnrollment(id: string, d: FirebaseFirestore.DocumentData): Enrollment {
    return {
      id,
      patient_id: d.patient_id,
      patient_name: d.patient_name,
      protocol_id: d.protocol_id,
      protocol_name: d.protocol_name,
      reference_date: d.reference_date,
      reference_time: d.reference_time ?? null,
      procedure: d.procedure ?? null,
      professional: d.professional ?? null,
      status: d.status,
      created_at: isoOrNull(d.created_at),
      created_by: d.created_by ?? null,
    };
  }

  async get(orgId: string, id: string): Promise<Enrollment & { protocol_procedure: string | null }> {
    const doc = await this.col(orgId).doc(id).get();
    if (!doc.exists) throw new NotFoundException('Inscripción no encontrada');
    return { ...this.toEnrollment(doc.id, doc.data()!), protocol_procedure: doc.get('protocol_procedure') ?? null };
  }

  async listForPatient(orgId: string, patientId: string): Promise<Enrollment[]> {
    const snap = await this.col(orgId).where('patient_id', '==', patientId).get();
    return snap.docs
      .map((d) => this.toEnrollment(d.id, d.data()))
      .sort((a, b) => b.reference_date.localeCompare(a.reference_date));
  }

  /** Protocolos de las inscripciones activas, por paciente (para la lista de pacientes). */
  async activeProtocolsByPatient(orgId: string): Promise<Map<string, { id: string; name: string }[]>> {
    const snap = await this.col(orgId)
      .where('status', '==', 'active')
      .select('patient_id', 'protocol_id', 'protocol_name')
      .get();
    const out = new Map<string, { id: string; name: string }[]>();
    for (const d of snap.docs) {
      const list = out.get(d.get('patient_id')) ?? [];
      if (!list.some((p) => p.id === d.get('protocol_id'))) {
        list.push({ id: d.get('protocol_id'), name: d.get('protocol_name') });
      }
      out.set(d.get('patient_id'), list);
    }
    return out;
  }

  /** Última inscripción activa del paciente (contexto de los envíos manuales). */
  async latestActive(orgId: string, patientId: string) {
    const snap = await this.col(orgId).where('patient_id', '==', patientId).where('status', '==', 'active').get();
    const docs = snap.docs.sort((a, b) => String(b.get('reference_date')).localeCompare(String(a.get('reference_date'))));
    return docs[0] ? { ...this.toEnrollment(docs[0].id, docs[0].data()), protocol_procedure: docs[0].get('protocol_procedure') ?? null } : null;
  }

  /**
   * Inscribe al paciente: guarda la inscripción, arma su parrilla y lo cuenta
   * como paciente nuevo del mes. Falla si a algún mensaje le faltarían datos
   * (p. ej. el protocolo usa {{hora}} y no se indicó la hora).
   */
  async create(orgId: string, patientId: string, input: CreateEnrollmentInput, user: AuthUser) {
    const [org, patient, protocol] = await Promise.all([
      this.orgs.get(orgId),
      this.patients.get(orgId, patientId),
      this.protocols.get({ orgId }, input.protocol_id),
    ]);
    if (patient.opted_out) throw new BadRequestException('El paciente se dio de baja de los mensajes');
    if (!patient.consent) throw new BadRequestException('El paciente no tiene autorización de datos registrada');
    if (!protocol.active) throw new BadRequestException('El protocolo está desactivado');
    if (!isYmd(input.reference_date)) throw new BadRequestException('Fecha inválida');
    if (input.reference_time && !isHhmm(input.reference_time)) throw new BadRequestException('Hora inválida');

    const steps = orderedSteps(protocol.steps, org.default_send_time);
    if (!steps.length) throw new BadRequestException('El protocolo no tiene pasos activos');

    const data = {
      patient_id: patient.id,
      patient_name: patientFullName(patient),
      protocol_id: protocol.id,
      protocol_name: protocol.name,
      protocol_procedure: protocol.procedure,
      reference_date: input.reference_date,
      reference_time: input.reference_time || null,
      procedure: input.procedure?.trim() || null,
      professional: input.professional?.trim() || null,
      status: 'active' as const,
      created_by: user.uid,
    };

    // Datos que piden las plantillas del protocolo
    const values = variableValues({ org, patient, enrollment: data });
    const warnings: string[] = [];
    const used = new Set<string>();
    for (const key of new Set(steps.map((s) => s.template_key))) {
      const t = await this.templates.byKey({ orgId }, key);
      if (!t) throw new BadRequestException(`La plantilla "${key}" del protocolo no existe`);
      for (const v of extractVariables(t.approved?.body ?? t.body)) used.add(v);
      if (!t.approved) warnings.push(`"${t.label}" aún no está aprobada en Meta: no saldrá hasta que se apruebe.`);
    }
    const missing = missingVariables([...used], values);
    if (missing.length) {
      throw new BadRequestException(`Los mensajes de este protocolo necesitan: ${missing.join(', ')}.`);
    }

    const ref = this.col(orgId).doc();
    const batch = this.firebase.db.batch();
    batch.set(ref, { ...data, created_at: FieldValue.serverTimestamp() });
    const scheduled = this.outbox.planEnrollment(
      batch,
      org,
      { ...data, id: ref.id, created_by: user.uid },
      protocol,
      patient.phone,
      user.uid,
    );
    await batch.commit();
    await this.usage.countPatient(orgId, patient.id, this.usage.monthOf(new Date(), org.timezone));

    return { enrollment: (await this.get(orgId, ref.id)) as Enrollment, scheduled, warnings };
  }

  async cancel(orgId: string, id: string): Promise<Enrollment> {
    const e = await this.get(orgId, id);
    if (e.status === 'active') {
      await this.col(orgId).doc(id).update({ status: 'cancelled', cancelled_at: FieldValue.serverTimestamp() });
      await this.outbox.cancelPending(orgId, 'enrollment_id', id, 'Inscripción cancelada');
    }
    return this.get(orgId, id);
  }

  /** Terminada cuando ya no le queda nada programado. */
  async completeIfDone(orgId: string, id: string) {
    const ref = this.col(orgId).doc(id);
    if ((await ref.get()).get('status') !== 'active') return;
    // Pocos envíos por inscripción: se filtra aquí y no hace falta índice compuesto
    const items = await this.outbox.col(orgId).where('enrollment_id', '==', id).select('status').get();
    if (!items.docs.some((d) => ['scheduled', 'sending'].includes(d.get('status')))) {
      await ref.update({ status: 'completed', completed_at: FieldValue.serverTimestamp() });
    }
  }
}
