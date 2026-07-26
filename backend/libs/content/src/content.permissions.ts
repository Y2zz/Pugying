import { definePermissions } from '@pugying/core';

export const ContentPermissions = {
  Contents: {
    Create: 'Content.Contents.Create',
    Update: 'Content.Contents.Update',
    Delete: 'Content.Contents.Delete',
    View: 'Content.Contents.View',
  },
} as const;

export const contentPermissionList = definePermissions('Content', {
  Contents: ['Create', 'Update', 'Delete', 'View'],
});
