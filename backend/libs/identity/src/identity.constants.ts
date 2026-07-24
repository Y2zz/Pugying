export const IDENTITY_MODULE_OPTIONS = 'IDENTITY_MODULE_OPTIONS';

export interface IdentityModuleOptions {
  jwtSecret: string;
  jwtExpiresIn?: string;
  seed?: boolean;
}
