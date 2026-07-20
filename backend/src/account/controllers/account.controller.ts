import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AccountService } from '../services/account.service';
import { Account } from '../entities/account.entity';
import { CreateAccountDto } from "../dtos/createAccountDto";
import { UpdateAccountDto } from '../dtos/updateAccountDto';

@ApiTags('accounts')
@Controller('accounts')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post()
  @ApiOperation({ summary: '创建账户' })
  @ApiResponse({ status: 201, description: '账户创建成功', type: Account })
  create(@Body() dto: CreateAccountDto): Promise<Account> {
    return this.accountService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '获取所有账户' })
  @ApiResponse({ status: 200, description: '账户列表', type: [Account] })
  findAll(): Promise<Account[]> {
    return this.accountService.findAll();
  }

  @Get('tenant-management/:tenantId')
  @ApiOperation({ summary: '获取租户下的账户' })
  @ApiResponse({ status: 200, description: '账户列表', type: [Account] })
  findByTenant(@Param('tenantId', ParseIntPipe) tenantId: number): Promise<Account[]> {
    return this.accountService.findByTenant(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单个账户' })
  @ApiResponse({ status: 200, description: '账户详情', type: Account })
  @ApiResponse({ status: 404, description: '账户不存在' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Account> {
    return this.accountService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新账户' })
  @ApiResponse({ status: 200, description: '账户更新成功', type: Account })
  @ApiResponse({ status: 404, description: '账户不存在' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAccountDto): Promise<Account> {
    return this.accountService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除账户' })
  @ApiResponse({ status: 200, description: '账户删除成功' })
  @ApiResponse({ status: 404, description: '账户不存在' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.accountService.remove(id);
  }
}
