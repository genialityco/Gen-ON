import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { GlobalRole, Role } from '@genon/shared';

export interface AuthUser {
  uid: string;
  email: string | null;
  name: string | null;
  /** Rol global (token); los accesos por organización van aparte */
  role: GlobalRole | null;
}

export const IS_PUBLIC = 'isPublic';
/** Sin token (webhooks de Meta, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
/** Roles globales que pueden usar el endpoint. */
export const Roles = (...roles: GlobalRole[]) => SetMetadata(ROLES_KEY, roles);

export const ORG_ACCESS_KEY = 'orgAccess';
/**
 * Endpoint de una organización (ruta con :orgId): exige al menos este rol
 * en ella. El superadmin entra a todas; el resto según sus accesos.
 */
export const OrgAccess = (min: Role) => SetMetadata(ORG_ACCESS_KEY, min);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

/** Rol efectivo en la organización de la ruta (lo deja el guard con @OrgAccess). */
export const CurrentOrgRole = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Role => ctx.switchToHttp().getRequest().orgRole,
);
