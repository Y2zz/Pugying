import { definePermissions } from '@pugying/core';

export const AccountProPermissions = {
  Invite: 'Account.Users.Invite',
  Kick: 'Account.Users.Kick',
  Leave: 'Account.Users.Leave',
} as const;

export const accountProPermissionList = definePermissions('Account', {
  Users: ['Invite', 'Kick', 'Leave'],
});
