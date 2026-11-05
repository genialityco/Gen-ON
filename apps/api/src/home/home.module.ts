import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { TemplatesModule } from '../templates/templates.module';
import { PatientsModule } from '../patients/patients.module';
import { HomeService } from './home.service';
import { HomeController } from './home.controller';

@Module({
  imports: [OrganizationsModule, TemplatesModule, PatientsModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
