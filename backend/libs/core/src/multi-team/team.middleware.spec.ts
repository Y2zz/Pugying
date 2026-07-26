import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import type { Request, Response } from 'express';
import { CurrentTeam, type TeamContext } from './current-team';
import type { ITeamStore } from './team-store';
import { TEAM_HEADER, TeamMiddleware } from './team.middleware';

const VALID_TEAM_ID = '550e8400-e29b-41d4-a716-446655440000';

interface InvokeResult {
  error?: unknown;
  captured?: TeamContext;
}

describe('TeamMiddleware', () => {
  let currentTeam: CurrentTeam;

  beforeEach(() => {
    currentTeam = new CurrentTeam();
  });

  function createMiddleware(teamStore?: ITeamStore): TeamMiddleware {
    const moduleRef = {
      get: jest.fn(() => {
        if (!teamStore) {
          throw new Error('ITeamStore is not registered');
        }
        return teamStore;
      }),
    } as unknown as ModuleRef;
    return new TeamMiddleware(currentTeam, moduleRef);
  }

  function invoke(middleware: TeamMiddleware, headerValue?: string): Promise<InvokeResult> {
    const req = {
      header: (name: string) => (name === TEAM_HEADER ? headerValue : undefined),
    } as unknown as Request;

    return new Promise<InvokeResult>((resolve) => {
      middleware.use(req, {} as Response, (error?: unknown) => {
        resolve({ error, captured: currentTeam.getStore() });
      });
    });
  }

  it('runs downstream with a null team when no header is sent', async () => {
    const middleware = createMiddleware();

    const result = await invoke(middleware);

    expect(result.error).toBeUndefined();
    expect(result.captured).toEqual({ id: null, name: undefined });
  });

  it('rejects a malformed team id header', async () => {
    const middleware = createMiddleware();

    const result = await invoke(middleware, 'not-a-uuid');

    expect(result.error).toBeInstanceOf(BadRequestException);
  });

  it('passes the raw id through when no team store is registered', async () => {
    const middleware = createMiddleware();

    const result = await invoke(middleware, VALID_TEAM_ID);

    expect(result.error).toBeUndefined();
    expect(result.captured?.id).toBe(VALID_TEAM_ID);
    expect(result.captured?.name).toBeUndefined();
  });

  it('resolves team metadata via the team store', async () => {
    const middleware = createMiddleware({
      findById: jest.fn().mockResolvedValue({
        id: VALID_TEAM_ID,
        name: 'Team One',
        active: true,
      }),
    });

    const result = await invoke(middleware, VALID_TEAM_ID);

    expect(result.error).toBeUndefined();
    expect(result.captured).toEqual({ id: VALID_TEAM_ID, name: 'Team One' });
  });

  it('rejects when the team does not exist', async () => {
    const middleware = createMiddleware({
      findById: jest.fn().mockResolvedValue(null),
    });

    const result = await invoke(middleware, VALID_TEAM_ID);

    expect(result.error).toBeInstanceOf(BadRequestException);
    expect(result.captured).toBeUndefined();
  });

  it('rejects when the team is inactive', async () => {
    const middleware = createMiddleware({
      findById: jest.fn().mockResolvedValue({
        id: VALID_TEAM_ID,
        name: 'Team One',
        active: false,
      }),
    });

    const result = await invoke(middleware, VALID_TEAM_ID);

    expect(result.error).toBeInstanceOf(ForbiddenException);
  });

  it('trims surrounding whitespace from the header', async () => {
    const middleware = createMiddleware();

    const result = await invoke(middleware, `  ${VALID_TEAM_ID}  `);

    expect(result.error).toBeUndefined();
    expect(result.captured?.id).toBe(VALID_TEAM_ID);
  });
});
