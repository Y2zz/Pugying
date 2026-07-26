import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Public } from '@pugying/core/auth/public.decorator';
import type { AuthenticatedUser } from '@pugying/core/permissions/permission-checker';
import { TeamConsistencyGuard } from './team-consistency.guard';
import { TEAM_HEADER } from './team.middleware';

class TestController {
  @Public()
  publicRoute(): void {}

  privateRoute(): void {}
}

function createUser(teamId: string | null): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    username: 'user',
    teamId,
    permissions: [],
  };
}

function createContext(options: { handlerName: 'publicRoute' | 'privateRoute'; user?: AuthenticatedUser; headerTeam?: string }): ExecutionContext {
  const headers: Record<string, string> = {};
  if (options.headerTeam !== undefined) {
    headers[TEAM_HEADER] = options.headerTeam;
  }
  return {
    getHandler: () => TestController.prototype[options.handlerName],
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => ({
        user: options.user,
        header: (name: string) => headers[name.toLowerCase()],
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('TeamConsistencyGuard', () => {
  let guard: TeamConsistencyGuard;

  beforeEach(() => {
    guard = new TeamConsistencyGuard(new Reflector());
  });

  it('allows public routes without any check', () => {
    const context = createContext({
      handlerName: 'publicRoute',
      user: createUser('team-a'),
      headerTeam: 'team-b',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows requests without an authenticated user', () => {
    const context = createContext({
      handlerName: 'privateRoute',
      headerTeam: 'team-a',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows when header team matches the token team', () => {
    const context = createContext({
      handlerName: 'privateRoute',
      user: createUser('team-a'),
      headerTeam: 'team-a',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows when only the header team is present (token without team)', () => {
    const context = createContext({
      handlerName: 'privateRoute',
      user: createUser(null),
      headerTeam: 'team-a',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows when only the token team is present (no header)', () => {
    const context = createContext({
      handlerName: 'privateRoute',
      user: createUser('team-a'),
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects when header team differs from token team', () => {
    const context = createContext({
      handlerName: 'privateRoute',
      user: createUser('team-a'),
      headerTeam: 'team-b',
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(`${TEAM_HEADER} does not match token team`);
  });
});
