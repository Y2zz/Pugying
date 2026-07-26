import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PermissionChecker, type AuthenticatedUser } from './permission-checker';

describe('PermissionChecker', () => {
  let checker: PermissionChecker;

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
    username: 'user',
    teamId: 'team-1',
    permissions: ['Identity.Users.View', 'Content.Contents.View'],
  };

  beforeEach(() => {
    checker = new PermissionChecker();
  });

  describe('isGranted', () => {
    it('returns true when the user has the permission', () => {
      expect(checker.isGranted(user, 'Identity.Users.View')).toBe(true);
    });

    it('returns false when the user lacks the permission', () => {
      expect(checker.isGranted(user, 'Identity.Users.Delete')).toBe(false);
    });

    it('returns false without a user', () => {
      expect(checker.isGranted(undefined, 'Identity.Users.View')).toBe(false);
    });
  });

  describe('isGrantedAny', () => {
    it('returns true when at least one permission matches', () => {
      expect(checker.isGrantedAny(user, ['Nope.Nope.Nope', 'Content.Contents.View'])).toBe(true);
    });

    it('returns false when no permission matches', () => {
      expect(checker.isGrantedAny(user, ['Nope.Nope.Nope'])).toBe(false);
    });

    it('returns false for an empty permission list', () => {
      expect(checker.isGrantedAny(user, [])).toBe(false);
    });

    it('returns false without a user', () => {
      expect(checker.isGrantedAny(undefined, ['Identity.Users.View'])).toBe(false);
    });
  });

  describe('getUserFromRequest', () => {
    it('returns the user attached to the request', () => {
      const request = { user } as unknown as Request;

      expect(checker.getUserFromRequest(request)).toBe(user);
    });

    it('returns undefined when no user is attached', () => {
      const request = {} as Request;

      expect(checker.getUserFromRequest(request)).toBeUndefined();
    });
  });

  describe('requireUser', () => {
    it('returns the user when present', () => {
      const request = { user } as unknown as Request;

      expect(checker.requireUser(request)).toBe(user);
    });

    it('throws UnauthorizedException when missing', () => {
      const request = {} as Request;

      expect(() => checker.requireUser(request)).toThrow(UnauthorizedException);
    });
  });
});
