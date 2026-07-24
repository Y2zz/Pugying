import { definePermissions } from '@pugying/core';

export const TenantManagementPermissions = {
  Tenants: {
    Create: 'TenantManagement.Tenants.Create',
    Update: 'TenantManagement.Tenants.Update',
    Delete: 'TenantManagement.Tenants.Delete',
    View: 'TenantManagement.Tenants.View',
  },
} as const;

export const tenantManagementPermissionList = definePermissions('TenantManagement', {
  Tenants: ['Create', 'Update', 'Delete', 'View'],
});
