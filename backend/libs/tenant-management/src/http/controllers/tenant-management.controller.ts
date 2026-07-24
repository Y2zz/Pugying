import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '@pugying/core';
import { TenantManagementService } from '../../application/services/tenant-management.service';
import { Tenant } from '../../domain/entities/tenant.entity';
import { CreateTenantDto, UpdateTenantDto } from '../../application/dtos';
import { TenantManagementPermissions } from '../../tenant-management.permissions';

@ApiTags('tenant-management')
@ApiBearerAuth()
@Controller('tenant-management')
export class TenantManagementController {
  constructor(private readonly tenantService: TenantManagementService) {}

  @Post()
  @RequirePermission(TenantManagementPermissions.Tenants.Create)
  @ApiOperation({ summary: '创建租户' })
  @ApiResponse({ status: 201, description: '租户创建成功', type: Tenant })
  create(@Body() input: CreateTenantDto): Promise<Tenant> {
    return this.tenantService.create(input);
  }

  @Get()
  @RequirePermission(TenantManagementPermissions.Tenants.View)
  @ApiOperation({ summary: '获取所有租户' })
  @ApiResponse({ status: 200, description: '租户列表', type: [Tenant] })
  findAll(): Promise<Tenant[]> {
    return this.tenantService.findAll();
  }

  @Get(':id')
  @RequirePermission(TenantManagementPermissions.Tenants.View)
  @ApiOperation({ summary: '获取单个租户' })
  @ApiResponse({ status: 200, description: '租户详情', type: Tenant })
  @ApiResponse({ status: 404, description: '租户不存在' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Tenant> {
    return this.tenantService.findOne(id);
  }

  @Put(':id')
  @RequirePermission(TenantManagementPermissions.Tenants.Update)
  @ApiOperation({ summary: '更新租户' })
  @ApiResponse({ status: 200, description: '租户更新成功', type: Tenant })
  @ApiResponse({ status: 404, description: '租户不存在' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<Tenant> {
    return this.tenantService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(TenantManagementPermissions.Tenants.Delete)
  @ApiOperation({ summary: '删除租户' })
  @ApiResponse({ status: 200, description: '租户删除成功' })
  @ApiResponse({ status: 404, description: '租户不存在' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.tenantService.remove(id);
  }
}
