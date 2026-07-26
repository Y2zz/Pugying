import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '@pugying/core/auth/public.decorator';
import { TEAM_HEADER } from '@pugying/core/multi-team/team.middleware';
import type { AuthenticatedUser } from '@pugying/core/permissions/permission-checker';
import { Reflector } from '@nestjs/core';

/**
 * Ensures JWT teamId matches X-Team-Id when both are present.
 */
@Injectable()
export class TeamConsistencyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<
      Request & { user?: AuthenticatedUser }
    >();
    const user = request.user;
    if (!user) {
      return true;
    }

    const headerTeam = request.header(TEAM_HEADER)?.trim() ?? null;
    const jwtTeam = user.teamId ?? null;

    if (headerTeam && jwtTeam && headerTeam !== jwtTeam) {
      throw new ForbiddenException(
        `${TEAM_HEADER} does not match token team`,
      );
    }

    return true;
  }
}
