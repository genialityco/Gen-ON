import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { AuthUser, CurrentUser, OrgAccess } from '../auth/decorators';
import { AssistantService } from './assistant.service';
import { AssistantSettingsDto, AssistantTestDto, KnowledgeDto } from './dto';

/** Asistente con IA: lo configura y aprueba su contenido el administrador de la clínica. */
@OrgAccess('org_admin')
@Controller('organizations/:orgId/assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Patch()
  settings(@Param('orgId') orgId: string, @Body() body: AssistantSettingsDto, @CurrentUser() user: AuthUser) {
    return this.assistant.updateSettings(orgId, body);
  }

  @Get('knowledge')
  list(@Param('orgId') orgId: string, @CurrentUser() user: AuthUser) {
    return this.assistant.listKnowledge(orgId);
  }

  @Post('knowledge')
  create(@Param('orgId') orgId: string, @Body() body: KnowledgeDto, @CurrentUser() user: AuthUser) {
    return this.assistant.saveKnowledge(orgId, null, body, user);
  }

  @Put('knowledge/:id')
  update(@Param('orgId') orgId: string, @Param('id') id: string, @Body() body: KnowledgeDto, @CurrentUser() user: AuthUser) {
    return this.assistant.saveKnowledge(orgId, id, body, user);
  }

  @Delete('knowledge/:id')
  remove(@Param('orgId') orgId: string, @Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.assistant.removeKnowledge(orgId, id);
  }

  /** Conversación de prueba (opcionalmente como un paciente): muestra lo que respondería, sin enviar nada. */
  @Post('test')
  test(@Param('orgId') orgId: string, @Body() body: AssistantTestDto, @CurrentUser() user: AuthUser) {
    return this.assistant.test(orgId, body);
  }
}
