import { Body, Controller, Delete, Get, Param, Post, Put, UseFilters } from '@nestjs/common';
import { AuthUser, CurrentUser, OrgAccess, Roles } from '../auth/decorators';
import { MetaErrorFilter } from '../meta/meta-error.filter';
import { TemplatesService } from './templates.service';
import { ProtocolsService } from './protocols.service';
import { EXAMPLE_PROTOCOLS, EXAMPLE_TEMPLATES } from './library-examples';
import { CopyProtocolDto, ProtocolDto, TemplateDto } from './dto';

/** Plantillas y protocolos de una organización: los ve todo el equipo, los edita el administrador. */
@UseFilters(MetaErrorFilter)
@OrgAccess('operator')
@Controller('organizations/:orgId')
export class OrgTemplatesController {
  constructor(
    private readonly templates: TemplatesService,
    private readonly protocols: ProtocolsService,
  ) {}

  @Get('templates')
  listTemplates(@Param('orgId') orgId: string, @CurrentUser() user: AuthUser) {
    return this.templates.list({ orgId });
  }

  @OrgAccess('org_admin')
  @Post('templates')
  createTemplate(@Param('orgId') orgId: string, @Body() body: TemplateDto, @CurrentUser() user: AuthUser) {
    return this.templates.create({ orgId }, body);
  }

  @OrgAccess('org_admin')
  @Post('templates/sync')
  syncTemplates(@Param('orgId') orgId: string, @CurrentUser() user: AuthUser) {
    return this.templates.sync(orgId);
  }

  @OrgAccess('org_admin')
  @Put('templates/:id')
  updateTemplate(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: TemplateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.templates.update({ orgId }, id, body);
  }

  @OrgAccess('org_admin')
  @Delete('templates/:id')
  async removeTemplate(@Param('orgId') orgId: string, @Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.templates.remove({ orgId }, id, (key) => this.protocols.usingTemplate({ orgId }, key));
    return { ok: true };
  }

  @OrgAccess('org_admin')
  @Post('templates/:id/submit')
  submitTemplate(@Param('orgId') orgId: string, @Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.templates.submit(orgId, id);
  }

  @Get('protocols')
  listProtocols(@Param('orgId') orgId: string, @CurrentUser() user: AuthUser) {
    return this.protocols.list({ orgId });
  }

  @OrgAccess('org_admin')
  @Post('protocols')
  createProtocol(@Param('orgId') orgId: string, @Body() body: ProtocolDto, @CurrentUser() user: AuthUser) {
    return this.protocols.create({ orgId }, body);
  }

  @OrgAccess('org_admin')
  @Post('protocols/copy')
  copyProtocol(@Param('orgId') orgId: string, @Body() body: CopyProtocolDto, @CurrentUser() user: AuthUser) {
    return this.protocols.copyFromLibrary(body.library_id, orgId);
  }

  @OrgAccess('org_admin')
  @Put('protocols/:id')
  updateProtocol(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: ProtocolDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.protocols.update({ orgId }, id, body);
  }

  @OrgAccess('org_admin')
  @Delete('protocols/:id')
  async removeProtocol(@Param('orgId') orgId: string, @Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.protocols.remove({ orgId }, id);
    return { ok: true };
  }
}

/** Biblioteca global: la consultan todos, la edita Gen.iality. */
@Controller('library')
export class LibraryController {
  constructor(
    private readonly templates: TemplatesService,
    private readonly protocols: ProtocolsService,
  ) {}

  @Get('templates')
  listTemplates() {
    return this.templates.list('library');
  }

  @Roles('superadmin')
  @Post('templates')
  createTemplate(@Body() body: TemplateDto) {
    return this.templates.create('library', body);
  }

  @Roles('superadmin')
  @Put('templates/:id')
  updateTemplate(@Param('id') id: string, @Body() body: TemplateDto) {
    return this.templates.update('library', id, body);
  }

  @Roles('superadmin')
  @Delete('templates/:id')
  async removeTemplate(@Param('id') id: string) {
    await this.templates.remove('library', id, (key) => this.protocols.usingTemplate('library', key));
    return { ok: true };
  }

  @Get('protocols')
  listProtocols() {
    return this.protocols.list('library');
  }

  @Roles('superadmin')
  @Post('protocols')
  createProtocol(@Body() body: ProtocolDto) {
    return this.protocols.create('library', body);
  }

  @Roles('superadmin')
  @Put('protocols/:id')
  updateProtocol(@Param('id') id: string, @Body() body: ProtocolDto) {
    return this.protocols.update('library', id, body);
  }

  @Roles('superadmin')
  @Delete('protocols/:id')
  async removeProtocol(@Param('id') id: string) {
    await this.protocols.remove('library', id);
    return { ok: true };
  }

  /** Carga los ejemplos que falten (no toca los existentes). */
  @Roles('superadmin')
  @Post('seed')
  async seed() {
    const keys = await this.templates.keys('library');
    let templates = 0;
    for (const t of EXAMPLE_TEMPLATES) {
      if (keys.has(t.key!)) continue;
      await this.templates.create('library', t);
      templates++;
    }
    const names = new Set((await this.protocols.list('library')).map((p) => p.name));
    let protocols = 0;
    for (const p of EXAMPLE_PROTOCOLS) {
      if (names.has(p.name)) continue;
      await this.protocols.create('library', p);
      protocols++;
    }
    return { templates, protocols };
  }
}
