import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '@pugying/core';
import { TeamManagementService } from '@pugying/team-management/application/services/team-management.service';
import { Team } from '@pugying/team-management/domain/entities/team.entity';
import { CreateTeamDto, UpdateTeamDto } from '@pugying/team-management/application/dtos';
import { TeamManagementPermissions } from '@pugying/team-management/team-management.permissions';

@ApiTags('team-management')
@ApiBearerAuth()
@Controller('team-management')
export class TeamManagementController {
  constructor(private readonly teamService: TeamManagementService) {}

  @Post()
  @RequirePermission(TeamManagementPermissions.Teams.Create)
  @ApiOperation({ summary: '创建团队' })
  @ApiResponse({ status: 201, description: '团队创建成功', type: Team })
  create(@Body() input: CreateTeamDto): Promise<Team> {
    return this.teamService.create(input);
  }

  @Get()
  @RequirePermission(TeamManagementPermissions.Teams.View)
  @ApiOperation({ summary: '获取所有团队' })
  @ApiResponse({ status: 200, description: '团队列表', type: [Team] })
  findAll(): Promise<Team[]> {
    return this.teamService.findAll();
  }

  @Get(':id')
  @RequirePermission(TeamManagementPermissions.Teams.View)
  @ApiOperation({ summary: '获取单个团队' })
  @ApiResponse({ status: 200, description: '团队详情', type: Team })
  @ApiResponse({ status: 404, description: '团队不存在' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Team> {
    return this.teamService.findOne(id);
  }

  @Put(':id')
  @RequirePermission(TeamManagementPermissions.Teams.Update)
  @ApiOperation({ summary: '更新团队' })
  @ApiResponse({ status: 200, description: '团队更新成功', type: Team })
  @ApiResponse({ status: 404, description: '团队不存在' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeamDto,
  ): Promise<Team> {
    return this.teamService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(TeamManagementPermissions.Teams.Delete)
  @ApiOperation({ summary: '删除团队' })
  @ApiResponse({ status: 200, description: '团队删除成功' })
  @ApiResponse({ status: 404, description: '团队不存在' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.teamService.remove(id);
  }
}
