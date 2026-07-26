import { definePermissions } from '@pugying/core';

export const IdentityPermissions = {
  Users: {
    Create: 'Identity.Users.Create',
    Update: 'Identity.Users.Update',
    Delete: 'Identity.Users.Delete',
    View: 'Identity.Users.View',
  },
  Roles: {
    Create: 'Identity.Roles.Create',
    Update: 'Identity.Roles.Update',
    Delete: 'Identity.Roles.Delete',
    View: 'Identity.Roles.View',
  },
} as const;

export const identityPermissionList = definePermissions('Identity', {
  Users: ['Create', 'Update', 'Delete', 'View'],
  Roles: ['Create', 'Update', 'Delete', 'View'],
});
