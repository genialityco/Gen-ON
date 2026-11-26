import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { MetaGraphClient } from './graph.client';
import { MetaConnectionStore } from './meta-connection.store';
import { MetaPlatform } from './meta-platform';
import { MetaSetupService } from './meta-setup.service';
import { EmbeddedSignupService } from './embedded-signup.service';
import { MetaSetupController } from './meta-setup.controller';

@Module({
  imports: [OrganizationsModule],
  controllers: [MetaSetupController],
  providers: [MetaGraphClient, MetaPlatform, MetaConnectionStore, MetaSetupService, EmbeddedSignupService],
  exports: [MetaGraphClient, MetaPlatform, MetaConnectionStore, MetaSetupService, EmbeddedSignupService],
})
export class MetaModule {}
