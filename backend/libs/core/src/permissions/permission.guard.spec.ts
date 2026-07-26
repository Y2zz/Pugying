import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionChecker, type AuthenticatedUser } from './permission-checker';
import { PermissionGuard } from './permission.guard';
import { RequirePermission } from './require-permission.decorator';

class TestController {
  @RequirePermission('Identity.Users.View', 'Identity.Users.Manage')
  guarded(): void {}

  open(): void {}
}

function createUser(permissions: string[]): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    username: 'user',
    teamId: 'team-1',
    permissions,
  };
}

function createContext(handlerName: 'guarded' | 'open', user: AuthenticatedUser | undefined): ExecutionContext {
  return {
    getHandler: () => TestController.prototype[handlerName],
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
  let guard: PermissionGuard;

  beforeEach(() => {
    guard = new PermissionGuard(new Reflector(), new PermissionChecker());
  });

  it('allows access when no permission metadata is present', () => {
    const context = createContext('open', undefined);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when the user holds one of the required permissions', () => {
    const context = createContext('guarded', createUser(['Identity.Users.Manage']));

    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when the user lacks all required permissions', () => {
    const context = createContext('guarded', createUser(['Other.Stuff.View']));

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('Missing required permission: Identity.Users.View | Identity.Users.Manage');
  });

  it('throws ForbiddenException when no user is attached to the request', () => {
    const context = createContext('guarded', undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
