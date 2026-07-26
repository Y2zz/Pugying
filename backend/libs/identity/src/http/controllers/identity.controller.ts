import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentTeam,
  CurrentUser,
  RequirePermission,
  type AuthenticatedUser,
} from '@pugying/core';
import { IdentityService } from '@pugying/identity/application/services/identity.service';
import { User } from '@pugying/identity/domain/entities/user.entity';
import { Role } from '@pugying/identity/domain/entities/role.entity';
import {
  AssignRoleDto,
  CreateRoleDto,
  CreateUserDto,
  UpdateRoleDto,
  UpdateUserDto,
} from '@pugying/identity/application/dtos';
import { IdentityPermissions } from '@pugying/identity/identity.permissions';

@ApiTags('identity')
@Controller('identity')
export class IdentityController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly currentTeam: CurrentTeam,
  ) {}

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前登录用户' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Post('users')
  @ApiBearerAuth()
  @RequirePermission(IdentityPermissions.Users.Create)
  @ApiOperation({ summary: '创建用户（全局身份；团队关系由 account-pro 邀请）' })
  @ApiResponse({ status: 201, description: '用户创建成功', type: User })
  async create(@Body() dto: CreateUserDto) {
    const user = await this.identityService.create(dto);
    return this.identityService.toPublicUser(user);
  }

  @Get('users')
  @ApiBearerAuth()
  @RequirePermission(IdentityPermissions.Users.View)
  @ApiOperation({ summary: '获取用户列表（受当前团队 membership 隔离）' })
  @ApiResponse({ status: 200, description: '用户列表', type: [User] })
  async findAll() {
    const users = await this.identityService.findAll();
    return users.map((user) => this.identityService.toPublicUser(user));
  }

  @Get('users/team/:teamId')
  @ApiBearerAuth()
  @RequirePermission(IdentityPermissions.Users.View)
  @ApiOperation({ summary: '获取指定团队下的用户' })
  async findByTeam(@Param('teamId', ParseUUIDPipe) teamId: string) {
    const users = await this.identityService.findByTeam(teamId);
    return users.map((user) => this.identityService.toPublicUser(user));
  }

  @Get('users/:id')
  @ApiBearerAuth()
  @RequirePermission(IdentityPermissions.Users.View)
  @ApiOperation({ summary: '获取单个用户' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.identityService.findOne(id);
    return this.identityService.toPublicUser(user);
  }

  @Put('users/:id')
  @ApiBearerAuth()
  @RequirePermission(IdentityPermissions.Users.Update)
  @ApiOperation({ summary: '更新用户' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const user = await this.identityService.update(id, dto);
    return this.identityService.toPublicUser(user);
  }

  @Delete('users/:id')
  @ApiBearerAuth()
  @RequirePermission(IdentityPermissions.Users.Delete)
  @ApiOperation({ summary: '删除用户（软删）' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.identityService.remove(id);
  }

  @Post('users/:id/roles')
  @ApiBearerAuth()
  @RequirePermission(IdentityPermissions.Roles.Update)
  @ApiOperation({ summary: '为用户分配角色' })
  assignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
  ): Promise<void> {
    return this.identityService.assignRole(id, dto);
  }

  @Delete('users/:id/roles/:roleId')
  @ApiBearerAuth()
  @RequirePermission(IdentityPermissions.Roles.Update)
  @ApiOperation({ summary: '移除用户角色' })
  unassignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ): Promise<void> {
    return this.identityService.unassignRole(id, roleId);
  }

  @Post('roles')
  @ApiBearerAuth()
  @RequirePermission(IdentityPermissions.Roles.Create)
  @ApiOperation({ summary: '创建角色' })
  @ApiResponse({ status: 201, type: Role })
  createRole(@Body() dto: CreateRoleDto) {
    return this.identityService.createRole(dto);
  }

  @Get('roles')
  @ApiBearerAuth()
  @RequirePermission(IdentityPermissions.Roles.View)
  @ApiOperation({ summary: '当前团队角色列表' })
  findRoles() {
    if (!this.currentTeam.isAvailable) {
      return [];
    }
    return this.identityService.findRoles(this.currentTeam.id!);
  }

  @Get('roles/:id')
  @ApiBearerAuth()
  @RequirePermission(IdentityPermissions.Roles.View)
  findRole(@Param('id', ParseUUIDPipe) id: string) {
    return this.identityService.findRole(id);
  }

  @Put('roles/:id')
  @ApiBearerAuth()
  @RequirePermission(IdentityPermissions.Roles.Update)
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.identityService.updateRole(id, dto);
  }

  @Delete('roles/:id')
  @ApiBearerAuth()
  @RequirePermission(IdentityPermissions.Roles.Delete)
  removeRole(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.identityService.removeRole(id);
  }
}
