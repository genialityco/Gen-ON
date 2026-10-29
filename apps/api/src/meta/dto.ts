import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type {
  AppStepInput,
  BusinessStepInput,
  CompanyStepInput,
  PhoneStepInput,
  RegisterPhoneInput,
  RequestCodeInput,
  TestMessageInput,
  TokenStepInput,
  VerificationStepInput,
  VerifyCodeInput,
} from '@genon/shared';

export class CompanyStepDto implements CompanyStepInput {
  @IsString() @MinLength(2) @MaxLength(200) legal_name!: string;
  @IsString() @Matches(/^[0-9.\-\s]{5,20}$/, { message: 'NIT inválido' }) nit!: string;
  @IsUrl({ require_protocol: true }, { message: 'El sitio web debe empezar por https://' }) website!: string;
  @IsString() @MinLength(2) @MaxLength(120) contact_name!: string;
  @IsEmail() contact_email!: string;
  @IsString() @MinLength(7) @MaxLength(20) contact_phone!: string;
  @IsString() @MinLength(5) @MaxLength(200) address!: string;
  @IsString() @MinLength(2) @MaxLength(80) city!: string;
}

export class BusinessStepDto implements BusinessStepInput {
  @IsString() business_id!: string;
}

export class VerificationStepDto implements VerificationStepInput {
  @IsIn(['pending', 'in_review', 'done']) status!: 'pending' | 'in_review' | 'done';
  @IsOptional() @IsString() @MaxLength(300) message?: string;
}

export class AppStepDto implements AppStepInput {
  @IsString() app_id!: string;
  @IsOptional() @IsString() app_secret?: string;
}

export class TokenStepDto implements TokenStepInput {
  @IsString() @MinLength(20) access_token!: string;
}

export class PhoneStepDto implements PhoneStepInput {
  @IsString() waba_id!: string;
  @IsString() phone_number_id!: string;
}

export class RequestCodeDto implements RequestCodeInput {
  @IsIn(['SMS', 'VOICE']) method!: 'SMS' | 'VOICE';
}

export class VerifyCodeDto implements VerifyCodeInput {
  @IsString() @Matches(/^\d{6}$/, { message: 'El código son 6 dígitos' }) code!: string;
}

export class RegisterPhoneDto implements RegisterPhoneInput {
  @IsString() @Matches(/^\d{6}$/, { message: 'El PIN son 6 dígitos' }) pin!: string;
}

export class TestMessageDto implements TestMessageInput {
  @IsString() to!: string;
  @IsOptional() @IsString() template?: string;
  @IsOptional() @IsString() language?: string;
}
