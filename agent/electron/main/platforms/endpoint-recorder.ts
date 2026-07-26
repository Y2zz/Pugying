import type { Session } from 'electron';

/**
 * Records the JSON endpoints a creator page calls on itself.
 *
 * Platform profile APIs are undocumented and move around, so hard-coded
 * endpoint lists rot. The page, however, always knows where its own user
 * info lives — so we watch which XHR/fetch calls it makes, and later replay
 * the promising ones (see fetch-profile.ts) instead of guessing URLs.
 *
 * Only successful JSON GETs are kept: those are the safe ones to replay.
 */

const MAX_URLS_PER_SESSION = 300;

const NON_API_RESOURCE_TYPES = new Set<string>([
  'mainFrame',
  'subFrame',
  'stylesheet',
  'script',
  'image',
  'font',
  'media',
  'webSocket',
  'cspReport',
  'ping',
]);

/** Keyed by Session so entries disappear with the partition — no cleanup. */
const recorded = new WeakMap<Session, Set<string>>();

function headerValue(
  headers: Record<string, string[]> | undefined,
  name: string,
): string {
  if (!headers) {
    return '';
  }
  const key = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === name,
  );
  if (!key) {
    return '';
  }
  const value = headers[key];
  return Array.isArray(value) ? value.join(',') : String(value ?? '');
}

function hostMatches(url: string, domains: string[]): boolean {
  try {
    const host = new URL(url).hostname;
    return domains.some((domain) => {
      const bare = domain.replace(/^\./, '');
      return host === bare || host.endsWith(`.${bare}`);
    });
  } catch {
    return false;
  }
}

/**
 * Start recording on a session. Safe to call once per session — Electron
 * keeps a single onCompleted listener per session, so a second call simply
 * replaces the first.
 */
export function recordJsonEndpoints(
  authSession: Session,
  cookieDomains: string[],
): void {
  const urls = recorded.get(authSession) ?? new Set<string>();
  recorded.set(authSession, urls);

  authSession.webRequest.onCompleted(
    { urls: ['<all_urls>'] },
    (details) => {
      if (urls.size >= MAX_URLS_PER_SESSION) {
        return;
      }
      if (details.method !== 'GET' || details.statusCode !== 200) {
        return;
      }
      // Electron types XHR/fetch inconsistently across versions, so exclude
      // the resource types that clearly aren't API calls instead.
      if (NON_API_RESOURCE_TYPES.has(details.resourceType)) {
        return;
      }
      if (!hostMatches(details.url, cookieDomains)) {
        return;
      }
      const contentType = headerValue(
        details.responseHeaders,
        'content-type',
      ).toLowerCase();
      if (!contentType.includes('json')) {
        return;
      }
      urls.add(details.url);
    },
  );
}

export function getRecordedEndpoints(authSession: Session): string[] {
  return [...(recorded.get(authSession) ?? [])];
}
