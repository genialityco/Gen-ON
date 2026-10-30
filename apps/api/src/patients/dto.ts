import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_REMINDERS } from '@genon/shared';
import type {
  AppointmentInput,
  AppointmentStatus,
  ConsentMethod,
  CreateAppointmentInput,
  ReminderTiming,
  CreateEnrollmentInput,
  CreatePatientInput,
  PatientInput,
  ScheduleManualInput,
} from '@genon/shared';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class PatientDto implements PatientInput {
  @IsString() @MinLength(1) @MaxLength(80) first_name!: string;
  @IsString() @MinLength(1) @MaxLength(80) last_name!: string;
  @IsString() @MaxLength(25) phone!: string;
  @IsOptional() @IsString() @MaxLength(30) document?: string | null;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
}

export class ConsentDto {
  @IsIn(['written', 'verbal', 'digital_form', 'whatsapp']) method!: ConsentMethod;
  @IsOptional() @IsString() @MaxLength(300) note?: string | null;
}

export class EnrollmentDto implements CreateEnrollmentInput {
  @IsString() protocol_id!: string;
  @Matches(YMD, { message: 'Fecha inválida (YYYY-MM-DD)' }) reference_date!: string;
  @IsOptional() @Matches(HHMM, { message: 'Hora inválida (HH:mm)' }) reference_time?: string | null;
  @IsOptional() @IsString() @MaxLength(120) procedure?: string | null;
  @IsOptional() @IsString() @MaxLength(120) professional?: string | null;
}

export class CreatePatientDto extends PatientDto implements CreatePatientInput {
  @ValidateNested() @Type(() => ConsentDto) consent!: ConsentDto;
  @IsOptional() @ValidateNested() @Type(() => EnrollmentDto) enrollment?: EnrollmentDto | null;
}

export class RescheduleDto {
  @IsISO8601() send_at!: string;
}

export class ManualSendDto implements ScheduleManualInput {
  @IsString() patient_id!: string;
  @IsString() template_key!: string;
  @IsOptional() @IsISO8601() send_at?: string | null;
}

export class OptOutDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

// El momento de cada recordatorio lo valida validateAppointment (shared)
export class ReminderDto {
  @IsString() @MinLength(1) template_key!: string;
  @IsObject() timing!: ReminderTiming;
}

export class AppointmentDto implements AppointmentInput {
  @Matches(YMD, { message: 'Fecha inválida (YYYY-MM-DD)' }) date!: string;
  @Matches(HHMM, { message: 'Hora inválida (HH:mm)' }) time!: string;
  @IsOptional() @IsString() @MaxLength(120) reason?: string | null;
  @IsOptional() @IsString() @MaxLength(120) professional?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
  @IsArray() @ArrayMaxSize(MAX_REMINDERS) @ValidateNested({ each: true }) @Type(() => ReminderDto) reminders!: ReminderDto[];
}

export class CreateAppointmentDto extends AppointmentDto implements CreateAppointmentInput {
  @IsString() patient_id!: string;
}

export class AppointmentStatusDto {
  @IsIn(['scheduled', 'attended', 'no_show', 'cancelled']) status!: AppointmentStatus;
}
