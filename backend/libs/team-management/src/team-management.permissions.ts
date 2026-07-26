import { definePermissions } from '@pugying/core';

export const TeamManagementPermissions = {
  Teams: {
    Create: 'TeamManagement.Teams.Create',
    Update: 'TeamManagement.Teams.Update',
    Delete: 'TeamManagement.Teams.Delete',
    View: 'TeamManagement.Teams.View',
  },
} as const;

export const teamManagementPermissionList = definePermissions('TeamManagement', {
  Teams: ['Create', 'Update', 'Delete', 'View'],
});
