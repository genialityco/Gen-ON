import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type {
  ProtocolInput,
  ProtocolStep,
  TemplateButton,
  TemplateCategory,
  TemplateInput,
} from '@genon/shared';

/** La forma fina de botones y pasos se valida con las reglas compartidas. */
export class TemplateDto implements TemplateInput {
  @IsOptional() @IsString() @MaxLength(60) key?: string;
  @IsOptional() @IsString() @MaxLength(120) label?: string;
  @IsOptional() @IsIn(['UTILITY', 'MARKETING']) category?: TemplateCategory;
  @IsOptional() @IsString() @MaxLength(10) language?: string;
  @IsOptional() @IsString() @MaxLength(60) header?: string;
  @IsOptional() @IsString() @MaxLength(1024) body?: string;
  @IsOptional() @IsString() @MaxLength(60) footer?: string;
  @IsOptional() @IsArray() buttons?: TemplateButton[];
  @IsOptional() @IsString() @MaxLength(120) clinical_validated_by?: string | null;
}

export class ProtocolDto implements ProtocolInput {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(120) procedure?: string | null;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsArray() steps!: ProtocolStep[];
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CopyProtocolDto {
  @IsString() library_id!: string;
}
