import { NotFoundException } from '@nestjs/common';
import { Team } from '@pugying/team-management/domain/entities/team.entity';
import { TeamManagementService } from './team-management.service';

function createTeam(overrides: Partial<Team> = {}): Team {
  return Object.assign(new Team(), {
    id: 'team-1',
    displayName: '示例团队',
    name: 'example-team',
    active: true,
    ...overrides,
  });
}

describe('TeamManagementService', () => {
  let repository: any;
  let service: TeamManagementService;

  beforeEach(() => {
    repository = {
      create: jest.fn((data: Partial<Team>) => Object.assign(new Team(), data)),
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      findBySlug: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (team: Team) => team),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    service = new TeamManagementService(repository);
  });

  describe('create', () => {
    it('creates an active team from the dto', async () => {
      const team = await service.create({
        displayName: '新团队',
        name: 'new-team',
      });

      expect(team.displayName).toBe('新团队');
      expect(team.name).toBe('new-team');
      expect(team.active).toBe(true);
      expect(repository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAll', () => {
    it('delegates to the repository', async () => {
      const teams = [createTeam()];
      repository.findAll.mockResolvedValue(teams);

      await expect(service.findAll()).resolves.toBe(teams);
    });
  });

  describe('findOne', () => {
    it('returns the team by id', async () => {
      const team = createTeam();
      repository.findById.mockResolvedValue(team);

      await expect(service.findOne('team-1')).resolves.toBe(team);
    });

    it('throws NotFoundException for unknown teams', async () => {
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('merges the dto into the existing team', async () => {
      repository.findById.mockResolvedValue(createTeam());

      const updated = await service.update('team-1', {
        displayName: '改名团队',
        active: false,
      });

      expect(updated.displayName).toBe('改名团队');
      expect(updated.active).toBe(false);
      expect(updated.name).toBe('example-team');
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException for unknown teams', async () => {
      await expect(service.update('missing', { displayName: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('removes an existing team', async () => {
      const team = createTeam();
      repository.findById.mockResolvedValue(team);

      await service.remove('team-1');

      expect(repository.remove).toHaveBeenCalledWith(team);
    });

    it('throws NotFoundException for unknown teams', async () => {
      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
