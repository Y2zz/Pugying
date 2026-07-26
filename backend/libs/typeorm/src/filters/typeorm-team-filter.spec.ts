import { CurrentTeam } from '@pugying/core';
import type { FindManyOptions, ObjectLiteral } from 'typeorm';
import { TypeOrmTeamFilter } from './typeorm-team-filter';

const TEAM_A = 'team-a';

interface TeamRow extends ObjectLiteral {
  id: string;
  teamId: string;
  status: string;
}

describe('TypeOrmTeamFilter', () => {
  let currentTeam: CurrentTeam;
  let filter: TypeOrmTeamFilter;

  beforeEach(() => {
    currentTeam = new CurrentTeam();
    filter = new TypeOrmTeamFilter(currentTeam);
  });

  function inTeam<T>(fn: () => T): T {
    return currentTeam.run({ id: TEAM_A }, fn);
  }

  it('leaves options untouched outside of a team context', () => {
    const options: FindManyOptions<TeamRow> = { where: { status: 'active' } };

    expect(filter.applyMany(options)).toBe(options);
    expect(filter.applyOne(options)).toBe(options);
  });

  it('leaves options untouched for an anonymous (null team) context', () => {
    const options: FindManyOptions<TeamRow> = {};

    const result = currentTeam.run({ id: null }, () => filter.applyMany(options));

    expect(result).toBe(options);
  });

  it('adds a teamId where clause when none exists', () => {
    const result = inTeam(() => filter.applyMany<TeamRow>({}));

    expect(result.where).toEqual({ teamId: TEAM_A });
  });

  it('merges the team scope into an object where clause', () => {
    const result = inTeam(() => filter.applyMany<TeamRow>({ where: { status: 'active' } }));

    expect(result.where).toEqual({ status: 'active', teamId: TEAM_A });
  });

  it('overrides a caller-supplied teamId with the current team', () => {
    const result = inTeam(() => filter.applyMany<TeamRow>({ where: { teamId: 'team-b' } }));

    expect(result.where).toEqual({ teamId: TEAM_A });
  });

  it('applies the team scope to every branch of an array where clause', () => {
    const result = inTeam(() =>
      filter.applyMany<TeamRow>({
        where: [{ status: 'active' }, { status: 'draft' }],
      }),
    );

    expect(result.where).toEqual([
      { status: 'active', teamId: TEAM_A },
      { status: 'draft', teamId: TEAM_A },
    ]);
  });

  it('preserves unrelated options and does not mutate the input', () => {
    const options: FindManyOptions<TeamRow> = {
      where: { status: 'active' },
      take: 10,
      order: { id: 'ASC' },
    };

    const result = inTeam(() => filter.applyMany(options));

    expect(result.take).toBe(10);
    expect(result.order).toEqual({ id: 'ASC' });
    expect(options.where).toEqual({ status: 'active' });
  });

  it('scopes applyOne the same way as applyMany', () => {
    const result = inTeam(() => filter.applyOne<TeamRow>({ where: { id: 'row-1' } }));

    expect(result.where).toEqual({ id: 'row-1', teamId: TEAM_A });
  });
});
