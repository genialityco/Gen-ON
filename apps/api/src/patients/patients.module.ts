import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { TemplatesModule } from '../templates/templates.module';
import { MetaModule } from '../meta/meta.module';
import { PatientsService } from './patients.service';
import { EnrollmentsService } from './enrollments.service';
import { OutboxService } from './outbox.service';
import { UsageService } from './usage.service';
import { DispatcherService } from './dispatcher.service';
import { PatientsController } from './patients.controller';

@Module({
  imports: [OrganizationsModule, TemplatesModule, MetaModule],
  controllers: [PatientsController],
  providers: [PatientsService, EnrollmentsService, OutboxService, UsageService, DispatcherService],
  exports: [PatientsService, OutboxService],
})
export class PatientsModule {}
