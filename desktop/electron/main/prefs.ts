import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface AgentPrefs {
  /** First-run intro slides have been completed or skipped */
  firstRunGuideSeen: boolean;
  /** User opted out of per-session step bubbles */
  stepBubblesDismissed: boolean;
}

const DEFAULT_PREFS: AgentPrefs = {
  firstRunGuideSeen: false,
  stepBubblesDismissed: false,
};

function prefsPath(): string {
  return path.join(app.getPath('userData'), 'agent-prefs.json');
}

export function readPrefs(): AgentPrefs {
  try {
    const raw = fs.readFileSync(prefsPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<AgentPrefs>;
    return {
      firstRunGuideSeen: Boolean(parsed.firstRunGuideSeen),
      stepBubblesDismissed: Boolean(parsed.stepBubblesDismissed),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writePrefs(patch: Partial<AgentPrefs>): AgentPrefs {
  const next = { ...readPrefs(), ...patch };
  fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
  fs.writeFileSync(prefsPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}
