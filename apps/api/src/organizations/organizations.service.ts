import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import { DEFAULT_CONSENT_TEXT, type Member, type OrgRole, type Organization } from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL, isoOrNull } from '../common/firestore';
import { AuthUser } from '../auth/decorators';
import { MembershipsService } from '../auth/memberships.service';
import { AddMemberDto, CreateOrganizationDto, OrganizationSettingsDto, UpdateOrganizationDto } from './dto';

const DEFAULT_TIMEZONE = 'America/Bogota';
const DEFAULT_SEND_TIME = '09:00';
const DEFAULT_BLOCKED_WEEKDAYS = [0];

function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly memberships: MembershipsService,
  ) {}

  private get orgs() {
    return this.firebase.db.collection(COL.organizations);
  }

  private toOrganization(id: string, d: FirebaseFirestore.DocumentData): Organization {
    return {
      id,
      name: d.name,
      kind: d.kind,
      plan: d.plan,
      status: d.status,
      timezone: d.timezone ?? DEFAULT_TIMEZONE,
      legal_name: d.legal_name ?? null,
      nit: d.nit ?? null,
      website: d.website ?? null,
      contact_name: d.contact_name ?? null,
      contact_email: d.contact_email ?? null,
      contact_phone: d.contact_phone ?? null,
      address: d.address ?? null,
      city: d.city ?? null,
      default_send_time: d.default_send_time ?? DEFAULT_SEND_TIME,
      blocked_weekdays: d.blocked_weekdays ?? DEFAULT_BLOCKED_WEEKDAYS,
      consent_text: d.consent_text ?? DEFAULT_CONSENT_TEXT,
      consent_version: d.consent_version ?? 1,
      created_at: isoOrNull(d.created_at),
      updated_at: isoOrNull(d.updated_at),
    };
  }

  /** El superadmin ve todas; el equipo Gen.iality, las que tiene asignadas. */
  async list(user: AuthUser): Promise<Organization[]> {
    const snap = await this.orgs.orderBy('name').get();
    const all = snap.docs.map((d) => this.toOrganization(d.id, d.data()));
    if (user.role === 'superadmin') return all;
    const mine = new Set((await this.memberships.forUser(user.uid)).map((m) => m.org_id));
    return all.filter((o) => mine.has(o.id));
  }

  async get(orgId: string): Promise<Organization> {
    const doc = await this.orgs.doc(orgId).get();
    if (!doc.exists) throw new NotFoundException('Organización no encontrada');
    return this.toOrganization(doc.id, doc.data()!);
  }

  async create(input: CreateOrganizationDto, createdBy: string): Promise<Organization> {
    const timezone = input.timezone || DEFAULT_TIMEZONE;
    if (!isValidTimezone(timezone)) throw new BadRequestException('Zona horaria inválida');
    const ref = this.orgs.doc();
    await ref.set({
      name: input.name.trim(),
      kind: input.kind,
      plan: input.plan,
      status: 'setup',
      timezone,
      created_by: createdBy,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    return this.get(ref.id);
  }

  async update(orgId: string, input: UpdateOrganizationDto): Promise<Organization> {
    await this.get(orgId);
    if (input.timezone && !isValidTimezone(input.timezone)) {
      throw new BadRequestException('Zona horaria inválida');
    }
    await this.orgs.doc(orgId).update({ ...input, updated_at: FieldValue.serverTimestamp() });
    return this.get(orgId);
  }

  /** Si cambia el texto de autorización sube la versión (las ya dadas guardan su texto). */
  async updateSettings(orgId: string, input: OrganizationSettingsDto): Promise<Organization> {
    const org = await this.get(orgId);
    const patch: Record<string, unknown> = { updated_at: FieldValue.serverTimestamp() };
    if (input.default_send_time) patch.default_send_time = input.default_send_time;
    if (input.blocked_weekdays) {
      const days = [...new Set(input.blocked_weekdays)].sort();
      if (days.length > 5) throw new BadRequestException('Deja al menos dos días con envíos');
      patch.blocked_weekdays = days;
    }
    if (input.consent_text !== undefined) {
      const text = input.consent_text.trim();
      if (text.length < 40) throw new BadRequestException('El texto de autorización es muy corto');
      if (text !== org.consent_text) {
        patch.consent_text = text;
        patch.consent_version = org.consent_version + 1;
      }
    }
    await this.orgs.doc(orgId).update(patch);
    return this.get(orgId);
  }

  /** Datos de empresa del paso 1 del asistente de Meta. */
  async updateCompany(orgId: string, data: Record<string, string>) {
    await this.orgs.doc(orgId).update({ ...data, updated_at: FieldValue.serverTimestamp() });
  }

  // ---- Equipo de la organización ----

  async listMembers(orgId: string): Promise<Member[]> {
    await this.get(orgId);
    const snap = await this.orgs.doc(orgId).collection(COL.members).orderBy('email').get();
    return snap.docs.map((d) => {
      const m = d.data();
      return {
        uid: d.id,
        email: m.email,
        name: m.name ?? null,
        role: m.role,
        created_at: isoOrNull(m.created_at),
      };
    });
  }

  /**
   * Agrega a alguien al equipo de la clínica. Crea la cuenta de Firebase Auth
   * si no existe (sin contraseña: el frontend le envía el correo para
   * definirla). Una persona puede estar en varias organizaciones, con un rol
   * en cada una.
   */
  async addMember(orgId: string, input: AddMemberDto): Promise<Member> {
    await this.get(orgId);
    const email = input.email.trim().toLowerCase();
    const auth = this.firebase.auth;

    let user = await auth.getUserByEmail(email).catch(() => null);
    if (user?.customClaims?.role) {
      throw new ConflictException('Ese correo es del equipo Gen.iality: su acceso lo gestiona el superadmin');
    }
    if (!user) user = await auth.createUser({ email, displayName: input.name || undefined });

    const name = input.name?.trim() || user.displayName || null;
    await this.memberships.set(orgId, user.uid, input.role, { email, name });
    await this.firebase.db.collection(COL.users).doc(user.uid).set({ name }, { merge: true });
    return { uid: user.uid, email, name, role: input.role, created_at: null };
  }

  /** El equipo Gen.iality asignado no se toca desde aquí (solo en Usuarios). */
  private async clinicMember(orgId: string, uid: string) {
    const role = await this.memberships.roleIn(orgId, uid);
    if (!role) throw new NotFoundException('Miembro no encontrado');
    if (role === 'staff') throw new ForbiddenException('El equipo Gen.iality se gestiona en Usuarios');
    return role;
  }

  async updateMemberRole(orgId: string, uid: string, role: OrgRole): Promise<void> {
    await this.clinicMember(orgId, uid);
    const m = (await this.orgs.doc(orgId).collection(COL.members).doc(uid).get()).data()!;
    await this.memberships.set(orgId, uid, role, { email: m.email, name: m.name ?? null });
  }

  /** Quita el acceso a esta organización; la cuenta y sus otros accesos se conservan. */
  async removeMember(orgId: string, uid: string): Promise<void> {
    await this.clinicMember(orgId, uid);
    await this.memberships.remove(orgId, uid);
  }
}
