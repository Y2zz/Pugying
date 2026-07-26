import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ITeamManagementRepository } from '@pugying/team-management/domain/repositories/team-management.repository';
import { TEAM_REPOSITORY } from '@pugying/team-management/domain/repositories/team-management.repository';
import { Team } from '@pugying/team-management/domain/entities/team.entity';
import { CreateTeamDto, UpdateTeamDto } from '@pugying/team-management/application/dtos';

@Injectable()
export class TeamManagementService {
  constructor(
    @Inject(TEAM_REPOSITORY)
    private readonly teamManagementRepository: ITeamManagementRepository,
  ) {}

  async create(dto: CreateTeamDto): Promise<Team> {
    const team = this.teamManagementRepository.create({
      ...dto,
      active: true,
    });
    return this.teamManagementRepository.save(team);
  }

  async findAll(): Promise<Team[]> {
    return this.teamManagementRepository.findAll();
  }

  async findOne(id: string): Promise<Team> {
    const team = await this.teamManagementRepository.findById(id);
    if (!team) {
      throw new NotFoundException(`Team #${id} not found`);
    }
    return team;
  }

  async update(id: string, dto: UpdateTeamDto): Promise<Team> {
    const team = await this.findOne(id);
    Object.assign(team, dto);
    return this.teamManagementRepository.save(team);
  }

  async remove(id: string): Promise<void> {
    const team = await this.findOne(id);
    await this.teamManagementRepository.remove(team);
  }
}
