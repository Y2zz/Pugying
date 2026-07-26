import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '@pugying/core';
import {
  BindPlatformAccountDto,
  ReauthPlatformAccountDto,
  RenamePlatformAccountDto,
} from '@pugying/platform-account/application/dtos';
import { PlatformAccountService } from '@pugying/platform-account/application/services/platform-account.service';
import { PlatformAccountPermissions } from '@pugying/platform-account/platform-account.permissions';

@ApiTags('platform-accounts')
@ApiBearerAuth()
@Controller('platform-accounts')
export class PlatformAccountController {
  constructor(private readonly service: PlatformAccountService) {}

  @Get('platforms')
  @RequirePermission(PlatformAccountPermissions.Accounts.View)
  @ApiOperation({ summary: '可绑定的平台目录' })
  listPlatforms() {
    return this.service.listPlatforms();
  }

  @Get()
  @RequirePermission(PlatformAccountPermissions.Accounts.View)
  @ApiOperation({ summary: '当前团队的平台账号列表' })
  @ApiResponse({ status: 200, description: '不含凭证明文' })
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @RequirePermission(PlatformAccountPermissions.Accounts.Create)
  @ApiOperation({ summary: '绑定平台账号（Cookie 入库加密）' })
  bind(@Body() dto: BindPlatformAccountDto) {
    return this.service.bind(dto);
  }

  @Post(':id/reauth')
  @RequirePermission(PlatformAccountPermissions.Accounts.Update)
  @ApiOperation({ summary: '重新授权并更新凭证' })
  reauth(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReauthPlatformAccountDto,
  ) {
    return this.service.reauth(id, dto);
  }

  @Patch(':id')
  @RequirePermission(PlatformAccountPermissions.Accounts.Update)
  @ApiOperation({ summary: '重命名账号（资料抓取失败时的手动兜底）' })
  rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenamePlatformAccountDto,
  ) {
    return this.service.rename(id, dto.displayName);
  }

  @Post(':id/credentials')
  @RequirePermission(PlatformAccountPermissions.Accounts.Update)
  @ApiOperation({
    summary: '下发解密凭证（供桌面 Agent 打开创作者中心）',
  })
  @ApiResponse({ status: 200, description: '含 Cookie 明文，仅本地 Agent 使用' })
  getCredentials(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getCredentials(id);
  }

  @Delete(':id')
  @RequirePermission(PlatformAccountPermissions.Accounts.Delete)
  @ApiOperation({ summary: '删除（软删）平台账号' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
