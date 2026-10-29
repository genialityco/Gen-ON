import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import type { UserRecord } from 'firebase-admin/auth';
import type { CreateUserInput, GlobalRole, ManagedUser, MemberRole, UpdateUserInput } from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL } from '../common/firestore';
import { AuthUser } from '../auth/decorators';
import { MembershipsService } from '../auth/memberships.service';

const MIN_PASSWORD = 8;

/**
 * Cuentas de la plataforma, para el superadmin: tipo de cuenta (superadmin,
 * equipo Gen.iality o usuario de clínica) y sus accesos a organizaciones.
 * - Equipo Gen.iality: solo accesos con rol `staff`.
 * - Usuario de clínica: accesos con rol de administrador u operador.
 * - Superadmin: sin accesos (entra a todas).
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly memberships: MembershipsService,
  ) {}

  private get users() {
    return this.firebase.db.collection(COL.users);
  }

  private async authUsers(uids: string[]): Promise<Map<string, UserRecord>> {
    const out = new Map<string, UserRecord>();
    for (let i = 0; i < uids.length; i += 100) {
      const res = await this.firebase.auth.getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
      for (const u of res.users) out.set(u.uid, u);
    }
    return out;
  }

  private toUser(uid: string, d: FirebaseFirestore.DocumentData, auth: UserRecord | undefined, orgNames: Map<string, string>): ManagedUser {
    const map: Record<string, MemberRole> = d.memberships ?? {};
    return {
      uid,
      email: auth?.email ?? d.email,
      name: d.name ?? auth?.displayName ?? null,
      role: (auth?.customClaims?.role as GlobalRole) ?? null,
      memberships: Object.entries(map)
        .filter(([id]) => orgNames.has(id))
        .map(([org_id, role]) => ({ org_id, org_name: orgNames.get(org_id)!, role }))
        .sort((a, b) => a.org_name.localeCompare(b.org_name)),
      disabled: auth?.disabled ?? false,
      last_sign_in: auth?.metadata.lastSignInTime ? new Date(auth.metadata.lastSignInTime).toISOString() : null,
      created_at: auth?.metadata.creationTime ? new Date(auth.metadata.creationTime).toISOString() : null,
    };
  }

  private async orgNames() {
    const snap = await this.firebase.db.collection(COL.organizations).select('name').get();
    return new Map(snap.docs.map((d) => [d.id, d.get('name') as string]));
  }

  async list(): Promise<ManagedUser[]> {
    const [snap, names] = await Promise.all([this.users.get(), this.orgNames()]);
    const auth = await this.authUsers(snap.docs.map((d) => d.id));
    return snap.docs
      .filter((d) => auth.has(d.id))
      .map((d) => this.toUser(d.id, d.data(), auth.get(d.id), names))
      .sort((a, b) => a.email.localeCompare(b.email));
  }

  async get(uid: string): Promise<ManagedUser> {
    const [doc, names, auth] = await Promise.all([
      this.users.doc(uid).get(),
      this.orgNames(),
      this.firebase.auth.getUser(uid).catch(() => null),
    ]);
    if (!auth) throw new NotFoundException('Usuario no encontrado');
    return this.toUser(uid, doc.data() ?? { email: auth.email }, auth, names);
  }

  private checkPassword(password: string | null | undefined) {
    if (password && password.length < MIN_PASSWORD) {
      throw new BadRequestException(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
    }
  }

  /** Crea la cuenta (o toma la existente si aún no está registrada aquí). */
  async create(input: CreateUserInput): Promise<ManagedUser> {
    const email = input.email.trim().toLowerCase();
    this.checkPassword(input.password);
    let user = await this.firebase.auth.getUserByEmail(email).catch(() => null);
    if (user && (await this.users.doc(user.uid).get()).exists) {
      throw new ConflictException('Ya existe una cuenta con ese correo');
    }
    const name = input.name?.trim() || null;
    if (!user) {
      user = await this.firebase.auth.createUser({
        email,
        displayName: name ?? undefined,
        ...(input.password ? { password: input.password } : {}),
      });
    } else if (input.password) {
      await this.firebase.auth.updateUser(user.uid, { password: input.password });
    }
    const role = input.role ?? null;
    await this.firebase.auth.setCustomUserClaims(user.uid, role ? { role } : null);
    await this.users.doc(user.uid).set(
      { email, name, role, memberships: {}, updated_at: FieldValue.serverTimestamp() },
      { merge: true },
    );
    for (const m of input.memberships ?? []) await this.setMembership(user.uid, m.org_id, m.role);
    return this.get(user.uid);
  }

  async update(uid: string, input: UpdateUserInput, actor: AuthUser): Promise<ManagedUser> {
    const current = await this.get(uid);
    const self = uid === actor.uid;
    const patch: Record<string, unknown> = { updated_at: FieldValue.serverTimestamp() };

    if (input.name !== undefined) {
      patch.name = input.name?.trim() || null;
      await this.firebase.auth.updateUser(uid, { displayName: (patch.name as string) ?? null });
    }
    if (input.password) {
      this.checkPassword(input.password);
      await this.firebase.auth.updateUser(uid, { password: input.password });
    }

    let revoke = false;
    if (input.role !== undefined && input.role !== current.role) {
      if (self) throw new ForbiddenException('No puedes cambiar tu propio tipo de cuenta');
      await this.assertRoleFits(current, input.role);
      // Un superadmin entra a todas: sus accesos ya no hacen falta
      if (input.role === 'superadmin') {
        for (const m of current.memberships) await this.memberships.remove(m.org_id, uid);
      }
      await this.firebase.auth.setCustomUserClaims(uid, input.role ? { role: input.role } : null);
      patch.role = input.role;
      revoke = true;
    }
    if (input.disabled !== undefined && input.disabled !== current.disabled) {
      if (self) throw new ForbiddenException('No puedes desactivar tu propia cuenta');
      await this.firebase.auth.updateUser(uid, { disabled: input.disabled });
      revoke = revoke || input.disabled;
    }
    // Cierra las sesiones abiertas para que el cambio aplique ya
    if (revoke) await this.firebase.auth.revokeRefreshTokens(uid);

    await this.users.doc(uid).set(patch, { merge: true });
    return this.get(uid);
  }

  /** Los accesos que tiene deben corresponder al tipo de cuenta nuevo. */
  private async assertRoleFits(user: ManagedUser, role: GlobalRole | null) {
    if (role === 'superadmin') return;
    const clinicAccess = user.memberships.filter((m) => m.role !== 'staff');
    const staffAccess = user.memberships.filter((m) => m.role === 'staff');
    if (role === 'staff' && clinicAccess.length) {
      throw new BadRequestException('Tiene accesos como usuario de clínica: quítalos antes de pasarlo al equipo Gen.iality');
    }
    if (role === null && staffAccess.length) {
      throw new BadRequestException('Tiene organizaciones asignadas como equipo Gen.iality: quítalas antes');
    }
  }

  async setMembership(uid: string, orgId: string, role: MemberRole): Promise<ManagedUser> {
    const [user, org] = await Promise.all([
      this.get(uid),
      this.firebase.db.collection(COL.organizations).doc(orgId).get(),
    ]);
    if (!org.exists) throw new NotFoundException('Organización no encontrada');
    if (user.role === 'superadmin') throw new BadRequestException('Un superadmin ya entra a todas las organizaciones');
    if (user.role === 'staff' && role !== 'staff') {
      throw new BadRequestException('Al equipo Gen.iality se le asignan organizaciones con el rol "Equipo Gen.iality"');
    }
    if (user.role !== 'staff' && role === 'staff') {
      throw new BadRequestException('El rol "Equipo Gen.iality" es solo para cuentas del equipo');
    }
    await this.memberships.set(orgId, uid, role, { email: user.email, name: user.name });
    return this.get(uid);
  }

  async removeMembership(uid: string, orgId: string): Promise<ManagedUser> {
    await this.memberships.remove(orgId, uid);
    return this.get(uid);
  }
}
