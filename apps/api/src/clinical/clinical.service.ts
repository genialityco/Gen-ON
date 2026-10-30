import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import {
  BACKGROUND_FIELDS,
  canWriteClinical,
  isYmd,
  patientFullName,
  type ClinicalAccess,
  type ClinicalAccessAction,
  type ClinicalBackground,
  type ClinicalNote,
  type ClinicalNoteInput,
  type ClinicalView,
  type Role,
} from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL, isoOrNull } from '../common/firestore';
import { AuthUser } from '../auth/decorators';
import { PatientsService } from '../patients/patients.service';

const ACCESS_LOG_LIMIT = 200;

const emptyBackground = (): ClinicalBackground =>
  Object.fromEntries(BACKGROUND_FIELDS.map((f) => [f.key, null])) as ClinicalBackground;

/**
 * Ficha clínica de seguimiento. Las notas no se editan ni se borran (una
 * corrección es una aclaración); los antecedentes guardan su versión
 * anterior en history. Cada consulta y cada cambio queda en clinical_access.
 */
@Injectable()
export class ClinicalService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly patients: PatientsService,
  ) {}

  private org(orgId: string) {
    return this.firebase.db.collection(COL.organizations).doc(orgId);
  }

  private recordRef(orgId: string, patientId: string) {
    return this.org(orgId).collection(COL.clinicalRecords).doc(patientId);
  }

  private notes(orgId: string) {
    return this.org(orgId).collection(COL.clinicalNotes);
  }

  private access(orgId: string) {
    return this.org(orgId).collection(COL.clinicalAccess);
  }

  private toNote(id: string, d: FirebaseFirestore.DocumentData): ClinicalNote {
    return {
      id,
      patient_id: d.patient_id,
      kind: d.kind,
      date: d.date,
      body: d.body,
      procedure: d.procedure ?? null,
      amends: d.amends ?? null,
      author_uid: d.author_uid,
      author_name: d.author_name,
      author_role: d.author_role,
      created_at: isoOrNull(d.created_at),
    };
  }

  async view(orgId: string, patientId: string, user: AuthUser, role: Role): Promise<ClinicalView> {
    const patient = await this.patients.get(orgId, patientId);
    await this.log(orgId, patient, user, role, 'view');
    return this.load(orgId, patientId, role);
  }

  private async load(orgId: string, patientId: string, role: Role): Promise<ClinicalView> {
    const [record, notes] = await Promise.all([
      this.recordRef(orgId, patientId).get(),
      this.notes(orgId).where('patient_id', '==', patientId).get(),
    ]);
    const r = record.data();
    return {
      record: {
        patient_id: patientId,
        background: { ...emptyBackground(), ...(r?.background ?? {}) },
        updated_at: isoOrNull(r?.updated_at),
        updated_by_name: r?.updated_by_name ?? null,
      },
      notes: notes.docs
        .map((d) => this.toNote(d.id, d.data()))
        .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at ?? '').localeCompare(a.created_at ?? '')),
      can_write: canWriteClinical(role),
    };
  }

  async updateBackground(orgId: string, patientId: string, input: Partial<ClinicalBackground>, user: AuthUser, role: Role) {
    const patient = await this.patients.get(orgId, patientId);
    const ref = this.recordRef(orgId, patientId);
    const author = await this.authorName(orgId, user);
    const background = emptyBackground();
    for (const { key } of BACKGROUND_FIELDS) {
      const v = input[key];
      if (v !== undefined && v !== null && typeof v !== 'string') throw new BadRequestException('Antecedentes inválidos');
      background[key] = v?.trim() || null;
    }

    await this.firebase.db.runTransaction(async (tx) => {
      const prev = await tx.get(ref);
      // La versión anterior se conserva: los antecedentes no se pierden al editar
      if (prev.exists) tx.create(ref.collection('history').doc(), { ...prev.data(), archived_at: FieldValue.serverTimestamp() });
      tx.set(ref, {
        patient_id: patientId,
        background,
        updated_at: FieldValue.serverTimestamp(),
        updated_by: user.uid,
        updated_by_name: author,
      });
    });
    await this.log(orgId, patient, user, role, 'update_background');
    return this.load(orgId, patientId, role);
  }

  async addNote(orgId: string, patientId: string, input: ClinicalNoteInput, user: AuthUser, role: Role) {
    const patient = await this.patients.get(orgId, patientId);
    if (!isYmd(input.date)) throw new BadRequestException('Fecha inválida');
    const body = input.body?.trim();
    if (!body) throw new BadRequestException('La nota está vacía');

    let amends: string | null = null;
    if (input.kind === 'addendum') {
      if (!input.amends) throw new BadRequestException('Una aclaración debe indicar la nota que aclara');
      const original = await this.notes(orgId).doc(input.amends).get();
      if (!original.exists || original.get('patient_id') !== patientId) throw new NotFoundException('Nota no encontrada');
      if (original.get('kind') === 'addendum') throw new BadRequestException('Aclara la nota original, no otra aclaración');
      amends = original.id;
    }

    let procedure = null;
    if (input.kind === 'procedure') {
      const p = input.procedure;
      if (!p?.name?.trim()) throw new BadRequestException('Indica el procedimiento');
      const opt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);
      procedure = { name: p.name.trim().slice(0, 120), area: opt(p.area), product: opt(p.product), lot: opt(p.lot), quantity: opt(p.quantity) };
    }

    const ref = this.notes(orgId).doc();
    await ref.create({
      patient_id: patientId,
      kind: input.kind,
      date: input.date,
      body,
      procedure,
      amends,
      author_uid: user.uid,
      author_name: await this.authorName(orgId, user),
      author_email: user.email,
      author_role: role,
      created_at: FieldValue.serverTimestamp(),
    });
    await this.log(orgId, patient, user, role, 'add_note');
    return this.toNote(ref.id, (await ref.get()).data()!);
  }

  async accessLog(orgId: string, patientId: string): Promise<ClinicalAccess[]> {
    const snap = await this.access(orgId).where('patient_id', '==', patientId).get();
    return snap.docs
      .map((d) => ({
        id: d.id,
        patient_id: d.get('patient_id'),
        uid: d.get('uid'),
        email: d.get('email') ?? null,
        name: d.get('name') ?? null,
        role: d.get('role'),
        action: d.get('action'),
        at: isoOrNull(d.get('at')),
      }))
      .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
      .slice(0, ACCESS_LOG_LIMIT);
  }

  private async log(
    orgId: string,
    patient: { id: string; first_name: string; last_name: string },
    user: AuthUser,
    role: Role,
    action: ClinicalAccessAction,
  ) {
    await this.access(orgId).add({
      patient_id: patient.id,
      patient_name: patientFullName(patient),
      uid: user.uid,
      email: user.email,
      name: user.name,
      role,
      action,
      at: FieldValue.serverTimestamp(),
    });
  }

  /** Nombre con el que firma: el del equipo de la clínica, o el de la cuenta. */
  private async authorName(orgId: string, user: AuthUser): Promise<string> {
    const member = await this.org(orgId).collection(COL.members).doc(user.uid).get();
    return member.get('name') || user.name || user.email || user.uid;
  }
}
