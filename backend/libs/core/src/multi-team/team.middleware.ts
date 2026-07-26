import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { CurrentTeam } from '@pugying/core/multi-team/current-team';
import {
  TEAM_STORE,
  type ITeamStore,
} from '@pugying/core/multi-team/team-store';

export const TEAM_HEADER = 'x-team-id';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class TeamMiddleware implements NestMiddleware {
  constructor(
    private readonly currentTeam: CurrentTeam,
    private readonly moduleRef: ModuleRef,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    void this.resolveAndRun(req, next);
  }

  private getTeamStore(): ITeamStore | undefined {
    try {
      return this.moduleRef.get<ITeamStore>(TEAM_STORE, { strict: false });
    } catch {
      return undefined;
    }
  }

  private async resolveAndRun(
    req: Request,
    next: NextFunction,
  ): Promise<void> {
    try {
      const raw = req.header(TEAM_HEADER)?.trim();
      let id: string | null = null;
      let name: string | undefined;

      if (raw) {
        if (!UUID_RE.test(raw)) {
          throw new BadRequestException(`Invalid ${TEAM_HEADER} header`);
        }

        const teamStore = this.getTeamStore();
        if (teamStore) {
          const team = await teamStore.findById(raw);
          if (!team) {
            throw new BadRequestException(`Team ${raw} not found`);
          }
          if (!team.active) {
            throw new ForbiddenException(`Team ${raw} is inactive`);
          }
          id = team.id;
          name = team.name;
        } else {
          id = raw;
        }
      }

      this.currentTeam.run({ id, name }, () => {
        next();
      });
    } catch (error) {
      next(error);
    }
  }
}
