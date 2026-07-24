/**
 * Defines permission names using ABP-style naming: Module.Group.Action
 */
export function definePermissions(
  moduleName: string,
  groups: Record<string, readonly string[]>,
): string[] {
  const permissions: string[] = [];
  for (const [group, actions] of Object.entries(groups)) {
    for (const action of actions) {
      permissions.push(`${moduleName}.${group}.${action}`);
    }
  }
  return permissions;
}

export interface PermissionDefinition {
  name: string;
  module: string;
}

export interface PermissionContributor {
  getPermissions(): string[];
}
