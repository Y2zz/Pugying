import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ModuleRegistry } from '@pugying/core';
import { AppService } from './app.service';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly moduleRegistry: ModuleRegistry,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('version')
  @ApiOperation({ summary: '统一发版产品版本（供前端检测更新）' })
  getProductVersion() {
    return this.appService.getProductVersion();
  }

  @Get('modules')
  @ApiOperation({ summary: '已注册的模块列表' })
  listModules() {
    return this.moduleRegistry.getAll();
  }
}
