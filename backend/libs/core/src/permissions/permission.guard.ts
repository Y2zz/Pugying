import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PermissionChecker } from './permission-checker';
import { PERMISSIONS_KEY } from './require-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = this.permissionChecker.getUserFromRequest(request);

    if (!this.permissionChecker.isGrantedAny(user, required)) {
      throw new ForbiddenException(
        `Missing required permission: ${required.join(' | ')}`,
      );
    }

    return true;
  }
}
