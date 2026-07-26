import { definePermissions } from '@pugying/core';

export const PlatformAccountPermissions = {
  Accounts: {
    Create: 'PlatformAccount.Accounts.Create',
    Update: 'PlatformAccount.Accounts.Update',
    Delete: 'PlatformAccount.Accounts.Delete',
    View: 'PlatformAccount.Accounts.View',
  },
} as const;

export const platformAccountPermissionList = definePermissions(
  'PlatformAccount',
  {
    Accounts: ['Create', 'Update', 'Delete', 'View'],
  },
);
