import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  /** Active team from JWT; null when signed in without a team. */
  teamId: string | null;
  permissions: string[];
}

@Injectable()
export class PermissionChecker {
  isGranted(user: AuthenticatedUser | undefined, permission: string): boolean {
    if (!user) {
      return false;
    }
    return user.permissions.includes(permission);
  }

  isGrantedAny(user: AuthenticatedUser | undefined, permissions: string[]): boolean {
    if (!user || permissions.length === 0) {
      return false;
    }
    return permissions.some((permission) => this.isGranted(user, permission));
  }

  getUserFromRequest(request: Request): AuthenticatedUser | undefined {
    return (request as Request & { user?: AuthenticatedUser }).user;
  }

  requireUser(request: Request): AuthenticatedUser {
    const user = this.getUserFromRequest(request);
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    return user;
  }
}
