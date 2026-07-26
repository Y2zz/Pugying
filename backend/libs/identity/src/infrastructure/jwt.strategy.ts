import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '@pugying/core';
import {
  IDENTITY_MODULE_OPTIONS,
  type IdentityModuleOptions,
} from '@pugying/identity/identity.constants';

export interface JwtPayload {
  sub: string;
  email: string;
  username: string;
  teamId: string | null;
  permissions: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(IDENTITY_MODULE_OPTIONS)
    options: IdentityModuleOptions,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: options.jwtSecret,
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
      teamId: payload.teamId ?? null,
      permissions: payload.permissions ?? [],
    };
  }
}
