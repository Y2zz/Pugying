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
  CurrentUser,
  Public,
  RequirePermission,
  type AuthenticatedUser,
} from '@pugying/core';
import { IdentityService } from '../../application/services/identity.service';
import { User } from '../../domain/entities/user.entity';
import { CreateUserDto, LoginDto, UpdateUserDto } from '../../application/dtos';
import { IdentityPermissions } from '../../identity.permissions';

@ApiTags('identity')
@Controller('identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: '用户登录' })
  @ApiResponse({ status: 201, description: '登录成功' })
  @ApiResponse({ status: 401, description: '邮箱或密码错误' })
  login(@Body() dto: LoginDto) {
    return this.identityService.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前登录用户' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Post('users')
  @ApiBearerAuth()
  @RequirePermission(IdentityPermissions.Users.Create)
  @ApiOperation({ summary: '创建用户' })
  @ApiResponse({ status: 201, description: '用户创建成功', type: User })
  async create(@Body() dto: CreateUserDto) {
    const user = await this.identityService.create(dto);
    return this.identityService.toPublicUser(user);
  }

  @Get('users')
  @ApiBearerAuth()
  @RequirePermission(IdentityPermissions.Users.View)
  @ApiOperation({ summary: '获取用户列表（受 X-Tenant-Id 隔离）' })
  @ApiResponse({ status: 200, description: '用户列表', type: [User] })
  async findAll() {
    const users = await this.identityService.findAll();
    return users.map((user) => this.identityService.toPublicUser(user));
  }

  @Get('users/tenant/:tenantId')
  @ApiBearerAuth()
  @RequirePermission(IdentityPermissions.Users.View)
  @ApiOperation({ summary: '获取指定租户下的用户' })
  async findByTenant(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    const users = await this.identityService.findByTenant(tenantId);
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
  @ApiOperation({ summary: '删除用户' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.identityService.remove(id);
  }
}
