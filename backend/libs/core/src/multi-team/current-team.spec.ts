import { CurrentTeam } from './current-team';

describe('CurrentTeam', () => {
  let currentTeam: CurrentTeam;

  beforeEach(() => {
    currentTeam = new CurrentTeam();
  });

  it('has no team outside of a run context', () => {
    expect(currentTeam.id).toBeNull();
    expect(currentTeam.name).toBeUndefined();
    expect(currentTeam.isAvailable).toBe(false);
    expect(currentTeam.getStore()).toBeUndefined();
  });

  it('exposes the team inside a run context', () => {
    currentTeam.run({ id: 'team-1', name: 'Team One' }, () => {
      expect(currentTeam.id).toBe('team-1');
      expect(currentTeam.name).toBe('Team One');
      expect(currentTeam.isAvailable).toBe(true);
      expect(currentTeam.getStore()).toEqual({ id: 'team-1', name: 'Team One' });
    });
  });

  it('treats a null id as not available (anonymous host context)', () => {
    currentTeam.run({ id: null }, () => {
      expect(currentTeam.id).toBeNull();
      expect(currentTeam.isAvailable).toBe(false);
      expect(currentTeam.getStore()).toEqual({ id: null });
    });
  });

  it('returns the callback result', () => {
    const result = currentTeam.run({ id: 'team-1' }, () => 42);

    expect(result).toBe(42);
  });

  it('restores the outer context after nested runs', () => {
    currentTeam.run({ id: 'outer' }, () => {
      currentTeam.run({ id: 'inner' }, () => {
        expect(currentTeam.id).toBe('inner');
      });
      expect(currentTeam.id).toBe('outer');
    });
    expect(currentTeam.id).toBeNull();
  });

  it('keeps async continuations bound to their own team context', async () => {
    const observed: Array<string | null> = [];

    const work = (teamId: string): Promise<void> =>
      currentTeam.run({ id: teamId }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        observed.push(currentTeam.id);
      });

    await Promise.all([work('team-a'), work('team-b')]);

    expect(observed.sort()).toEqual(['team-a', 'team-b']);
  });
});
