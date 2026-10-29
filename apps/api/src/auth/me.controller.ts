import { Controller, Get } from '@nestjs/common';
import type { Me } from '@genon/shared';
import { AuthUser, CurrentUser } from './decorators';
import { MembershipsService } from './memberships.service';

@Controller('me')
export class MeController {
  constructor(private readonly memberships: MembershipsService) {}

  /** Quién es y a qué organizaciones entra (el superadmin entra a todas). */
  @Get()
  async me(@CurrentUser() user: AuthUser): Promise<Me> {
    const memberships = user.role === 'superadmin' ? [] : await this.memberships.forUser(user.uid);
    return { ...user, memberships };
  }
}
