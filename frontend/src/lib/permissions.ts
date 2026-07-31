export const Permissions = {
  Identity: {
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
  },
  Account: {
    Users: {
      Invite: 'Account.Users.Invite',
      Kick: 'Account.Users.Kick',
      Leave: 'Account.Users.Leave',
    },
  },
  TeamManagement: {
    Teams: {
      Create: 'TeamManagement.Teams.Create',
      Update: 'TeamManagement.Teams.Update',
      Delete: 'TeamManagement.Teams.Delete',
      View: 'TeamManagement.Teams.View',
    },
  },
} as const;

export function hasPermission(
  permissions: string[] | undefined,
  required: string,
): boolean {
  if (!permissions || permissions.length === 0) {
    return false;
  }
  return permissions.includes(required);
}

export function canAccessAdmin(permissions: string[] | undefined): boolean {
  if (!permissions || permissions.length === 0) {
    return false;
  }
  return permissions.some((permission) =>
    permission.startsWith('TeamManagement.'),
  );
}
