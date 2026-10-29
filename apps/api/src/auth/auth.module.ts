import { Global, Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MembershipsService } from './memberships.service';

@Global()
@Module({
  controllers: [MeController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class AuthModule {}
