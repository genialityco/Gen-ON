import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import {
  normalizePatientPhone,
  patientFullName,
  type ConsentMethod,
  type Patient,
  type PatientInput,
} from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL, isoOrNull } from '../common/firestore';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuthUser } from '../auth/decorators';
import { OutboxService } from './outbox.service';

const searchName = (p: { first_name: string; last_name: string }) =>
  patientFullName(p)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

@Injectable()
export class PatientsService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly orgs: OrganizationsService,
    private readonly outbox: OutboxService,
  ) {}

  col(orgId: string) {
    return this.firebase.db.collection(COL.organizations).doc(orgId).collection(COL.patients);
  }

  toPatient(id: string, d: FirebaseFirestore.DocumentData): Patient {
    return {
      id,
      first_name: d.first_name,
      last_name: d.last_name,
      phone: d.phone,
      document: d.document ?? null,
      email: d.email ?? null,
      notes: d.notes ?? null,
      consent: d.consent ? { ...d.consent, granted_at: isoOrNull(d.consent.granted_at) } : null,
      opted_out: !!d.opted_out,
      opted_out_at: isoOrNull(d.opted_out_at),
      created_at: isoOrNull(d.created_at),
      updated_at: isoOrNull(d.updated_at),
    };
  }

  async list(orgId: string): Promise<Patient[]> {
    const snap = await this.col(orgId).orderBy('search_name').limit(1000).get();
    return snap.docs.map((d) => this.toPatient(d.id, d.data()));
  }

  async get(orgId: string, id: string): Promise<Patient> {
    const doc = await this.col(orgId).doc(id).get();
    if (!doc.exists) throw new NotFoundException('Paciente no encontrado');
    return this.toPatient(doc.id, doc.data()!);
  }

  private clean(input: PatientInput) {
    const phone = normalizePatientPhone(input.phone);
    if (!phone) throw new BadRequestException('Celular inválido: 10 dígitos (3xx) o con indicativo del país');
    const data = {
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
      phone,
      document: input.document?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      notes: input.notes?.trim() || null,
    };
    return { ...data, search_name: searchName(data) };
  }

  private async assertPhoneFree(orgId: string, phone: string, exceptId?: string) {
    const snap = await this.col(orgId).where('phone', '==', phone).limit(2).get();
    const other = snap.docs.find((d) => d.id !== exceptId);
    if (other) {
      throw new ConflictException(`Ya hay un paciente con ese celular: ${other.get('first_name')} ${other.get('last_name')}`);
    }
  }

  /** Crea el paciente con su autorización de datos (texto y versión vigentes de la clínica). */
  async create(
    orgId: string,
    input: PatientInput,
    consent: { method: ConsentMethod; note?: string | null },
    user: AuthUser,
  ): Promise<Patient> {
    const org = await this.orgs.get(orgId);
    const data = this.clean(input);
    await this.assertPhoneFree(orgId, data.phone);
    const ref = this.col(orgId).doc();
    await ref.set({
      ...data,
      consent: {
        method: consent.method,
        text: org.consent_text.replace(/\{\{\s*clinica\s*\}\}/g, org.name),
        version: org.consent_version,
        granted_at: FieldValue.serverTimestamp(),
        registered_by: user.uid,
        registered_by_name: user.name || user.email,
        note: consent.note?.trim() || null,
      },
      opted_out: false,
      opted_out_at: null,
      created_by: user.uid,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    return this.get(orgId, ref.id);
  }

  async update(orgId: string, id: string, input: PatientInput): Promise<Patient> {
    await this.get(orgId, id);
    const data = this.clean(input);
    await this.assertPhoneFree(orgId, data.phone, id);
    await this.col(orgId).doc(id).update({ ...data, updated_at: FieldValue.serverTimestamp() });
    return this.get(orgId, id);
  }

  /** Baja: no recibe más mensajes y se cancela lo pendiente. */
  async optOut(orgId: string, id: string, reason: string): Promise<Patient> {
    const p = await this.get(orgId, id);
    if (!p.opted_out) {
      await this.col(orgId).doc(id).update({
        opted_out: true,
        opted_out_at: FieldValue.serverTimestamp(),
        opted_out_reason: reason,
      });
      await this.outbox.cancelPending(orgId, 'patient_id', id, 'El paciente se dio de baja');
      const enrollments = await this.firebase.db
        .collection(COL.organizations)
        .doc(orgId)
        .collection(COL.enrollments)
        .where('patient_id', '==', id)
        .where('status', '==', 'active')
        .get();
      for (const e of enrollments.docs) await e.ref.update({ status: 'cancelled' });
    }
    return this.get(orgId, id);
  }
}
