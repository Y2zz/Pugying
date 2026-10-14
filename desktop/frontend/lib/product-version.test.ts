import { compareVersions, isVersionNewer } from '@/lib/product-version';

describe('product-version', () => {
  it('compares semantic versions', () => {
    expect(compareVersions('0.0.2', '0.0.1')).toBe(1);
    expect(compareVersions('0.0.1', '0.0.2')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('detects newer remote version', () => {
    expect(isVersionNewer('0.0.2', '0.0.1')).toBe(true);
    expect(isVersionNewer('0.0.1', '0.0.1')).toBe(false);
  });
});
