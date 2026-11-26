import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { TemplatesModule } from '../templates/templates.module';
import { MetaModule } from '../meta/meta.module';
import { PatientsService } from './patients.service';
import { EnrollmentsService } from './enrollments.service';
import { OutboxService } from './outbox.service';
import { UsageService } from './usage.service';
import { AppointmentsService } from './appointments.service';
import { DispatcherService } from './dispatcher.service';
import { ChatService } from './chat.service';
import { AutoReplyService } from './auto-reply.service';
import { AlertNotifierService } from './alert-notifier.service';
import { AlertNotifyController } from './alert-notify.controller';
import { PatientsController } from './patients.controller';

@Module({
  imports: [OrganizationsModule, TemplatesModule, MetaModule],
  controllers: [PatientsController, AlertNotifyController],
  providers: [PatientsService, EnrollmentsService, AppointmentsService, OutboxService, UsageService, DispatcherService, AutoReplyService, AlertNotifierService, ChatService],
  exports: [PatientsService, OutboxService, AppointmentsService, AutoReplyService, AlertNotifierService, ChatService],
})
export class PatientsModule {}
