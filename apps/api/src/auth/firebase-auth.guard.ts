import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { canReadClinical, canWriteClinical, hasAtLeast, type GlobalRole, type Role } from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { AuthUser, CLINICAL_KEY, IS_PUBLIC, ORG_ACCESS_KEY, ROLES_KEY } from './decorators';
import { MembershipsService } from './memberships.service';

const GLOBAL: GlobalRole[] = ['superadmin', 'staff'];
const REVOCATION_CHECK_MS = 60_000;

/**
 * Guard global: exige un ID token de Firebase (Authorization: Bearer) salvo
 * en los endpoints @Public. Revisa @Roles (rol global del token) y
 * @OrgAccess (rol en la organización de la ruta, desde sus accesos).
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly revocationChecked = new Map<string, number>();

  constructor(
    private readonly reflector: Reflector,
    private readonly firebase: FirebaseService,
    private readonly memberships: MembershipsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Falta el token de sesión');

    let decoded;
    try {
      decoded = await this.firebase.auth.verifyIdToken(token);
      // Una cuenta desactivada o con el rol quitado pierde la sesión: se
      // consulta a Firebase (llamada de red) a lo más una vez por minuto
      const last = this.revocationChecked.get(decoded.uid) ?? 0;
      if (Date.now() - last > REVOCATION_CHECK_MS) {
        await this.firebase.auth.verifyIdToken(token, true);
        this.revocationChecked.set(decoded.uid, Date.now());
      }
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }

    const role = GLOBAL.includes(decoded.role) ? (decoded.role as GlobalRole) : null;
    const user: AuthUser = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: (decoded.name as string) ?? null,
      role,
    };
    req.user = user;

    const roles = this.reflector.getAllAndOverride<GlobalRole[]>(ROLES_KEY, targets);
    if (roles?.length && (!role || !roles.includes(role))) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }

    const min = this.reflector.getAllAndOverride<Role>(ORG_ACCESS_KEY, targets);
    if (min) {
      const orgId = req.params?.orgId;
      if (!orgId) throw new BadRequestException('Falta la organización');
      const orgRole = await this.memberships.effectiveRole(user, orgId);
      if (!orgRole) throw new ForbiddenException('No tienes acceso a esta organización');
      if (!hasAtLeast(orgRole, min)) throw new ForbiddenException('No tienes permiso para esta acción');
      req.orgRole = orgRole;
    }

    const clinical = this.reflector.getAllAndOverride<'read' | 'write'>(CLINICAL_KEY, targets);
    if (clinical) {
      const orgRole: Role | undefined = req.orgRole;
      const ok = clinical === 'write' ? canWriteClinical(orgRole) : canReadClinical(orgRole);
      if (!ok) throw new ForbiddenException('La ficha clínica es solo para el equipo de salud de la clínica');
    }
    return true;
  }
}
