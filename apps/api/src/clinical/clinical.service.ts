import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import {
  BACKGROUND_FIELDS,
  GUIDANCE_MAX_LENGTH,
  canWriteClinical,
  hasGuidance,
  isYmd,
  normalizePatientPhone,
  patientFullName,
  type ClinicalAccess,
  type ClinicalAccessAction,
  type ClinicalBackground,
  type ClinicalImportInput,
  type ClinicalImportResult,
  type ClinicalNote,
  type ClinicalNoteInput,
  type ClinicalView,
  type PatientGuidance,
  type Role,
} from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL, isoOrNull } from '../common/firestore';
import { AuthUser } from '../auth/decorators';
import { PatientsService } from '../patients/patients.service';

const ACCESS_LOG_LIMIT = 200;

const emptyBackground = (): ClinicalBackground =>
  Object.fromEntries(BACKGROUND_FIELDS.map((f) => [f.key, null])) as ClinicalBackground;

/** Documento comparable: sin puntos, espacios ni guiones, en mayúsculas. */
const normalizeDocument = (v: string) => String(v ?? '').replace(/[^0-9a-z]/gi, '').toUpperCase();

/** Indicaciones para el paciente: textos recortados y fecha válida; null si viene vacío. */
function cleanGuidance(g: PatientGuidance | null | undefined): PatientGuidance | null {
  if (!g) return null;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, GUIDANCE_MAX_LENGTH) : null);
  if (g.next_control && !isYmd(g.next_control)) throw new BadRequestException('Fecha de próximo control inválida');
  const out: PatientGuidance = {
    instructions: text(g.instructions),
    medications: text(g.medications),
    restrictions: text(g.restrictions),
    warning_signs: text(g.warning_signs),
    next_control: g.next_control || null,
  };
  return hasGuidance(out) ? out : null;
}

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
      guidance: d.guidance ?? null,
      share_with_assistant: !!d.share_with_assistant,
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

    const guidance = cleanGuidance(input.guidance);
    const ref = this.notes(orgId).doc();
    await ref.create({
      patient_id: patientId,
      kind: input.kind,
      date: input.date,
      body,
      procedure,
      amends,
      guidance,
      // Por defecto lo que se escribió para el paciente se le puede compartir
      share_with_assistant: !!guidance && input.share_with_assistant !== false,
      author_uid: user.uid,
      author_name: await this.authorName(orgId, user),
      author_email: user.email,
      author_role: role,
      created_at: FieldValue.serverTimestamp(),
    });
    await this.log(orgId, patient, user, role, 'add_note');
    return this.toNote(ref.id, (await ref.get()).data()!);
  }

  /**
   * Importación de fichas desde Excel. Cada fila busca al paciente por celular
   * o documento; los antecedentes que vienen reemplazan solo esos campos
   * (guardando la versión anterior) y, si la fila trae contenido, se crea una
   * nota. Las filas con error no detienen las demás.
   */
  async importMany(orgId: string, input: ClinicalImportInput, user: AuthUser, role: Role): Promise<ClinicalImportResult> {
    const [patients, author] = await Promise.all([
      this.org(orgId).collection(COL.patients).select('first_name', 'last_name', 'phone', 'document').get(),
      this.authorName(orgId, user),
    ]);
    const byPhone = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    const byDocument = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const p of patients.docs) {
      byPhone.set(p.get('phone'), p);
      if (p.get('document')) byDocument.set(normalizeDocument(p.get('document')), p);
    }
    const source = input.source?.trim().slice(0, 120) || 'archivo';

    const rows: ClinicalImportResult['rows'] = [];
    const notes: Record<string, unknown>[] = [];
    const backgrounds = new Map<string, Partial<ClinicalBackground>>();
    const touched = new Map<string, { patient: FirebaseFirestore.QueryDocumentSnapshot; note: boolean; background: boolean }>();

    for (const [index, row] of input.rows.entries()) {
      try {
        const ref = String(row.patient ?? '').trim();
        const phone = normalizePatientPhone(ref);
        const patient = (phone && byPhone.get(phone)) || byDocument.get(normalizeDocument(ref));
        if (!patient) throw new BadRequestException(`No hay un paciente con celular o documento "${ref}"`);

        const bg: Partial<ClinicalBackground> = {};
        for (const { key } of BACKGROUND_FIELDS) {
          const v = row.background?.[key];
          if (typeof v === 'string' && v.trim()) bg[key] = v.trim().slice(0, 2000);
        }
        const guidance = cleanGuidance({ instructions: null, medications: null, restrictions: null, warning_signs: null, next_control: null, ...row.guidance });
        const procedureName = row.procedure?.trim().slice(0, 120) || null;
        const body = row.body?.trim().slice(0, 10000) || null;
        const wantsNote = !!(body || guidance || procedureName);
        if (!wantsNote && !Object.keys(bg).length) throw new BadRequestException('La fila no trae antecedentes ni nota');

        if (wantsNote) {
          if (!row.date || !isYmd(row.date)) throw new BadRequestException('Falta la fecha de la atención (o es inválida)');
          const kind = row.kind ?? (procedureName ? 'procedure' : 'control');
          if (!['evolution', 'procedure', 'control'].includes(kind)) throw new BadRequestException('Tipo de nota inválido');
          if (kind === 'procedure' && !procedureName) throw new BadRequestException('Una nota de procedimiento necesita el procedimiento');
          notes.push({
            patient_id: patient.id,
            kind,
            date: row.date,
            body: body || `Importado desde Excel (${source})`,
            procedure: procedureName
              ? { name: procedureName, area: row.area?.trim().slice(0, 120) || null, product: null, lot: null, quantity: null }
              : null,
            amends: null,
            guidance,
            share_with_assistant: !!guidance && row.share_with_assistant !== false,
            author_uid: user.uid,
            author_name: author,
            author_email: user.email,
            author_role: role,
            imported_from: source,
            created_at: FieldValue.serverTimestamp(),
          });
        }
        if (Object.keys(bg).length) backgrounds.set(patient.id, { ...backgrounds.get(patient.id), ...bg });
        const t = touched.get(patient.id) ?? { patient, note: false, background: false };
        touched.set(patient.id, { patient, note: t.note || wantsNote, background: t.background || !!Object.keys(bg).length });
        rows.push({ index, status: 'ok', message: null });
      } catch (e) {
        rows.push({ index, status: 'error', message: (e as Error).message });
      }
    }

    for (let i = 0; i < notes.length; i += 400) {
      const batch = this.firebase.db.batch();
      for (const n of notes.slice(i, i + 400)) batch.create(this.notes(orgId).doc(), n);
      await batch.commit();
    }
    // Antecedentes: solo los campos que trae el archivo, con la versión anterior en history
    for (const [patientId, bg] of backgrounds) {
      const ref = this.recordRef(orgId, patientId);
      await this.firebase.db.runTransaction(async (tx) => {
        const prev = await tx.get(ref);
        if (prev.exists) tx.create(ref.collection('history').doc(), { ...prev.data(), archived_at: FieldValue.serverTimestamp() });
        tx.set(ref, {
          patient_id: patientId,
          background: { ...emptyBackground(), ...(prev.get('background') ?? {}), ...bg },
          updated_at: FieldValue.serverTimestamp(),
          updated_by: user.uid,
          updated_by_name: author,
          imported_from: source,
        });
      });
    }
    for (const { patient, note, background } of touched.values()) {
      const p = { id: patient.id, first_name: patient.get('first_name'), last_name: patient.get('last_name') };
      if (background) await this.log(orgId, p, user, role, 'update_background');
      if (note) await this.log(orgId, p, user, role, 'add_note');
    }

    const errors = rows.filter((r) => r.status === 'error').length;
    return { notes: notes.length, backgrounds: backgrounds.size, errors, rows };
  }

  /**
   * Lo que el asistente con IA puede usar de la ficha: alergias y medicamentos
   * que toma, y las indicaciones para el paciente de las notas compartidas
   * (nunca el texto interno de las notas). Queda en el registro de accesos.
   */
  async forAssistant(orgId: string, patient: { id: string; first_name: string; last_name: string }, sinceYmd: string) {
    const [record, notes] = await Promise.all([
      this.recordRef(orgId, patient.id).get(),
      this.notes(orgId).where('patient_id', '==', patient.id).get(),
    ]);
    const background = record.get('background') ?? {};
    const all = notes.docs.map((d) => this.toNote(d.id, d.data()));
    const byId = new Map(all.map((n) => [n.id, n]));
    const shared = all
      .filter((n) => n.share_with_assistant && hasGuidance(n.guidance) && n.date >= sinceYmd)
      .sort((a, b) => `${a.date}${a.created_at}`.localeCompare(`${b.date}${b.created_at}`))
      .map((n) => ({
        date: n.date,
        kind: n.kind,
        // Una aclaración muestra el procedimiento de la nota que aclara
        procedure: n.procedure?.name ?? (n.amends ? byId.get(n.amends)?.procedure?.name ?? null : null),
        area: n.procedure?.area ?? null,
        author: n.author_name,
        guidance: n.guidance!,
      }));
    await this.access(orgId).add({
      patient_id: patient.id,
      patient_name: patientFullName(patient),
      uid: 'assistant',
      email: null,
      name: 'Asistente IA',
      role: 'assistant',
      action: 'assistant',
      at: FieldValue.serverTimestamp(),
    });
    return {
      allergies: (background.allergies as string | null) ?? null,
      medications: (background.medications as string | null) ?? null,
      notes: shared,
    };
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
