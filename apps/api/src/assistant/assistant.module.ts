import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { MetaModule } from '../meta/meta.module';
import { PatientsModule } from '../patients/patients.module';
import { TemplatesModule } from '../templates/templates.module';
import { ClinicalModule } from '../clinical/clinical.module';
import { AssistantService } from './assistant.service';
import { AssistantController } from './assistant.controller';
import { GeminiClient } from './gemini.client';

@Module({
  imports: [OrganizationsModule, MetaModule, PatientsModule, TemplatesModule, ClinicalModule],
  controllers: [AssistantController],
  providers: [AssistantService, GeminiClient],
  exports: [AssistantService],
})
export class AssistantModule {}
