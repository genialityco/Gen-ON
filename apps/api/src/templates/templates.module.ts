import { Module } from '@nestjs/common';
import { MetaModule } from '../meta/meta.module';
import { TemplatesService } from './templates.service';
import { ProtocolsService } from './protocols.service';
import { LibraryController, OrgTemplatesController } from './templates.controller';

@Module({
  imports: [MetaModule],
  controllers: [OrgTemplatesController, LibraryController],
  providers: [TemplatesService, ProtocolsService],
  exports: [TemplatesService, ProtocolsService],
})
export class TemplatesModule {}
