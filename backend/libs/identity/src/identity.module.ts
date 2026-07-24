import { DynamicModule, Module, OnModuleInit } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PermissionRegistry } from '@pugying/core';
import { TenantManagementModule } from '@pugying/tenant-management';
import { JwtStrategy } from './infrastructure/jwt.strategy';
import { JwtAuthGuard } from './infrastructure/jwt-auth.guard';
import { IdentityService } from './application/services/identity.service';
import { IdentityBootstrapService } from './application/services/identity-bootstrap.service';
import { IdentityController } from './http/controllers/identity.controller';
import { IDENTITY_MODULE_OPTIONS, type IdentityModuleOptions } from './identity.constants';
import { identityPermissionList } from './identity.permissions';

function parseExpiresIn(value?: string): number {
  if (!value) {
    return 60 * 60 * 24 * 7;
  }
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) {
    const asNumber = Number.parseInt(value, 10);
    return Number.isNaN(asNumber) ? 60 * 60 * 24 * 7 : asNumber;
  }
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
  };
  return amount * multipliers[unit];
}

/**
 * Identity business module — application / http only.
 * TypeORM mapping lives in IdentityTypeOrmModule (host imports both).
 */
@Module({})
export class IdentityModule implements OnModuleInit {
  constructor(private readonly permissionRegistry: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissionRegistry.register(...identityPermissionList);
  }

  static forRoot(options: IdentityModuleOptions): DynamicModule {
    return {
      module: IdentityModule,
      imports: [
        TenantManagementModule,
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: options.jwtSecret,
          signOptions: {
            expiresIn: parseExpiresIn(options.jwtExpiresIn),
          },
        }),
      ],
      controllers: [IdentityController],
      providers: [
        {
          provide: IDENTITY_MODULE_OPTIONS,
          useValue: options,
        },
        IdentityService,
        IdentityBootstrapService,
        JwtStrategy,
        JwtAuthGuard,
      ],
      exports: [IdentityService, JwtAuthGuard, PassportModule, JwtModule],
    };
  }
}
