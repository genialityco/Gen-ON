import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { ClinicalService } from './clinical.service';
import { ClinicalController, ClinicalImportController } from './clinical.controller';

@Module({
  imports: [PatientsModule],
  controllers: [ClinicalController, ClinicalImportController],
  providers: [ClinicalService],
  exports: [ClinicalService],
})
export class ClinicalModule {}
