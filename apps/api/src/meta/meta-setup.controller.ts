import { Body, Controller, Get, Param, Post, Put, UseFilters } from '@nestjs/common';
import { hasAtLeast, type Role } from '@genon/shared';
import { CurrentOrgRole, OrgAccess } from '../auth/decorators';
import { MetaSetupService } from './meta-setup.service';
import { MetaErrorFilter } from './meta-error.filter';
import {
  AppStepDto,
  BusinessStepDto,
  CompanyStepDto,
  PhoneStepDto,
  RegisterPhoneDto,
  RequestCodeDto,
  TestMessageDto,
  TokenStepDto,
  VerificationStepDto,
  VerifyCodeDto,
} from './dto';

/**
 * Asistente de conexión con Meta. La configuración la hace Gen.iality
 * (superadmin o el equipo asignado); la clínica solo puede ver el estado.
 */
@UseFilters(MetaErrorFilter)
@OrgAccess('staff')
@Controller('organizations/:orgId/meta-setup')
export class MetaSetupController {
  constructor(private readonly setup: MetaSetupService) {}

  @OrgAccess('operator')
  @Get()
  view(@Param('orgId') orgId: string, @CurrentOrgRole() role: Role) {
    return this.setup.view(orgId, hasAtLeast(role, 'staff'));
  }

  @Put('company')
  async company(@Param('orgId') orgId: string, @Body() body: CompanyStepDto) {
    await this.setup.saveCompany(orgId, body);
    return this.setup.view(orgId, true);
  }

  @Put('business')
  async business(@Param('orgId') orgId: string, @Body() body: BusinessStepDto) {
    await this.setup.saveBusiness(orgId, body.business_id);
    return this.setup.view(orgId, true);
  }

  @Post('business/refresh')
  async refreshBusiness(@Param('orgId') orgId: string) {
    await this.setup.refreshBusiness(orgId);
    return this.setup.view(orgId, true);
  }

  @Put('verification')
  async verification(@Param('orgId') orgId: string, @Body() body: VerificationStepDto) {
    await this.setup.saveVerification(orgId, body);
    return this.setup.view(orgId, true);
  }

  @Put('app')
  async app(@Param('orgId') orgId: string, @Body() body: AppStepDto) {
    await this.setup.saveApp(orgId, body.app_id, body.app_secret);
    return this.setup.view(orgId, true);
  }

  @Put('token')
  async token(@Param('orgId') orgId: string, @Body() body: TokenStepDto) {
    await this.setup.saveToken(orgId, body.access_token);
    return this.setup.view(orgId, true);
  }

  @Get('phone-numbers')
  phoneNumbers(@Param('orgId') orgId: string) {
    return this.setup.listPhoneNumbers(orgId);
  }

  @Put('phone')
  async phone(@Param('orgId') orgId: string, @Body() body: PhoneStepDto) {
    await this.setup.selectPhone(orgId, body.waba_id, body.phone_number_id);
    return this.setup.view(orgId, true);
  }

  @Post('phone/refresh')
  async refreshPhone(@Param('orgId') orgId: string) {
    await this.setup.refreshPhone(orgId);
    return this.setup.view(orgId, true);
  }

  @Post('phone/request-code')
  async requestCode(@Param('orgId') orgId: string, @Body() body: RequestCodeDto) {
    await this.setup.requestCode(orgId, body.method);
    return this.setup.view(orgId, true);
  }

  @Post('phone/verify-code')
  async verifyCode(@Param('orgId') orgId: string, @Body() body: VerifyCodeDto) {
    await this.setup.verifyCode(orgId, body.code);
    return this.setup.view(orgId, true);
  }

  @Post('phone/register')
  async register(@Param('orgId') orgId: string, @Body() body: RegisterPhoneDto) {
    await this.setup.register(orgId, body.pin);
    return this.setup.view(orgId, true);
  }

  @Post('webhook/configure-app')
  async configureApp(@Param('orgId') orgId: string) {
    await this.setup.configureAppWebhook(orgId);
    return this.setup.view(orgId, true);
  }

  @Post('webhook/subscribe-waba')
  async subscribeWaba(@Param('orgId') orgId: string) {
    await this.setup.subscribeWaba(orgId);
    return this.setup.view(orgId, true);
  }

  @Post('webhook/rotate-token')
  async rotateToken(@Param('orgId') orgId: string) {
    await this.setup.rotateVerifyToken(orgId);
    return this.setup.view(orgId, true);
  }

  @Post('test')
  async test(@Param('orgId') orgId: string, @Body() body: TestMessageDto) {
    await this.setup.sendTest(orgId, body.to, body.template || undefined, body.language || undefined);
    return this.setup.view(orgId, true);
  }
}
