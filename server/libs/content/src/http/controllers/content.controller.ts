import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  CreateContentDto,
  ReportPublishResultDto,
  UpdateContentDto,
} from '@pugying/content/application/dtos';
import { ContentPublishService } from '@pugying/content/application/services/content-publish.service';
import { ContentService } from '@pugying/content/application/services/content.service';

@ApiTags('contents')
@Controller('contents')
export class ContentController {
  constructor(
    private readonly service: ContentService,
    private readonly publishService: ContentPublishService,
  ) {}

  @Get()
  @ApiOperation({ summary: '本机内容列表' })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['article', 'graphic', 'video'],
  })
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
  @ApiOperation({ summary: '内容详情（不含封面字节）' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Get(':id/cover')
  @ApiOperation({ summary: '竖版封面二进制' })
  async getCover(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    return this.streamCover(res, () => this.service.getCoverBinary(id, 'portrait'));
  }

  @Get(':id/cover-landscape')
  @ApiOperation({ summary: '横版封面二进制' })
  async getCoverLandscape(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    return this.streamCover(res, () =>
      this.service.getCoverBinary(id, 'landscape'),
    );
  }

  @Put(':id/cover')
  @ApiOperation({ summary: '上传/替换竖版封面' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  putCover(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer?: Buffer; mimetype?: string } | undefined,
  ) {
    return this.service.putCover(id, 'portrait', file);
  }

  @Put(':id/cover-landscape')
  @ApiOperation({ summary: '上传/替换横版封面' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  putCoverLandscape(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer?: Buffer; mimetype?: string } | undefined,
  ) {
    return this.service.putCover(id, 'landscape', file);
  }

  @Delete(':id/cover')
  @ApiOperation({ summary: '清除竖版封面' })
  deleteCover(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteCover(id, 'portrait');
  }

  @Delete(':id/cover-landscape')
  @ApiOperation({ summary: '清除横版封面' })
  deleteCoverLandscape(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteCover(id, 'landscape');
  }

  @Get(':id/targets/:targetId/cover')
  @ApiOperation({
    summary: '账号差异竖封面；无差异返回 404，前端回落内容级',
  })
  async getTargetCover(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Res() res: Response,
  ) {
    return this.streamCover(res, () =>
      this.service.getTargetCoverBinary(id, targetId, 'portrait'),
    );
  }

  @Get(':id/targets/:targetId/cover-landscape')
  @ApiOperation({
    summary: '账号差异横封面；无差异返回 404，前端回落内容级',
  })
  async getTargetCoverLandscape(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Res() res: Response,
  ) {
    return this.streamCover(res, () =>
      this.service.getTargetCoverBinary(id, targetId, 'landscape'),
    );
  }

  @Put(':id/targets/:targetId/cover')
  @ApiOperation({ summary: '上传账号差异竖封面' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  putTargetCover(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @UploadedFile() file: { buffer?: Buffer; mimetype?: string } | undefined,
  ) {
    return this.service.putTargetCover(id, targetId, 'portrait', file);
  }

  @Put(':id/targets/:targetId/cover-landscape')
  @ApiOperation({ summary: '上传账号差异横封面' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  putTargetCoverLandscape(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @UploadedFile() file: { buffer?: Buffer; mimetype?: string } | undefined,
  ) {
    return this.service.putTargetCover(id, targetId, 'landscape', file);
  }

  @Delete(':id/targets/:targetId/cover')
  @ApiOperation({ summary: '清除账号差异竖封面（回落内容级）' })
  deleteTargetCover(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ) {
    return this.service.deleteTargetCover(id, targetId, 'portrait');
  }

  @Delete(':id/targets/:targetId/cover-landscape')
  @ApiOperation({ summary: '清除账号差异横封面（回落内容级）' })
  deleteTargetCoverLandscape(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ) {
    return this.service.deleteTargetCover(id, targetId, 'landscape');
  }

  @Post()
  @ApiOperation({ summary: '创建内容（文章/图文/视频，草稿或直接发布）' })
  create(@Body() dto: CreateContentDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新内容 / 变更状态' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContentDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除（软删）内容' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Post(':id/publish')
  @ApiOperation({
    summary: '幂等发布：入队未成功 Target，下发本机路径 + Cookie',
  })
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.publishService.publish(id);
  }

  @Post(':id/targets/:targetId/start')
  @ApiOperation({ summary: '开始执行单个 Target（queued → running）并刷新下发载荷' })
  startTarget(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ) {
    return this.publishService.startTarget(id, targetId);
  }

  @Post(':id/targets/:targetId/complete')
  @ApiOperation({ summary: '回写单个 Target 发布结果' })
  completeTarget(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Body() dto: ReportPublishResultDto,
  ) {
    return this.publishService.completeTarget(id, targetId, dto);
  }

  @Post(':id/targets/:targetId/cancel')
  @ApiOperation({ summary: '取消单个 Target（queued / running）' })
  cancelTarget(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ) {
    return this.publishService.cancelTarget(id, targetId);
  }

  @Post(':id/targets/:targetId/retry')
  @ApiOperation({ summary: '重试失败/已取消 Target，返回下发载荷' })
  retryTarget(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ) {
    return this.publishService.retryTarget(id, targetId);
  }

  private async streamCover(
    res: Response,
    loader: () => Promise<{ mime: string; data: Buffer }>,
  ): Promise<void> {
    const cover = await loader();
    res.setHeader('Content-Type', cover.mime);
    res.setHeader('Content-Length', String(cover.data.length));
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(cover.data);
  }
}
