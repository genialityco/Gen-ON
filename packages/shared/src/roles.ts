/**
 * Rol global (custom claim del token de Firebase):
 * - superadmin: Gen.iality con acceso total (organizaciones, usuarios, biblioteca)
 * - staff: equipo Gen.iality; configura Meta, plantillas y protocolos, pero
 *   solo en las organizaciones que tiene asignadas
 * Los usuarios de clínica no tienen rol global: solo accesos por organización.
 */
export const GLOBAL_ROLES = ['superadmin', 'staff'] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

/** Roles que asigna la clínica a su equipo. */
export const ORG_ROLES = ['org_admin', 'operator'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Rol de un acceso a una organización (staff lo asigna solo el superadmin). */
export const MEMBER_ROLES = ['org_admin', 'operator', 'staff'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Rol efectivo de una persona dentro de una organización. */
export type Role = GlobalRole | OrgRole;

/** operador < administrador < equipo Gen.iality < superadmin */
export const ROLE_RANK: Record<Role, number> = {
  operator: 1,
  org_admin: 2,
  staff: 3,
  superadmin: 4,
};

export function hasAtLeast(role: Role | null | undefined, min: Role): boolean {
  return !!role && ROLE_RANK[role] >= ROLE_RANK[min];
}

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: 'Superadmin Gen.iality',
  staff: 'Equipo Gen.iality',
  org_admin: 'Administrador',
  operator: 'Operador',
};

/** Custom claims del token de Firebase Auth. */
export interface AuthClaims {
  role?: GlobalRole;
}

export interface Membership {
  org_id: string;
  org_name: string;
  role: MemberRole;
}

export interface Me {
  uid: string;
  email: string | null;
  name: string | null;
  role: GlobalRole | null;
  memberships: Membership[];
}

/** Cuenta vista desde la administración de usuarios (superadmin). */
export interface ManagedUser {
  uid: string;
  email: string;
  name: string | null;
  role: GlobalRole | null;
  memberships: Membership[];
  disabled: boolean;
  last_sign_in: string | null;
  created_at: string | null;
}

export interface CreateUserInput {
  email: string;
  name?: string | null;
  role?: GlobalRole | null;
  /** Vacío = la define la persona con "¿Olvidaste tu contraseña?" */
  password?: string | null;
  memberships?: { org_id: string; role: MemberRole }[];
}

export interface UpdateUserInput {
  name?: string | null;
  role?: GlobalRole | null;
  disabled?: boolean;
  password?: string;
}
