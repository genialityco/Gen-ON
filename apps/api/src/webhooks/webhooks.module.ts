import { Module } from '@nestjs/common';
import { MetaModule } from '../meta/meta.module';
import { TemplatesModule } from '../templates/templates.module';
import { PatientsModule } from '../patients/patients.module';
import { AssistantModule } from '../assistant/assistant.module';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [MetaModule, TemplatesModule, PatientsModule, AssistantModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhooksModule {}
