import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public, RequirePermission } from '@pugying/core';
import { ContentPermissions } from '@pugying/content/content.permissions';
import { InitMediaUploadDto } from '@pugying/content/application/dtos/init-media-upload.dto';
import { CheckMediaDuplicateDto } from '@pugying/content/application/dtos/check-media-duplicate.dto';
import { MediaService } from '@pugying/content/application/services/media.service';

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get('assets')
  @ApiBearerAuth()
  @RequirePermission(ContentPermissions.Contents.View)
  @ApiOperation({ summary: '当前团队媒体库列表' })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['all', 'video', 'image'],
    description: 'video=视频；image=封面图；默认全部',
  })
  listAssets(@Query('type') type?: string) {
    return this.mediaService.listAssets(type);
  }

  @Post('assets/check-duplicate')
  @ApiBearerAuth()
  @RequirePermission(ContentPermissions.Contents.Create)
  @ApiOperation({ summary: '按内容指纹检查团队库是否已有相同资源' })
  checkDuplicate(@Body() dto: CheckMediaDuplicateDto) {
    return this.mediaService.checkDuplicate(dto.kind, dto.checksumSha256);
  }

  @Post('uploads')
  @ApiBearerAuth()
  @RequirePermission(ContentPermissions.Contents.Create)
  @ApiOperation({ summary: '初始化分片上传会话' })
  initUpload(@Body() dto: InitMediaUploadDto) {
    return this.mediaService.initUpload(dto);
  }

  @Put('uploads/:uploadId/chunks/:index')
  @ApiBearerAuth()
  @RequirePermission(ContentPermissions.Contents.Create)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        chunk: { type: 'string', format: 'binary' },
      },
      required: ['chunk'],
    },
  })
  @UseInterceptors(
    FileInterceptor('chunk', {
      limits: { fileSize: 16 * 1024 * 1024 },
    }),
  )
  putChunk(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Param('index', ParseIntPipe) index: number,
    @UploadedFile() file: { buffer?: Buffer } | undefined,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('缺少分片文件字段 chunk');
    }
    return this.mediaService.putChunk(uploadId, index, file.buffer);
  }

  @Post('uploads/:uploadId/complete')
  @ApiBearerAuth()
  @RequirePermission(ContentPermissions.Contents.Create)
  @ApiOperation({ summary: '合并分片并登记媒体资产' })
  complete(@Param('uploadId', ParseUUIDPipe) uploadId: string) {
    return this.mediaService.completeUpload(uploadId);
  }

  @Post('assets/:id/signed-url')
  @ApiBearerAuth()
  @RequirePermission(ContentPermissions.Contents.View)
  @ApiOperation({ summary: '签发短时下载 URL（供 Agent 拉取）' })
  sign(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.createSignedDownloadUrlForTeam(id);
  }

  @Delete('assets/:id')
  @ApiBearerAuth()
  @RequirePermission(ContentPermissions.Contents.Delete)
  @ApiOperation({ summary: '软删媒体库资源' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.removeAsset(id);
  }

  @Get('assets/:id/download')
  @Public()
  @ApiOperation({ summary: '签名下载（无 JWT，供本机 Agent）' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.mediaService.openSignedDownload(
      id,
      exp ?? '',
      sig ?? '',
    );
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.sizeBytes));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );
    file.stream.pipe(res);
  }
}
