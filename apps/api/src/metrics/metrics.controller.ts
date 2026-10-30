import { Controller, Get, Param, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, OrgAccess } from '../auth/decorators';
import { MetricsService } from './metrics.service';

/** Métricas de la organización: todo el equipo de la clínica. */
@OrgAccess('operator')
@Controller('organizations/:orgId/metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /** from y to: fechas locales YYYY-MM-DD, ambas incluidas. */
  @Get()
  get(@Param('orgId') orgId: string, @Query('from') from: string, @Query('to') to: string, @CurrentUser() user: AuthUser) {
    return this.metrics.get(orgId, from, to);
  }
}
