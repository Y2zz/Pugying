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
  UpdateContentDto,
} from '@pugying/content/application/dtos';
import { ContentService } from '@pugying/content/application/services/content.service';
import { ContentPermissions } from '@pugying/content/content.permissions';

@ApiTags('contents')
@ApiBearerAuth()
@Controller('contents')
export class ContentController {
  constructor(private readonly service: ContentService) {}

  @Get()
  @RequirePermission(ContentPermissions.Contents.View)
  @ApiOperation({ summary: '当前团队的内容列表' })
  @ApiQuery({ name: 'type', required: false, enum: ['article', 'video'] })
  findAll(@Query('type') type?: string) {
    return this.service.findAll(type);
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
}
