import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { FirebaseModule } from './firebase/firebase.module';
import { CommonModule } from './common/common.module';
import { FirebaseAuthGuard } from './auth/firebase-auth.guard';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { MetaModule } from './meta/meta.module';
import { TemplatesModule } from './templates/templates.module';
import { PatientsModule } from './patients/patients.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { UsersModule } from './users/users.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    FirebaseModule,
    CommonModule,
    AuthModule,
    OrganizationsModule,
    MetaModule,
    TemplatesModule,
    PatientsModule,
    WebhooksModule,
    UsersModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: FirebaseAuthGuard }],
})
export class AppModule {}
