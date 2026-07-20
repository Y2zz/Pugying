import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantManagementService } from '../services/tenant-management.service';
import { Tenant } from '../entities/tenant.entity';
import { CreateTenantDto, UpdateTenantDto } from '../dtos';

@ApiTags('tenant-management')
@Controller('tenant-management')
export class TenantManagementController {
  constructor(private readonly tenantService: TenantManagementService) {}

  @Post()
  @ApiOperation({ summary: '创建租户' })
  @ApiResponse({ status: 201, description: '租户创建成功', type: Tenant })
  create(@Body() dto: CreateTenantDto): Promise<Tenant> {
    return this.tenantService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '获取所有租户' })
  @ApiResponse({ status: 200, description: '租户列表', type: [Tenant] })
  findAll(): Promise<Tenant[]> {
    return this.tenantService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单个租户' })
  @ApiResponse({ status: 200, description: '租户详情', type: Tenant })
  @ApiResponse({ status: 404, description: '租户不存在' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Tenant> {
    return this.tenantService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新租户' })
  @ApiResponse({ status: 200, description: '租户更新成功', type: Tenant })
  @ApiResponse({ status: 404, description: '租户不存在' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTenantDto): Promise<Tenant> {
    return this.tenantService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除租户' })
  @ApiResponse({ status: 200, description: '租户删除成功' })
  @ApiResponse({ status: 404, description: '租户不存在' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.tenantService.remove(id);
  }
}
