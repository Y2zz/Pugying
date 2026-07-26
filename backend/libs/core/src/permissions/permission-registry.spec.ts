import { PermissionRegistry } from './permission-registry';

describe('PermissionRegistry', () => {
  let registry: PermissionRegistry;

  beforeEach(() => {
    registry = new PermissionRegistry();
  });

  it('starts empty', () => {
    expect(registry.getAll()).toEqual([]);
  });

  it('registers multiple permissions at once', () => {
    registry.register('Identity.Users.View', 'Identity.Users.Create');

    expect(registry.has('Identity.Users.View')).toBe(true);
    expect(registry.has('Identity.Users.Create')).toBe(true);
  });

  it('deduplicates repeated registrations', () => {
    registry.register('Content.Contents.View');
    registry.register('Content.Contents.View');

    expect(registry.getAll()).toEqual(['Content.Contents.View']);
  });

  it('returns all permissions sorted alphabetically', () => {
    registry.register('B.Group.Action', 'A.Group.Action', 'C.Group.Action');

    expect(registry.getAll()).toEqual(['A.Group.Action', 'B.Group.Action', 'C.Group.Action']);
  });

  it('has() returns false for unknown permission', () => {
    registry.register('Identity.Users.View');

    expect(registry.has('Identity.Users.Delete')).toBe(false);
  });
});
