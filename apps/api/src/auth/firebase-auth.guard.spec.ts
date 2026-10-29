import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MemberRole } from '@genon/shared';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { OrgAccess, Public, Roles } from './decorators';
import { MembershipsService } from './memberships.service';

class Endpoints {
  @Public() health() {}
  @Roles('superadmin') users() {}
  @Roles('superadmin', 'staff') orgList() {}
  @OrgAccess('operator') patients() {}
  @OrgAccess('org_admin') settings() {}
  @OrgAccess('staff') metaSetup() {}
  any() {}
}

/** Tokens de prueba: "uid:rolGlobal" */
const firebase = {
  auth: {
    verifyIdToken: async (token: string) => {
      if (token === 'malo') throw new Error('invalid');
      const [uid, role] = token.split(':');
      return { uid, role: role || undefined, email: `${uid}@x.com` };
    },
  },
};

/** Accesos: org1 → ana administradora, luis operador, sofi equipo Gen.iality */
const access: Record<string, Record<string, MemberRole>> = {
  org1: { ana: 'org_admin', luis: 'operator', sofi: 'staff' },
  org2: { luis: 'org_admin' },
};
const memberships = new MembershipsService(null as any);
memberships.roleIn = async (orgId: string, uid: string) => access[orgId]?.[uid] ?? null;

const guard = new FirebaseAuthGuard(new Reflector(), firebase as any, memberships);

function ctx(handler: keyof Endpoints, token?: string, orgId?: string) {
  const req: any = { headers: token ? { authorization: `Bearer ${token}` } : {}, params: orgId ? { orgId } : {} };
  const context = {
    getHandler: () => Endpoints.prototype[handler],
    getClass: () => Endpoints,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { context, req };
}

const allowed = async (handler: keyof Endpoints, token?: string, orgId?: string) => {
  const { context, req } = ctx(handler, token, orgId);
  try {
    await guard.canActivate(context);
    return req.orgRole ?? true;
  } catch (e) {
    if (e instanceof ForbiddenException) return 'prohibido';
    if (e instanceof UnauthorizedException) return 'sin sesión';
    throw e;
  }
};

describe('FirebaseAuthGuard', () => {
  it('público y sesión', async () => {
    expect(await allowed('health')).toBe(true);
    expect(await allowed('any')).toBe('sin sesión');
    expect(await allowed('any', 'malo')).toBe('sin sesión');
    expect(await allowed('any', 'ana')).toBe(true);
  });

  it('roles globales', async () => {
    expect(await allowed('users', 'root:superadmin')).toBe(true);
    expect(await allowed('users', 'sofi:staff')).toBe('prohibido');
    expect(await allowed('orgList', 'sofi:staff')).toBe(true);
    expect(await allowed('orgList', 'ana')).toBe('prohibido');
  });

  it('el superadmin entra a cualquier organización', async () => {
    expect(await allowed('metaSetup', 'root:superadmin', 'org9')).toBe('superadmin');
  });

  it('cada persona según su rol en cada organización', async () => {
    expect(await allowed('patients', 'luis', 'org1')).toBe('operator');
    expect(await allowed('settings', 'luis', 'org1')).toBe('prohibido');
    expect(await allowed('settings', 'luis', 'org2')).toBe('org_admin'); // administrador en otra
    expect(await allowed('settings', 'ana', 'org1')).toBe('org_admin');
    expect(await allowed('patients', 'ana', 'org2')).toBe('prohibido'); // sin acceso
    expect(await allowed('metaSetup', 'ana', 'org1')).toBe('prohibido');
  });

  it('el equipo Gen.iality solo en sus organizaciones asignadas', async () => {
    expect(await allowed('metaSetup', 'sofi:staff', 'org1')).toBe('staff');
    expect(await allowed('settings', 'sofi:staff', 'org1')).toBe('staff');
    expect(await allowed('metaSetup', 'sofi:staff', 'org2')).toBe('prohibido');
  });

  it('un rol global desconocido en el token no da permisos', async () => {
    expect(await allowed('users', 'x:org_admin')).toBe('prohibido');
  });
});
