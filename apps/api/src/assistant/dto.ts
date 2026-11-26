import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import {
  ASSISTANT_INSTRUCTIONS_MAX,
  KNOWLEDGE_MAX_CONTENT,
  type AssistantSettingsInput,
  type AssistantTestInput,
  type KnowledgeInput,
} from '@genon/shared';

export class AssistantSettingsDto implements AssistantSettingsInput {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(ASSISTANT_INSTRUCTIONS_MAX) instructions?: string;
  @IsOptional() @IsString() @MaxLength(500) handoff_message?: string;
  @IsOptional() @IsBoolean() use_clinical?: boolean;
}

export class KnowledgeDto implements KnowledgeInput {
  @IsString() @MinLength(2) @MaxLength(120) title!: string;
  @IsString() @MinLength(2) @MaxLength(KNOWLEDGE_MAX_CONTENT) content!: string;
  @IsOptional() @IsString() @MaxLength(120) procedure?: string | null;
  @IsBoolean() approved!: boolean;
}

class TestMessageDto {
  @IsIn(['user', 'model']) role!: 'user' | 'model';
  @IsString() @MinLength(1) @MaxLength(1000) text!: string;
}

export class AssistantTestDto implements AssistantTestInput {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => TestMessageDto) messages!: TestMessageDto[];
  @IsOptional() @IsString() patient_id?: string | null;
}
