import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { extractVariables, patientFullName } from '@genon/shared';
import { missingVariables, variableValues } from './variables';
import { AuthUser, CurrentUser, OrgAccess } from '../auth/decorators';
import { OrganizationsService } from '../organizations/organizations.service';
import { TemplatesService } from '../templates/templates.service';
import { PatientsService } from './patients.service';
import { EnrollmentsService } from './enrollments.service';
import { OutboxService } from './outbox.service';
import { UsageService } from './usage.service';
import { CreatePatientDto, EnrollmentDto, ManualSendDto, OptOutDto, PatientDto, RescheduleDto } from './dto';

/** Pacientes, inscripciones y parrilla: todo el equipo de la clínica. */
@OrgAccess('operator')
@Controller('organizations/:orgId')
export class PatientsController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly patients: PatientsService,
    private readonly enrollments: EnrollmentsService,
    private readonly outbox: OutboxService,
    private readonly usage: UsageService,
    private readonly templates: TemplatesService,
  ) {}

  @Get('patients')
  list(@Param('orgId') orgId: string, @CurrentUser() user: AuthUser) {
    return this.patients.list(orgId);
  }

  /** Crea el paciente y, si viene, lo inscribe de una vez. */
  @Post('patients')
  async create(@Param('orgId') orgId: string, @Body() body: CreatePatientDto, @CurrentUser() user: AuthUser) {
    const { consent, enrollment, ...data } = body;
    const patient = await this.patients.create(orgId, data, consent, user);
    if (!enrollment) return { patient, enrollment: null, scheduled: 0, warnings: [] };
    try {
      return { patient, ...(await this.enrollments.create(orgId, patient.id, enrollment, user)) };
    } catch (e) {
      // El paciente queda creado; el error de la inscripción se informa aparte
      return { patient, enrollment: null, scheduled: 0, warnings: [], enrollment_error: (e as Error).message };
    }
  }

  @Get('patients/:id')
  async detail(@Param('orgId') orgId: string, @Param('id') id: string, @CurrentUser() user: AuthUser) {
    const [patient, enrollments, outbox] = await Promise.all([
      this.patients.get(orgId, id),
      this.enrollments.listForPatient(orgId, id),
      this.outbox.listForPatient(orgId, id),
    ]);
    return { patient, enrollments, outbox };
  }

  @Put('patients/:id')
  update(@Param('orgId') orgId: string, @Param('id') id: string, @Body() body: PatientDto, @CurrentUser() user: AuthUser) {
    return this.patients.update(orgId, id, body);
  }

  @Post('patients/:id/opt-out')
  optOut(@Param('orgId') orgId: string, @Param('id') id: string, @Body() body: OptOutDto, @CurrentUser() user: AuthUser) {
    return this.patients.optOut(orgId, id, body.reason?.trim() || `Registrada por ${user.email}`);
  }

  @Post('patients/:id/enrollments')
  enroll(@Param('orgId') orgId: string, @Param('id') id: string, @Body() body: EnrollmentDto, @CurrentUser() user: AuthUser) {
    return this.enrollments.create(orgId, id, body, user);
  }

  @Post('enrollments/:id/cancel')
  cancelEnrollment(@Param('orgId') orgId: string, @Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.enrollments.cancel(orgId, id);
  }

  // ---- Parrilla ----

  @Get('outbox')
  outboxRange(
    @Param('orgId') orgId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.outbox.list(orgId, from, to);
  }

  /** Envío manual de una plantilla a un paciente (ahora o programado). */
  @Post('outbox')
  async manual(@Param('orgId') orgId: string, @Body() body: ManualSendDto, @CurrentUser() user: AuthUser) {
    const [org, patient, template] = await Promise.all([
      this.orgs.get(orgId),
      this.patients.get(orgId, body.patient_id),
      this.templates.byKey({ orgId }, body.template_key),
    ]);
    if (patient.opted_out) throw new BadRequestException('El paciente se dio de baja');
    if (!patient.consent) throw new BadRequestException('El paciente no tiene autorización de datos');
    if (!template) throw new BadRequestException('Plantilla no encontrada');
    // Los datos de la cita salen de su última inscripción activa
    const enrollment = await this.enrollments.latestActive(orgId, patient.id);
    const missing = missingVariables(
      extractVariables(template.approved?.body ?? template.body),
      variableValues({ org, patient, enrollment }),
    );
    if (missing.length) {
      throw new BadRequestException(`Esta plantilla necesita ${missing.join(', ')}: inscribe al paciente a un protocolo.`);
    }
    const at = body.send_at ? new Date(body.send_at) : new Date();
    if (at.getTime() < Date.now() - 60_000) throw new BadRequestException('La fecha ya pasó');
    return this.outbox.addManual(orgId, org.timezone, {
      enrollment_id: null,
      patient_id: patient.id,
      patient_name: patientFullName(patient),
      phone: patient.phone,
      protocol_id: null,
      protocol_name: null,
      step_id: null,
      step_label: template.label,
      day_offset: null,
      template_key: template.key,
      at,
      shifted: false,
      manual: true,
      created_by: user.uid,
    });
  }

  @Patch('outbox/:id')
  async reschedule(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: RescheduleDto,
    @CurrentUser() user: AuthUser,
  ) {
    const org = await this.orgs.get(orgId);
    return this.outbox.reschedule(orgId, org.timezone, id, new Date(body.send_at));
  }

  @Post('outbox/:id/send-now')
  async sendNow(@Param('orgId') orgId: string, @Param('id') id: string, @CurrentUser() user: AuthUser) {
    const org = await this.orgs.get(orgId);
    return this.outbox.reschedule(orgId, org.timezone, id, new Date());
  }

  @Post('outbox/:id/cancel')
  cancel(@Param('orgId') orgId: string, @Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.outbox.cancel(orgId, id);
  }

  @Get('usage')
  async monthlyUsage(@Param('orgId') orgId: string, @Query('month') month: string | undefined, @CurrentUser() user: AuthUser) {
    const org = await this.orgs.get(orgId);
    const m = month && /^\d{4}-\d{2}$/.test(month) ? month : this.usage.monthOf(new Date(), org.timezone);
    return this.usage.get(org, m);
  }
}
