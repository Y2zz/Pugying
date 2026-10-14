import { describe, expect, it } from 'vitest';
import { buildAppWindowOptions, resolveAppLoadTarget } from './app-window';
import {
  resolveDesktopWindowChrome,
  resolveRuntimeDesktopPlatform,
} from '../../shared/window-chrome';

describe('resolveAppLoadTarget', () => {
  it('uses PUGYING_APP_URL when set', () => {
    const prev = process.env.PUGYING_APP_URL;
    const prevRenderer = process.env.ELECTRON_RENDERER_URL;
    process.env.PUGYING_APP_URL = 'http://127.0.0.1:4173';
    delete process.env.ELECTRON_RENDERER_URL;
    try {
      expect(resolveAppLoadTarget()).toEqual({
        kind: 'url',
        url: 'http://127.0.0.1:4173',
      });
    } finally {
      if (prev === undefined) {
        delete process.env.PUGYING_APP_URL;
      } else {
        process.env.PUGYING_APP_URL = prev;
      }
      if (prevRenderer === undefined) {
        delete process.env.ELECTRON_RENDERER_URL;
      } else {
        process.env.ELECTRON_RENDERER_URL = prevRenderer;
      }
    }
  });

  it('uses ELECTRON_RENDERER_URL in unpackaged electron-vite dev', () => {
    const prevUrl = process.env.PUGYING_APP_URL;
    const prevFile = process.env.PUGYING_APP_FILE;
    const prevRenderer = process.env.ELECTRON_RENDERER_URL;
    delete process.env.PUGYING_APP_URL;
    delete process.env.PUGYING_APP_FILE;
    process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173';
    try {
      expect(resolveAppLoadTarget()).toEqual({
        kind: 'url',
        url: 'http://localhost:5173/',
      });
    } finally {
      if (prevUrl === undefined) {
        delete process.env.PUGYING_APP_URL;
      } else {
        process.env.PUGYING_APP_URL = prevUrl;
      }
      if (prevFile === undefined) {
        delete process.env.PUGYING_APP_FILE;
      } else {
        process.env.PUGYING_APP_FILE = prevFile;
      }
      if (prevRenderer === undefined) {
        delete process.env.ELECTRON_RENDERER_URL;
      } else {
        process.env.ELECTRON_RENDERER_URL = prevRenderer;
      }
    }
  });

  it('uses bundled renderer file when PUGYING_APP_FILE=1', () => {
    const prevUrl = process.env.PUGYING_APP_URL;
    const prevFile = process.env.PUGYING_APP_FILE;
    const prevRenderer = process.env.ELECTRON_RENDERER_URL;
    delete process.env.PUGYING_APP_URL;
    process.env.PUGYING_APP_FILE = '1';
    process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173';
    try {
      const target = resolveAppLoadTarget();
      expect(target.kind).toBe('file');
      if (target.kind === 'file') {
        expect(target.filePath.replace(/\\/g, '/')).toMatch(
          /\/renderer\/index.html$/,
        );
      }
    } finally {
      if (prevUrl === undefined) {
        delete process.env.PUGYING_APP_URL;
      } else {
        process.env.PUGYING_APP_URL = prevUrl;
      }
      if (prevFile === undefined) {
        delete process.env.PUGYING_APP_FILE;
      } else {
        process.env.PUGYING_APP_FILE = prevFile;
      }
      if (prevRenderer === undefined) {
        delete process.env.ELECTRON_RENDERER_URL;
      } else {
        process.env.ELECTRON_RENDERER_URL = prevRenderer;
      }
    }
  });
});

describe('resolveRuntimeDesktopPlatform', () => {
  it('ignores force when not allowed', () => {
    expect(
      resolveRuntimeDesktopPlatform('darwin', 'win32', false),
    ).toBe('darwin');
  });

  it('applies force when allowed', () => {
    expect(
      resolveRuntimeDesktopPlatform('darwin', 'win32', true),
    ).toBe('win32');
  });

  it('ignores unknown force values', () => {
    expect(
      resolveRuntimeDesktopPlatform('darwin', 'android', true),
    ).toBe('darwin');
  });
});

describe('buildAppWindowOptions', () => {
  it('uses hiddenInset traffic lights on macOS', () => {
    const options = buildAppWindowOptions('darwin');
    expect(options.titleBarStyle).toBe('hiddenInset');
    expect(options.trafficLightPosition).toEqual({ x: 14, y: 18 });
    expect(options.titleBarOverlay).toBeUndefined();
    expect(options.icon).toEqual(expect.any(String));
    expect(resolveDesktopWindowChrome('darwin').controls).toBe('trafficLights');
  });

  it('uses titleBarOverlay on Windows', () => {
    const options = buildAppWindowOptions('win32');
    expect(options.titleBarStyle).toBe('hidden');
    expect(options.titleBarOverlay).toMatchObject({
      height: 40,
      color: '#ffffff',
      symbolColor: '#171717',
    });
    expect(resolveDesktopWindowChrome('win32').controls).toBe('overlay');
  });

  it('keeps default frame on Linux', () => {
    const options = buildAppWindowOptions('linux');
    expect(options.titleBarStyle).toBeUndefined();
    expect(options.titleBarOverlay).toBeUndefined();
    expect(resolveDesktopWindowChrome('linux').titleBarHeight).toBe(0);
  });
});
