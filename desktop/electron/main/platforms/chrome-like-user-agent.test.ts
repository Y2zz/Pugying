import { app, session } from 'electron';
import { describe, expect, it } from 'vitest';
import {
  installChromeLikeUserAgent,
  toChromeLikeUserAgent,
} from './chrome-like-user-agent';

describe('toChromeLikeUserAgent', () => {
  it('removes every provided app name/version and any Electron/… token', () => {
    const raw =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) pugying-desktop/9.8.7 Chrome/999.0.1.2 Electron/88.0.0 Safari/537.36';
    expect(
      toChromeLikeUserAgent(raw, ['pugying-desktop', '蒲公英'], '9.8.7'),
    ).toBe(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/999.0.1.2 Safari/537.36',
    );
  });

  it('strips Chinese productName when that is what Electron embedded', () => {
    const raw =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) 蒲公英/1.2.3-beta Chrome/141.0.7390.0 Electron/36.1.0 Safari/537.36';
    const result = toChromeLikeUserAgent(
      raw,
      ['pugying-desktop', '蒲公英'],
      '1.2.3-beta',
    );
    expect(result).toContain('Chrome/141.0.7390.0');
    expect(result).not.toMatch(/Electron\//i);
    expect(result).not.toContain('蒲公英');
    expect(result).not.toContain('1.2.3-beta');
  });

  it('leaves Chrome and platform tokens alone when app markers are absent', () => {
    const clean =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.109 Safari/537.36';
    expect(
      toChromeLikeUserAgent(clean, ['pugying-desktop'], '0.0.2'),
    ).toBe(clean);
  });

  it('does not strip a different app name/version than the ones passed in', () => {
    const raw =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) other-app/1.0.0 Chrome/120.0.0.0 Electron/30.0.0 Safari/537.36';
    expect(toChromeLikeUserAgent(raw, ['pugying-desktop'], '0.0.2')).toBe(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) other-app/1.0.0 Chrome/120.0.0.0 Safari/537.36',
    );
  });
});

describe('installChromeLikeUserAgent', () => {
  it('strips markers using runtime app identities', () => {
    const ua = installChromeLikeUserAgent();
    expect(ua).not.toMatch(/Electron\//i);
    expect(ua).not.toContain(`${app.getName()}/${app.getVersion()}`);
    expect(ua).toMatch(/Chrome\//);
    expect(app.userAgentFallback).toBe(ua);
    expect(session.defaultSession.getUserAgent()).toBe(ua);
  });
});
