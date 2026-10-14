import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { readPrefs, writePrefs } from './prefs';

// Resolved through the electron mock, so this points into the OS tmpdir.
const prefsFile = path.join(app.getPath('userData'), 'agent-prefs.json');

function removePrefsFile(): void {
  fs.rmSync(prefsFile, { force: true });
}

describe('prefs', () => {
  beforeEach(() => {
    removePrefsFile();
  });

  afterEach(() => {
    removePrefsFile();
  });

  it('returns defaults when no prefs file exists', () => {
    expect(readPrefs()).toEqual({
      firstRunGuideSeen: false,
      stepBubblesDismissed: false,
    });
  });

  it('persists a patch and merges it with existing values', () => {
    writePrefs({ firstRunGuideSeen: true });
    expect(readPrefs()).toEqual({
      firstRunGuideSeen: true,
      stepBubblesDismissed: false,
    });

    writePrefs({ stepBubblesDismissed: true });
    expect(readPrefs()).toEqual({
      firstRunGuideSeen: true,
      stepBubblesDismissed: true,
    });
  });

  it('writes the file to disk and returns the merged result', () => {
    const next = writePrefs({ stepBubblesDismissed: true });
    expect(next).toEqual({
      firstRunGuideSeen: false,
      stepBubblesDismissed: true,
    });
    expect(fs.existsSync(prefsFile)).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
    expect(onDisk).toEqual(next);
  });

  it('falls back to defaults on a corrupted prefs file', () => {
    fs.mkdirSync(path.dirname(prefsFile), { recursive: true });
    fs.writeFileSync(prefsFile, 'not json at all', 'utf8');
    expect(readPrefs()).toEqual({
      firstRunGuideSeen: false,
      stepBubblesDismissed: false,
    });
  });

  it('coerces persisted values to booleans', () => {
    fs.mkdirSync(path.dirname(prefsFile), { recursive: true });
    fs.writeFileSync(
      prefsFile,
      JSON.stringify({ firstRunGuideSeen: 1, stepBubblesDismissed: '' }),
      'utf8',
    );
    expect(readPrefs()).toEqual({
      firstRunGuideSeen: true,
      stepBubblesDismissed: false,
    });
  });
});
