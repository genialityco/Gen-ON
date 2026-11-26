import { Body, Controller, Get, Headers, HttpCode, Post, Query, RawBodyRequest, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators';
import { WebhookService } from './webhook.service';

/**
 * Webhook de la app de Gen.iality (proveedor de tecnología): /webhooks/meta.
 * Le llegan los eventos de todas las cuentas de WhatsApp conectadas con el
 * Registro insertado. Las conectadas a mano siguen con /webhooks/meta/{orgId}.
 */
@Public()
@Controller('webhooks/meta')
export class PlatformWebhookController {
  constructor(private readonly webhooks: WebhookService) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    return this.webhooks.verifyPlatform(mode, token, challenge);
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: unknown,
  ) {
    await this.webhooks.receivePlatform(req.rawBody, signature, body);
    return { ok: true };
  }
}
