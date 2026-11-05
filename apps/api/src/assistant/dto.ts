import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
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
}

export class KnowledgeDto implements KnowledgeInput {
  @IsString() @MinLength(2) @MaxLength(120) title!: string;
  @IsString() @MinLength(2) @MaxLength(KNOWLEDGE_MAX_CONTENT) content!: string;
  @IsBoolean() approved!: boolean;
}

export class AssistantTestDto implements AssistantTestInput {
  @IsString() @MinLength(2) @MaxLength(1000) question!: string;
}
