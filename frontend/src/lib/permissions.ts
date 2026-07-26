export function canAccessAdmin(permissions: string[] | undefined): boolean {
  if (!permissions || permissions.length === 0) {
    return false;
  }
  return permissions.some((permission) =>
    permission.startsWith('TeamManagement.'),
  );
}
