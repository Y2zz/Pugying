import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommercialModuleRegistry } from '@pugying/core';
import { AppService } from './app.service';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly commercialModuleRegistry: CommercialModuleRegistry,
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

  @Get('commercial-modules')
  @ApiOperation({ summary: '已注册的商业模块列表' })
  listCommercialModules() {
    return this.commercialModuleRegistry.getAll();
  }
}
