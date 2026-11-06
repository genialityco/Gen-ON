import { Controller, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser, OrgAccess } from '../auth/decorators';
import { AlertNotifierService } from './alert-notifier.service';

/** Avisos de alertas por WhatsApp al equipo: los configura el administrador de la clínica. */
@OrgAccess('org_admin')
@Controller('organizations/:orgId/alert-notify')
export class AlertNotifyController {
  constructor(private readonly notifier: AlertNotifierService) {}

  @Post('activate')
  activate(@Param('orgId') orgId: string, @CurrentUser() user: AuthUser) {
    return this.notifier.activate(orgId);
  }

  @Post('refresh')
  refresh(@Param('orgId') orgId: string, @CurrentUser() user: AuthUser) {
    return this.notifier.refresh(orgId);
  }

  @Post('test')
  test(@Param('orgId') orgId: string, @CurrentUser() user: AuthUser) {
    return this.notifier.test(orgId);
  }
}
