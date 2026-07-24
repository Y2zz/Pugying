import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '@pugying/core';
import { IDENTITY_MODULE_OPTIONS, type IdentityModuleOptions } from '../identity.constants';

export interface JwtPayload {
  sub: string;
  email: string;
  username: string;
  tenantId: string;
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
      tenantId: payload.tenantId,
      permissions: payload.permissions ?? [],
    };
  }
}
