import { Controller, Get, Param, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, OrgAccess } from '../auth/decorators';
import { OrganizationsService } from '../organizations/organizations.service';
import { MetricsService } from './metrics.service';

/** Métricas de la organización: todo el equipo de la clínica, en planes con tablero o reporte mensual. */
@OrgAccess('operator')
@Controller('organizations/:orgId/metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly orgs: OrganizationsService,
  ) {}

  /** from y to: fechas locales YYYY-MM-DD, ambas incluidas. */
  @Get()
  async get(@Param('orgId') orgId: string, @Query('from') from: string, @Query('to') to: string, @CurrentUser() user: AuthUser) {
    await this.orgs.withFeature(orgId, 'global_dashboard', 'monthly_report');
    return this.metrics.get(orgId, from, to);
  }
}
