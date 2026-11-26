import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  MAX_ALERT_NOTIFY_PHONES,
  ORG_KIND_LABELS,
  ORG_ROLES,
  PLAN_KEYS,
  type AddMemberInput,
  type AlertLevel,
  type CreateOrganizationInput,
  type OrganizationSettingsInput,
  type OrgKind,
  type OrgRole,
  type OrgStatus,
  type PlanKey,
  type UpdateOrganizationInput,
} from '@genon/shared';

const KINDS = Object.keys(ORG_KIND_LABELS);
const STATUSES: OrgStatus[] = ['setup', 'active', 'suspended'];

export class CreateOrganizationDto implements CreateOrganizationInput {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsIn(KINDS) kind!: OrgKind;
  @IsIn(PLAN_KEYS) plan!: PlanKey;
  @IsOptional() @IsString() timezone?: string;
}

export class UpdateOrganizationDto implements UpdateOrganizationInput {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsIn(KINDS) kind?: OrgKind;
  @IsOptional() @IsIn(PLAN_KEYS) plan?: PlanKey;
  @IsOptional() @IsIn(STATUSES) status?: OrgStatus;
  @IsOptional() @IsString() timezone?: string;
  /** null = sin límite */
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) monthly_message_limit?: number | null;
}

export class OrganizationSettingsDto implements OrganizationSettingsInput {
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Hora inválida (HH:mm)' })
  default_send_time?: string;
  @IsOptional() @IsArray() @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true })
  blocked_weekdays?: number[];
  @IsOptional() @IsString() @MaxLength(2000) consent_text?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_ALERT_NOTIFY_PHONES) @IsString({ each: true }) @MaxLength(25, { each: true })
  alert_notify_phones?: string[];
  @IsOptional() @IsIn(['info', 'warning', 'urgent']) alert_notify_level?: AlertLevel;
  /** null apaga las alertas por falta de respuesta */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(6) @Max(168) no_response_hours?: number | null;
}

export class AddMemberDto implements AddMemberInput {
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsIn(ORG_ROLES) role!: OrgRole;
}
