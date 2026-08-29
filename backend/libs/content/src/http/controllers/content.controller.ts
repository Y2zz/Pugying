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
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '@pugying/core';
import {
  CreateContentDto,
  ReportPublishResultDto,
  UpdateContentDto,
} from '@pugying/content/application/dtos';
import { ContentPublishService } from '@pugying/content/application/services/content-publish.service';
import { ContentService } from '@pugying/content/application/services/content.service';
import { ContentPermissions } from '@pugying/content/content.permissions';

@ApiTags('contents')
@ApiBearerAuth()
@Controller('contents')
export class ContentController {
  constructor(
    private readonly service: ContentService,
    private readonly publishService: ContentPublishService,
  ) {}

  @Get()
  @RequirePermission(ContentPermissions.Contents.View)
  @ApiOperation({ summary: '当前团队的内容列表' })
  @ApiQuery({ name: 'type', required: false, enum: ['article', 'video'] })
  @ApiQuery({
    name: 'q',
    required: false,
    description: '关键词：匹配标题、正文、标签',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  findAll(
    @Query('type') type?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const parsedPage = page !== undefined && page !== '' ? Number(page) : 1;
    const parsedPageSize =
      pageSize !== undefined && pageSize !== '' ? Number(pageSize) : 20;
    return this.service.findAll(type, q, parsedPage, parsedPageSize);
  }

  @Get(':id')
  @RequirePermission(ContentPermissions.Contents.View)
  @ApiOperation({ summary: '内容详情' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Post()
  @RequirePermission(ContentPermissions.Contents.Create)
  @ApiOperation({ summary: '创建内容（图文/视频，草稿或直接发布）' })
  create(@Body() dto: CreateContentDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @RequirePermission(ContentPermissions.Contents.Update)
  @ApiOperation({ summary: '更新内容 / 变更状态' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContentDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(ContentPermissions.Contents.Delete)
  @ApiOperation({ summary: '删除（软删）内容' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Post(':id/publish')
  @RequirePermission(ContentPermissions.Contents.Update)
  @ApiOperation({
    summary: '幂等发布：入队未成功 Target，下发签名 URL + Cookie（浏览器编排 Agent）',
  })
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.publishService.publish(id);
  }

  @Post(':id/targets/:targetId/start')
  @RequirePermission(ContentPermissions.Contents.Update)
  @ApiOperation({ summary: '开始执行单个 Target（queued → running）并刷新下发载荷' })
  startTarget(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ) {
    return this.publishService.startTarget(id, targetId);
  }

  @Post(':id/targets/:targetId/complete')
  @RequirePermission(ContentPermissions.Contents.Update)
  @ApiOperation({ summary: '回写单个 Target 发布结果' })
  completeTarget(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Body() dto: ReportPublishResultDto,
  ) {
    return this.publishService.completeTarget(id, targetId, dto);
  }

  @Post(':id/targets/:targetId/cancel')
  @RequirePermission(ContentPermissions.Contents.Update)
  @ApiOperation({ summary: '取消单个 Target（queued / running）' })
  cancelTarget(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ) {
    return this.publishService.cancelTarget(id, targetId);
  }

  @Post(':id/targets/:targetId/retry')
  @RequirePermission(ContentPermissions.Contents.Update)
  @ApiOperation({ summary: '重试失败/已取消 Target，返回下发载荷' })
  retryTarget(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ) {
    return this.publishService.retryTarget(id, targetId);
  }
}
