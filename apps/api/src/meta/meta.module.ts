import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { MetaGraphClient } from './graph.client';
import { MetaConnectionStore } from './meta-connection.store';
import { MetaSetupService } from './meta-setup.service';
import { MetaSetupController } from './meta-setup.controller';

@Module({
  imports: [OrganizationsModule],
  controllers: [MetaSetupController],
  providers: [MetaGraphClient, MetaConnectionStore, MetaSetupService],
  exports: [MetaGraphClient, MetaConnectionStore, MetaSetupService],
})
export class MetaModule {}
