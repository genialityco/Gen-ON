import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { TemplatesModule } from '../templates/templates.module';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [OrganizationsModule, TemplatesModule],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}
