import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import {
  CLINICAL_IMPORT_MAX,
  GUIDANCE_MAX_LENGTH,
  NOTE_KINDS,
  type ClinicalBackground,
  type ClinicalImportInput,
  type ClinicalImportRow,
  type ClinicalNoteInput,
  type NoteKind,
  type PatientGuidance,
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

class GuidanceDto implements PatientGuidance {
  @IsOptional() @IsString() @MaxLength(GUIDANCE_MAX_LENGTH) instructions!: string | null;
  @IsOptional() @IsString() @MaxLength(GUIDANCE_MAX_LENGTH) medications!: string | null;
  @IsOptional() @IsString() @MaxLength(GUIDANCE_MAX_LENGTH) restrictions!: string | null;
  @IsOptional() @IsString() @MaxLength(GUIDANCE_MAX_LENGTH) warning_signs!: string | null;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha de control inválida (YYYY-MM-DD)' }) next_control!: string | null;
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

class ImportBackgroundDto implements Partial<ClinicalBackground> {
  @IsOptional() @IsString() @MaxLength(2000) allergies?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) medications?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) conditions?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) surgeries?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) habits?: string | null;
}

class ImportGuidanceDto implements Partial<PatientGuidance> {
  @IsOptional() @IsString() @MaxLength(GUIDANCE_MAX_LENGTH) instructions?: string | null;
  @IsOptional() @IsString() @MaxLength(GUIDANCE_MAX_LENGTH) medications?: string | null;
  @IsOptional() @IsString() @MaxLength(GUIDANCE_MAX_LENGTH) restrictions?: string | null;
  @IsOptional() @IsString() @MaxLength(GUIDANCE_MAX_LENGTH) warning_signs?: string | null;
  @IsOptional() @IsString() @MaxLength(20) next_control?: string | null;
}

/** Fila del Excel: los detalles se validan en el servicio para informar el error de cada una. */
class ImportRowDto implements ClinicalImportRow {
  @IsString() @MaxLength(50) patient!: string;
  @IsOptional() @IsString() @MaxLength(20) date!: string | null;
  @IsOptional() @IsIn(['evolution', 'procedure', 'control']) kind!: ClinicalImportRow['kind'];
  @IsOptional() @IsString() @MaxLength(120) procedure!: string | null;
  @IsOptional() @IsString() @MaxLength(120) area!: string | null;
  @IsOptional() @IsString() @MaxLength(10000) body!: string | null;
  @ValidateNested() @Type(() => ImportBackgroundDto) background!: ImportBackgroundDto;
  @ValidateNested() @Type(() => ImportGuidanceDto) guidance!: ImportGuidanceDto;
  @IsOptional() @IsBoolean() share_with_assistant!: boolean | null;
}

class ImportDto implements ClinicalImportInput {
  @IsArray() @ArrayMaxSize(CLINICAL_IMPORT_MAX) @ValidateNested({ each: true }) @Type(() => ImportRowDto) rows!: ImportRowDto[];
  @IsString() @MaxLength(200) source!: string;
}

/** Importación de fichas desde Excel: profesional de salud o administrador. */
@OrgAccess('operator')
@Clinical('write')
@Controller('organizations/:orgId/clinical')
export class ClinicalImportController {
  constructor(private readonly clinical: ClinicalService) {}

  @Post('import')
  importMany(@Param('orgId') orgId: string, @Body() body: ImportDto, @CurrentUser() user: AuthUser, @CurrentOrgRole() role: Role) {
    return this.clinical.importMany(orgId, body, user, role);
  }
}
