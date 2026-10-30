import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { ClinicalService } from './clinical.service';
import { ClinicalController } from './clinical.controller';

@Module({
  imports: [PatientsModule],
  controllers: [ClinicalController],
  providers: [ClinicalService],
})
export class ClinicalModule {}
