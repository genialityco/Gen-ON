import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import {
  NOTE_KINDS,
  type ClinicalBackground,
  type ClinicalNoteInput,
  type NoteKind,
  type ProcedureDetails,
  type Role,
} from '@genon/shared';
import { AuthUser, Clinical, CurrentOrgRole, CurrentUser, OrgAccess } from '../auth/decorators';
import { ClinicalService } from './clinical.service';

class BackgroundDto implements ClinicalBackground {
  @IsOptional() @IsString() @MaxLength(2000) allergies!: string | null;
  @IsOptional() @IsString() @MaxLength(2000) medications!: string | null;
  @IsOptional() @IsString() @MaxLength(2000) conditions!: string | null;
  @IsOptional() @IsString() @MaxLength(2000) surgeries!: string | null;
  @IsOptional() @IsString() @MaxLength(2000) habits!: string | null;
}

class ProcedureDto implements ProcedureDetails {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(120) area!: string | null;
  @IsOptional() @IsString() @MaxLength(120) product!: string | null;
  @IsOptional() @IsString() @MaxLength(120) lot!: string | null;
  @IsOptional() @IsString() @MaxLength(120) quantity!: string | null;
}

class NoteDto implements ClinicalNoteInput {
  @IsIn(NOTE_KINDS) kind!: NoteKind;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha inválida (YYYY-MM-DD)' }) date!: string;
  @IsString() @MaxLength(10000) body!: string;
  @IsOptional() @ValidateNested() @Type(() => ProcedureDto) procedure?: ProcedureDto | null;
  @IsOptional() @IsString() amends?: string | null;
}

/** Ficha clínica de un paciente: solo el equipo de salud (ver Clinical). */
@OrgAccess('operator')
@Clinical('read')
@Controller('organizations/:orgId/patients/:patientId/clinical')
export class ClinicalController {
  constructor(private readonly clinical: ClinicalService) {}

  @Get()
  view(
    @Param('orgId') orgId: string,
    @Param('patientId') patientId: string,
    @CurrentUser() user: AuthUser,
    @CurrentOrgRole() role: Role,
  ) {
    return this.clinical.view(orgId, patientId, user, role);
  }

  @Clinical('write')
  @Put('background')
  background(
    @Param('orgId') orgId: string,
    @Param('patientId') patientId: string,
    @Body() body: BackgroundDto,
    @CurrentUser() user: AuthUser,
    @CurrentOrgRole() role: Role,
  ) {
    return this.clinical.updateBackground(orgId, patientId, body, user, role);
  }

  @Clinical('write')
  @Post('notes')
  addNote(
    @Param('orgId') orgId: string,
    @Param('patientId') patientId: string,
    @Body() body: NoteDto,
    @CurrentUser() user: AuthUser,
    @CurrentOrgRole() role: Role,
  ) {
    return this.clinical.addNote(orgId, patientId, body, user, role);
  }

  /** Quién consultó o modificó la ficha: administrador de la clínica o superadmin. */
  @OrgAccess('org_admin')
  @Get('access-log')
  accessLog(@Param('orgId') orgId: string, @Param('patientId') patientId: string, @CurrentUser() user: AuthUser) {
    return this.clinical.accessLog(orgId, patientId);
  }
}
