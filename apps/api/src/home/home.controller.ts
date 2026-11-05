import { Controller, Get, Param, Post } from '@nestjs/common';
import type { AttentionKind } from '@genon/shared';
import { AuthUser, CurrentUser, OrgAccess } from '../auth/decorators';
import { HomeService } from './home.service';

/** Inicio de la clínica: todo el equipo. */
@OrgAccess('operator')
@Controller('organizations/:orgId/home')
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get()
  get(@Param('orgId') orgId: string, @CurrentUser() user: AuthUser) {
    return this.home.get(orgId);
  }

  @Post('attention/:kind/:id/resolve')
  resolve(@Param('orgId') orgId: string, @Param('kind') kind: AttentionKind, @Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.home.resolve(orgId, kind, id, user);
  }
}
