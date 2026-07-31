import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import {
  CurrentTeam,
  TEAM_HEADER,
  UNIT_OF_WORK,
  type AuthenticatedUser,
  type IUnitOfWork,
} from '@pugying/core';
import { TeamManagementService } from '@pugying/team-management';
import {
  IdentityService,
  USER_REPOSITORY,
  type IUserRepository,
} from '@pugying/identity';
import type { ITeamUserRepository } from '@pugying/account-pro/domain/repositories/team-user.repository';
import { TEAM_USER_REPOSITORY } from '@pugying/account-pro/domain/repositories/team-user.repository';
import {
  AccountLoginDto,
  InviteUserDto,
  KickUserDto,
  LeaveTeamDto,
  RegisterUserDto,
  SelectTeamDto,
  SwitchTeamDto,
} from '@pugying/account-pro/application/dtos';

interface LoginTicketPayload {
  userId: string;
  exp: number;
}

export interface TeamOption {
  id: string;
  name: string;
  displayName: string;
}

export interface LoginSuccess {
  accessToken: string;
  user: AuthenticatedUser;
}

export interface LoginRequiresTeamSelection {
  requiresTeamSelection: true;
  loginTicket: string;
  teams: TeamOption[];
}

@Injectable()
export class AccountService {
  private readonly loginTickets = new Map<string, LoginTicketPayload>();

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(TEAM_USER_REPOSITORY)
    private readonly teamUserRepository: ITeamUserRepository,
    private readonly identityService: IdentityService,
    private readonly teamService: TeamManagementService,
    private readonly jwtService: JwtService,
    private readonly currentTeam: CurrentTeam,
    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: IUnitOfWork,
  ) {}

  async login(
    dto: AccountLoginDto,
  ): Promise<LoginSuccess | LoginRequiresTeamSelection> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const memberships = await this.teamUserRepository.findActiveByUserId(
      user.id,
    );
    if (memberships.length === 0) {
      throw new ForbiddenException(
        'User does not belong to any team. Ask an administrator to invite you.',
      );
    }

    const teams = await this.toTeamOptions(memberships.map((m) => m.teamId));

    if (teams.length === 1) {
      return this.issueToken(user.id, user.email, user.username, teams[0].id);
    }

    const loginTicket = randomBytes(24).toString('hex');
    this.loginTickets.set(loginTicket, {
      userId: user.id,
      exp: Date.now() + 5 * 60 * 1000,
    });

    return {
      requiresTeamSelection: true,
      loginTicket,
      teams,
    };
  }

  async selectTeam(dto: SelectTeamDto): Promise<LoginSuccess> {
    const ticket = this.loginTickets.get(dto.loginTicket);
    if (!ticket || ticket.exp < Date.now()) {
      this.loginTickets.delete(dto.loginTicket);
      throw new UnauthorizedException('Login ticket expired or invalid');
    }

    const membership = await this.teamUserRepository.findActiveByUserAndTeam(
      ticket.userId,
      dto.teamId,
    );
    if (!membership) {
      throw new ForbiddenException('Not a member of the selected team');
    }

    const user = await this.userRepository.findById(ticket.userId);
    if (!user || !user.active) {
      throw new UnauthorizedException('User not found');
    }

    this.loginTickets.delete(dto.loginTicket);
    return this.issueToken(user.id, user.email, user.username, dto.teamId);
  }

  async switchTeam(
    currentUser: AuthenticatedUser,
    dto: SwitchTeamDto,
  ): Promise<LoginSuccess> {
    const membership = await this.teamUserRepository.findActiveByUserAndTeam(
      currentUser.id,
      dto.teamId,
    );
    if (!membership) {
      throw new ForbiddenException('Not a member of the target team');
    }

    return this.issueToken(
      currentUser.id,
      currentUser.email,
      currentUser.username,
      dto.teamId,
    );
  }

  /**
   * Re-issue JWT with freshly resolved permissions for the current team.
   */
  async refreshClaims(currentUser: AuthenticatedUser): Promise<LoginSuccess> {
    const teamId = currentUser.teamId;
    if (!teamId) {
      throw new BadRequestException('No active team in token');
    }

    const membership = await this.teamUserRepository.findActiveByUserAndTeam(
      currentUser.id,
      teamId,
    );
    if (!membership) {
      throw new ForbiddenException('Not a member of the current team');
    }

    const user = await this.userRepository.findById(currentUser.id);
    if (!user || !user.active) {
      throw new UnauthorizedException('User not found');
    }

    return this.issueToken(user.id, user.email, user.username, teamId);
  }

  async myTeams(userId: string): Promise<TeamOption[]> {
    const memberships =
      await this.teamUserRepository.findActiveByUserId(userId);
    return this.toTeamOptions(memberships.map((m) => m.teamId));
  }

  async register(dto: RegisterUserDto) {
    const user = await this.identityService.create({
      email: dto.email,
      username: dto.username,
      password: dto.password,
    });
    return this.identityService.toPublicUser(user);
  }

  async invite(dto: InviteUserDto) {
    if (this.currentTeam.isAvailable && this.currentTeam.id !== dto.teamId) {
      throw new ForbiddenException(
        `Invite teamId must match current ${TEAM_HEADER}`,
      );
    }

    await this.teamService.findOne(dto.teamId);

    return this.unitOfWork.complete(async () => {
      const user = await this.userRepository.findByEmail(dto.email);
      if (!user) {
        throw new NotFoundException(`User with email ${dto.email} not found`);
      }

      const existing = await this.teamUserRepository.findByUserAndTeam(
        user.id,
        dto.teamId,
      );

      if (existing && !existing.leftAt) {
        throw new ConflictException('User is already a member of this team');
      }

      if (existing && existing.leftAt) {
        existing.leftAt = null;
        existing.extraPermissions = dto.extraPermissions ?? [];
        return this.teamUserRepository.save(existing);
      }

      const membership = this.teamUserRepository.create({
        userId: user.id,
        teamId: dto.teamId,
        extraPermissions: dto.extraPermissions ?? [],
        leftAt: null,
      });
      return this.teamUserRepository.save(membership);
    });
  }

  async leave(userId: string, dto: LeaveTeamDto): Promise<void> {
    await this.unitOfWork.complete(async () => {
      const membership = await this.teamUserRepository.findActiveByUserAndTeam(
        userId,
        dto.teamId,
      );
      if (!membership) {
        throw new NotFoundException('Membership not found');
      }

      const remaining =
        await this.teamUserRepository.findActiveByUserId(userId);
      if (remaining.length <= 1) {
        throw new BadRequestException('Cannot leave the last team');
      }

      membership.leftAt = new Date();
      await this.teamUserRepository.save(membership);
    });
  }

  async kick(actor: AuthenticatedUser, dto: KickUserDto): Promise<void> {
    if (this.currentTeam.isAvailable && this.currentTeam.id !== dto.teamId) {
      throw new ForbiddenException(
        `Kick teamId must match current ${TEAM_HEADER}`,
      );
    }

    if (actor.id === dto.userId) {
      throw new BadRequestException('Cannot kick yourself; use leave instead');
    }

    await this.teamService.findOne(dto.teamId);

    await this.unitOfWork.complete(async () => {
      const membership = await this.teamUserRepository.findActiveByUserAndTeam(
        dto.userId,
        dto.teamId,
      );
      if (!membership) {
        throw new NotFoundException('Membership not found');
      }

      membership.leftAt = new Date();
      await this.teamUserRepository.save(membership);
    });
  }

  private async issueToken(
    userId: string,
    email: string,
    username: string,
    teamId: string,
  ): Promise<LoginSuccess> {
    const permissions = await this.identityService.resolveEffectivePermissions(
      userId,
      teamId,
    );

    const accessToken = await this.jwtService.signAsync({
      sub: userId,
      email,
      username,
      teamId,
      permissions,
    });

    return {
      accessToken,
      user: {
        id: userId,
        email,
        username,
        teamId,
        permissions,
      },
    };
  }

  private async toTeamOptions(teamIds: string[]): Promise<TeamOption[]> {
    const options: TeamOption[] = [];
    for (const teamId of teamIds) {
      try {
        const team = await this.teamService.findOne(teamId);
        if (!team.active) {
          continue;
        }
        options.push({
          id: team.id,
          name: team.name,
          displayName: team.displayName,
        });
      } catch {
        // skip missing teams
      }
    }
    return options;
  }
}
