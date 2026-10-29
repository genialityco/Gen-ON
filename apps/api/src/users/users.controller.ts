import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import {
  GLOBAL_ROLES,
  MEMBER_ROLES,
  type CreateUserInput,
  type GlobalRole,
  type MemberRole,
  type UpdateUserInput,
} from '@genon/shared';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { UsersService } from './users.service';

class MembershipDto {
  @IsString() org_id!: string;
  @IsIn(MEMBER_ROLES) role!: MemberRole;
}

class CreateUserDto implements CreateUserInput {
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string | null;
  @IsOptional() @IsIn([...GLOBAL_ROLES, null]) role?: GlobalRole | null;
  @IsOptional() @IsString() @MaxLength(128) password?: string | null;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MembershipDto) memberships?: MembershipDto[];
}

class UpdateUserDto implements UpdateUserInput {
  @IsOptional() @IsString() @MaxLength(120) name?: string | null;
  @IsOptional() @IsIn([...GLOBAL_ROLES, null]) role?: GlobalRole | null;
  @IsOptional() @IsBoolean() disabled?: boolean;
  @IsOptional() @IsString() @MaxLength(128) password?: string;
}

class SetMembershipDto {
  @IsIn(MEMBER_ROLES) role!: MemberRole;
}

/** Administración de cuentas: solo el superadmin. */
@Roles('superadmin')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() body: CreateUserDto) {
    return this.users.create(body);
  }

  @Get(':uid')
  get(@Param('uid') uid: string) {
    return this.users.get(uid);
  }

  @Patch(':uid')
  update(@Param('uid') uid: string, @Body() body: UpdateUserDto, @CurrentUser() user: AuthUser) {
    return this.users.update(uid, body, user);
  }

  @Put(':uid/memberships/:orgId')
  setMembership(@Param('uid') uid: string, @Param('orgId') orgId: string, @Body() body: SetMembershipDto) {
    return this.users.setMembership(uid, orgId, body.role);
  }

  @Delete(':uid/memberships/:orgId')
  removeMembership(@Param('uid') uid: string, @Param('orgId') orgId: string) {
    return this.users.removeMembership(uid, orgId);
  }
}
