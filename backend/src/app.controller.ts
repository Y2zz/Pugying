import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CommercialModuleRegistry,
  Public,
  RequirePermission,
} from '@pugying/core';
import { AppService } from './app.service';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly commercialModuleRegistry: CommercialModuleRegistry,
  ) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('commercial-modules')
  @ApiBearerAuth()
  @RequirePermission('TeamManagement.Teams.View')
  @ApiOperation({ summary: '已注册的商业模块列表' })
  listCommercialModules() {
    return this.commercialModuleRegistry.getAll();
  }
}
