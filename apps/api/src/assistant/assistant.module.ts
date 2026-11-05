import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { MetaModule } from '../meta/meta.module';
import { PatientsModule } from '../patients/patients.module';
import { AssistantService } from './assistant.service';
import { AssistantController } from './assistant.controller';
import { GeminiClient } from './gemini.client';

@Module({
  imports: [OrganizationsModule, MetaModule, PatientsModule],
  controllers: [AssistantController],
  providers: [AssistantService, GeminiClient],
  exports: [AssistantService],
})
export class AssistantModule {}
