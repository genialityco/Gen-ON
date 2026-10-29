import { Injectable } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import type { MemberRole, Membership, Role } from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL } from '../common/firestore';
import { AuthUser } from './decorators';

/** Un cambio de acceso hecho en otra instancia tarda a lo más esto en verse. */
const CACHE_MS = 30_000;

/**
 * Accesos de las personas a las organizaciones, con un rol en cada una. Se
 * guardan en dos lugares que se escriben juntos:
 * - organizations/{orgId}/members/{uid}: equipo de la organización (y lo que
 *   usan las reglas de Firestore)
 * - users/{uid}.memberships: { orgId: rol }, para saber a dónde entra cada uno
 */
@Injectable()
export class MembershipsService {
  private readonly cache = new Map<string, { role: MemberRole | null; at: number }>();

  constructor(private readonly firebase: FirebaseService) {}

  private memberRef(orgId: string, uid: string) {
    return this.firebase.db.collection(COL.organizations).doc(orgId).collection(COL.members).doc(uid);
  }

  private userRef(uid: string) {
    return this.firebase.db.collection(COL.users).doc(uid);
  }

  async roleIn(orgId: string, uid: string): Promise<MemberRole | null> {
    const key = `${orgId}:${uid}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.role;
    const role = ((await this.memberRef(orgId, uid).get()).get('role') as MemberRole) ?? null;
    this.cache.set(key, { role, at: Date.now() });
    return role;
  }

  /** Rol efectivo: superadmin en todas; si no, el de su acceso. */
  async effectiveRole(user: AuthUser, orgId: string): Promise<Role | null> {
    if (user.role === 'superadmin') return 'superadmin';
    return this.roleIn(orgId, user.uid);
  }

  async set(orgId: string, uid: string, role: MemberRole, info: { email: string; name: string | null }) {
    const ref = this.memberRef(orgId, uid);
    const exists = (await ref.get()).exists;
    const batch = this.firebase.db.batch();
    batch.set(
      ref,
      { email: info.email, name: info.name, role, ...(exists ? {} : { created_at: FieldValue.serverTimestamp() }) },
      { merge: true },
    );
    batch.set(
      this.userRef(uid),
      { email: info.email, memberships: { [orgId]: role }, updated_at: FieldValue.serverTimestamp() },
      { merge: true },
    );
    await batch.commit();
    this.cache.delete(`${orgId}:${uid}`);
  }

  async remove(orgId: string, uid: string) {
    const batch = this.firebase.db.batch();
    batch.delete(this.memberRef(orgId, uid));
    batch.set(this.userRef(uid), { memberships: { [orgId]: FieldValue.delete() } }, { merge: true });
    await batch.commit();
    this.cache.delete(`${orgId}:${uid}`);
  }

  /** Accesos de una persona, con el nombre actual de cada organización. */
  async forUser(uid: string): Promise<Membership[]> {
    const map: Record<string, MemberRole> = (await this.userRef(uid).get()).get('memberships') ?? {};
    return this.withNames(map);
  }

  async withNames(map: Record<string, MemberRole>): Promise<Membership[]> {
    const ids = Object.keys(map);
    if (!ids.length) return [];
    const docs = await this.firebase.db.getAll(...ids.map((id) => this.firebase.db.collection(COL.organizations).doc(id)));
    return docs
      .filter((d) => d.exists)
      .map((d) => ({ org_id: d.id, org_name: d.get('name') as string, role: map[d.id] }))
      .sort((a, b) => a.org_name.localeCompare(b.org_name));
  }
}
