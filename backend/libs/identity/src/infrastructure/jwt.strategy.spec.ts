import { JwtStrategy, type JwtPayload } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    strategy = new JwtStrategy({ jwtSecret: 'test-secret' });
  });

  it('maps the JWT payload to an AuthenticatedUser', () => {
    const payload: JwtPayload = {
      sub: 'user-1',
      email: 'user@example.com',
      username: 'user',
      teamId: 'team-1',
      permissions: ['Identity.Users.View'],
    };

    expect(strategy.validate(payload)).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      teamId: 'team-1',
      permissions: ['Identity.Users.View'],
    });
  });

  it('normalizes a missing teamId to null', () => {
    const payload = {
      sub: 'user-1',
      email: 'user@example.com',
      username: 'user',
      permissions: [],
    } as unknown as JwtPayload;

    expect(strategy.validate(payload).teamId).toBeNull();
  });

  it('normalizes missing permissions to an empty array', () => {
    const payload = {
      sub: 'user-1',
      email: 'user@example.com',
      username: 'user',
      teamId: null,
    } as unknown as JwtPayload;

    expect(strategy.validate(payload).permissions).toEqual([]);
  });
});
