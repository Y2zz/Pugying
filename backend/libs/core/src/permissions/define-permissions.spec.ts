import { definePermissions } from './define-permissions';

describe('definePermissions', () => {
  it('builds Module.Group.Action names', () => {
    const permissions = definePermissions('Identity', {
      Users: ['View', 'Create'],
    });

    expect(permissions).toEqual(['Identity.Users.View', 'Identity.Users.Create']);
  });

  it('supports multiple groups', () => {
    const permissions = definePermissions('Identity', {
      Users: ['View'],
      Roles: ['View', 'Manage'],
    });

    expect(permissions).toEqual(['Identity.Users.View', 'Identity.Roles.View', 'Identity.Roles.Manage']);
  });

  it('returns empty array for empty groups', () => {
    expect(definePermissions('Empty', {})).toEqual([]);
  });

  it('returns empty array when a group has no actions', () => {
    expect(definePermissions('Empty', { Users: [] })).toEqual([]);
  });
});
