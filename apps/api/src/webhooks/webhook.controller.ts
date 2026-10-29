import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators';
import { WebhookService } from './webhook.service';

/** URL de webhook propia de cada organización: /webhooks/meta/{orgId}. */
@Public()
@Controller('webhooks/meta/:orgId')
export class WebhookController {
  constructor(private readonly webhooks: WebhookService) {}

  @Get()
  verify(
    @Param('orgId') orgId: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    return this.webhooks.verify(orgId, mode, token, challenge);
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Param('orgId') orgId: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: unknown,
  ) {
    await this.webhooks.receive(orgId, req.rawBody, signature, body);
    return { ok: true };
  }
}
