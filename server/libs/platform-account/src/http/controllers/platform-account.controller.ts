import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  BindPlatformAccountDto,
  ReauthPlatformAccountDto,
  RenamePlatformAccountDto,
} from '@pugying/platform-account/application/dtos';
import { PlatformAccountService } from '@pugying/platform-account/application/services/platform-account.service';

@ApiTags('platform-accounts')
@Controller('platform-accounts')
export class PlatformAccountController {
  constructor(private readonly service: PlatformAccountService) {}

  @Get('platforms')
  @ApiOperation({ summary: '可绑定的平台目录' })
  listPlatforms() {
    return this.service.listPlatforms();
  }

  @Get()
  @ApiOperation({ summary: '本机平台账号列表' })
  @ApiQuery({
    name: 'platform',
    required: false,
    enum: ['douyin', 'toutiao', 'channels', 'bilibili', 'xiaohongshu'],
    description: '按平台筛选；省略则返回全部',
  })
  @ApiResponse({ status: 200, description: '不含凭证明文' })
  findAll(@Query('platform') platform?: string) {
    return this.service.findAll(platform);
  }

  @Post()
  @ApiOperation({ summary: '绑定平台账号（Cookie 入库加密）' })
  bind(@Body() dto: BindPlatformAccountDto) {
    return this.service.bind(dto);
  }

  @Post(':id/reauth')
  @ApiOperation({ summary: '重新授权并更新凭证' })
  reauth(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReauthPlatformAccountDto,
  ) {
    return this.service.reauth(id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '重命名账号（资料抓取失败时的手动兜底）' })
  rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenamePlatformAccountDto,
  ) {
    return this.service.rename(id, dto.displayName);
  }

  @Post(':id/credentials')
  @ApiOperation({
    summary: '下发解密凭证（供桌面 Agent 打开创作者中心）',
  })
  @ApiResponse({ status: 200, description: '含 Cookie 明文，仅本地 Agent 使用' })
  getCredentials(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getCredentials(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除（软删）平台账号' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
