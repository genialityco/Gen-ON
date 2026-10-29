import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { ORG_ROLES, type OrgRole } from '@genon/shared';
import { AuthUser, CurrentUser, OrgAccess, Roles } from '../auth/decorators';
import { OrganizationsService } from './organizations.service';
import {
  AddMemberDto,
  CreateOrganizationDto,
  OrganizationSettingsDto,
  UpdateOrganizationDto,
} from './dto';

class UpdateMemberDto {
  @IsIn(ORG_ROLES) role!: OrgRole;
}

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Roles('superadmin', 'staff')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.orgs.list(user);
  }

  @Roles('superadmin')
  @Post()
  create(@Body() body: CreateOrganizationDto, @CurrentUser() user: AuthUser) {
    return this.orgs.create(body, user.uid);
  }

  @OrgAccess('operator')
  @Get(':orgId')
  get(@Param('orgId') orgId: string) {
    return this.orgs.get(orgId);
  }

  /** Plan, estado y datos base: solo el superadmin. */
  @Roles('superadmin')
  @Patch(':orgId')
  update(@Param('orgId') orgId: string, @Body() body: UpdateOrganizationDto) {
    return this.orgs.update(orgId, body);
  }

  @OrgAccess('org_admin')
  @Patch(':orgId/settings')
  settings(@Param('orgId') orgId: string, @Body() body: OrganizationSettingsDto) {
    return this.orgs.updateSettings(orgId, body);
  }

  @OrgAccess('org_admin')
  @Get(':orgId/members')
  members(@Param('orgId') orgId: string) {
    return this.orgs.listMembers(orgId);
  }

  @OrgAccess('org_admin')
  @Post(':orgId/members')
  addMember(@Param('orgId') orgId: string, @Body() body: AddMemberDto) {
    return this.orgs.addMember(orgId, body);
  }

  @OrgAccess('org_admin')
  @Patch(':orgId/members/:uid')
  async updateMember(
    @Param('orgId') orgId: string,
    @Param('uid') uid: string,
    @Body() body: UpdateMemberDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (uid === user.uid) throw new ForbiddenException('No puedes cambiar tu propio rol');
    await this.orgs.updateMemberRole(orgId, uid, body.role);
    return { ok: true };
  }

  @OrgAccess('org_admin')
  @Delete(':orgId/members/:uid')
  async removeMember(@Param('orgId') orgId: string, @Param('uid') uid: string, @CurrentUser() user: AuthUser) {
    if (uid === user.uid) throw new ForbiddenException('No puedes quitarte a ti mismo');
    await this.orgs.removeMember(orgId, uid);
    return { ok: true };
  }
}
