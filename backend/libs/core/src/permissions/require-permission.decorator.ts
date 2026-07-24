import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'pugying:permissions';

/**
 * Requires the current user to have at least one of the listed permissions.
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
