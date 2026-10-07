import type { Session, WebContents } from 'electron';
import type {
  CookieLike,
  PlatformAdapter,
  PlatformProfile,
  ProfileScrape,
  ProfileSource,
} from './adapters';
import { getRecordedEndpoints } from './endpoint-recorder';

const REQUEST_TIMEOUT_MS = 6000;

/**
 * Profile lookup is best-effort against undocumented APIs, so it logs its
 * decisions: when a platform stops resolving, this trace says which step
 * failed without needing a debugger attached.
 */
function log(message: string): void {
  console.log(`[pugying-desktop] profile: ${message}`);
}

function describe(profile: PlatformProfile): string {
  const parts: string[] = [];
  if (profile.platformUserId) {
    parts.push('id');
  }
  if (profile.nickname) {
    parts.push('nickname');
  }
  if (profile.avatarUrl) {
    parts.push('avatar');
  }
  return parts.length > 0 ? parts.join('+') : 'nothing';
}

/**
 * Read a dotted path out of an unknown JSON value, e.g.
 * `data.user.avatar.url_list[0]`. Returns undefined on any mismatch —
 * these are undocumented APIs, so every lookup must be non-throwing.
 */
function readPath(source: unknown, path: string): unknown {
  const segments = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((segment) => segment.length > 0);
  let current = source;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** First path that yields a non-empty scalar, coerced to string. */
function pickString(source: unknown, paths: string[]): string | undefined {
  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  if (value.startsWith('//')) {
    return `https:${value}`;
  }
  if (value.startsWith('http://')) {
    // Avatars are served over https everywhere; upgrading avoids mixed
    // content when the frontend renders them.
    return `https://${value.slice('http://'.length)}`;
  }
  return value.startsWith('https://') ? value : undefined;
}

function isEmpty(profile: PlatformProfile): boolean {
  return (
    !profile.platformUserId && !profile.nickname && !profile.avatarUrl
  );
}

function isComplete(profile: PlatformProfile): boolean {
  return Boolean(
    profile.platformUserId && profile.nickname && profile.avatarUrl,
  );
}

/**
 * 授权成功唯一条件：登录后用户信息同时包含平台用户 ID 与昵称。
 * 仅 cookie / URL、或只有 userIdCookie 填出的 uid、或仅有头像 —— 一律不算。
 */
export function hasLoggedInUserInfo(
  profile: PlatformProfile | null | undefined,
): boolean {
  return Boolean(
    profile?.platformUserId?.trim() && profile?.nickname?.trim(),
  );
}

function mergeAlternateIds(
  current: string[] | undefined,
  incoming: string[] | undefined,
): string[] | undefined {
  const merged = [...(current ?? []), ...(incoming ?? [])]
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (merged.length === 0) {
    return undefined;
  }
  return [...new Set(merged)];
}

function merge(
  target: PlatformProfile,
  source: PlatformProfile | null,
): PlatformProfile {
  if (!source) {
    return target;
  }
  target.platformUserId = target.platformUserId ?? source.platformUserId;
  target.nickname = target.nickname ?? source.nickname;
  target.avatarUrl = target.avatarUrl ?? source.avatarUrl;
  target.alternateUserIds = mergeAlternateIds(
    target.alternateUserIds,
    source.alternateUserIds,
  );
  return target;
}

/**
 * Key names to look for when the declared paths miss. Split into specific
 * and generic tiers: a response often has both `nickname` (the user) and
 * `name` (an app/section), so specific keys must win.
 */
const ID_KEYS_SPECIFIC = [
  'user_id',
  'userId',
  'sec_uid',
  'secUid',
  'media_id',
  'mediaId',
  'finderUsername',
  'uniqId',
  'uid',
  'mid',
];
const ID_KEYS_GENERIC = ['id'];
const NICKNAME_KEYS_SPECIFIC = [
  'nickname',
  'nick_name',
  'nickName',
  'uname',
  'screen_name',
  'screenName',
  'user_name',
  'userName',
  'media_name',
  'mediaName',
  'display_name',
  'displayName',
];
const NICKNAME_KEYS_GENERIC = ['name', 'title'];
const AVATAR_KEYS_SPECIFIC = [
  'avatar_url',
  'avatarUrl',
  'avatar_larger',
  'avatar_thumb',
  'avatar_168x168',
  'avatar_300x300',
  'head_img_url',
  'headImgUrl',
  'head_url',
  'headUrl',
  'profile_image_url',
  'avatar',
  'face',
];
const AVATAR_KEYS_GENERIC = ['icon', 'image', 'img'];

const MAX_SCAN_NODES = 3000;

function scalarToString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value) && value !== 0) {
    return String(value);
  }
  return undefined;
}

function asIdValue(value: unknown): string | undefined {
  const text = scalarToString(value);
  if (!text || text === '0' || text.length > 64) {
    return undefined;
  }
  return text;
}

function asNicknameValue(value: unknown): string | undefined {
  const text = scalarToString(value);
  if (!text || text.length > 40 || text.includes('://')) {
    return undefined;
  }
  return text;
}

/**
 * Avatars appear as a bare URL, as `{ url_list: [...] }` (ByteDance), or as
 * `{ url: ... }`. Accept all three.
 */
function asAvatarValue(value: unknown): string | undefined {
  const direct = normalizeUrl(scalarToString(value));
  if (direct) {
    return direct;
  }
  if (value && typeof value === 'object') {
    const nested = value as Record<string, unknown>;
    const fromList = Array.isArray(nested.url_list)
      ? scalarToString(nested.url_list[0])
      : undefined;
    return normalizeUrl(fromList ?? scalarToString(nested.url));
  }
  return undefined;
}

/**
 * Breadth-first sweep of an arbitrary JSON response for profile-looking
 * fields. This is what makes the lookup survive response-shape drift: the
 * endpoint only has to return the data somewhere, not at a known path.
 */
function deepScan(root: unknown): PlatformProfile | null {
  const objects: Record<string, unknown>[] = [];
  const queue: unknown[] = [root];
  let visited = 0;

  while (queue.length > 0 && visited < MAX_SCAN_NODES) {
    const node = queue.shift();
    visited += 1;
    if (!node || typeof node !== 'object') {
      continue;
    }
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    const record = node as Record<string, unknown>;
    objects.push(record);
    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  const findField = <T>(
    keyTiers: string[][],
    convert: (value: unknown) => T | undefined,
  ): T | undefined => {
    for (const keys of keyTiers) {
      for (const key of keys) {
        for (const record of objects) {
          if (!(key in record)) {
            continue;
          }
          const converted = convert(record[key]);
          if (converted !== undefined) {
            return converted;
          }
        }
      }
    }
    return undefined;
  };

  const profile: PlatformProfile = {
    platformUserId: findField([ID_KEYS_SPECIFIC, ID_KEYS_GENERIC], asIdValue),
    nickname: findField(
      [NICKNAME_KEYS_SPECIFIC, NICKNAME_KEYS_GENERIC],
      asNicknameValue,
    ),
    avatarUrl: findField(
      [AVATAR_KEYS_SPECIFIC, AVATAR_KEYS_GENERIC],
      asAvatarValue,
    ),
  };
  return isEmpty(profile) ? null : profile;
}

async function fetchSource(
  authSession: Session,
  adapter: PlatformAdapter,
  source: ProfileSource,
): Promise<PlatformProfile | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  try {
    const method = source.method ?? 'GET';
    const referer = adapter.profileReferer ?? adapter.loginUrl;
    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
      Referer: referer,
    };
    try {
      headers.Origin = new URL(referer).origin;
    } catch {
      // loginUrl 异常时不加 Origin
    }
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
    }
    const rawBody =
      typeof source.body === 'function' ? source.body() : source.body;
    // session.fetch (not net.fetch) so the partition's cookies are attached.
    const response = await authSession.fetch(source.url, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(rawBody ?? {}) : undefined,
      credentials: 'include',
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const json: unknown = await response.json();
    const alternateUserIds = (source.alternateIdPaths ?? [])
      .map((path) => pickString(json, [path]))
      .filter((value): value is string => Boolean(value));
    const profile: PlatformProfile = {
      platformUserId: pickString(json, source.idPaths),
      nickname: pickString(json, source.nicknamePaths),
      avatarUrl: normalizeUrl(pickString(json, source.avatarPaths)),
      alternateUserIds:
        alternateUserIds.length > 0
          ? [...new Set(alternateUserIds)]
          : undefined,
    };
    // Declared paths are just a fast path; if the shape drifted, sweep the
    // whole response for profile-looking fields before giving up.
    if (!isComplete(profile)) {
      merge(profile, deepScan(json));
    }
    log(`source ${source.url} -> ${describe(profile)}`);
    return isEmpty(profile) ? null : profile;
  } catch {
    // Endpoint moved, blocked, timed out, or returned non-JSON — try the next.
    log(`source ${source.url} -> failed`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Words that make a GET unsafe to replay even if the page called it. */
const UNSAFE_URL_WORDS = [
  'delete',
  'remove',
  'create',
  'update',
  'publish',
  'upload',
  'submit',
  'send',
  'save',
  'edit',
  'logout',
  'revoke',
  'cancel',
  'apply',
  'bind',
  'report',
];

/** Words suggesting a response carries the current user's profile. */
const PROFILE_URL_WORDS = [
  'user',
  'media',
  'account',
  'profile',
  'creator',
  'author',
  'self',
  'nav',
  'me',
  'info',
  'base',
];

const MAX_REPLAYS = 8;

function scoreUrl(url: string): number {
  const lower = url.toLowerCase();
  if (UNSAFE_URL_WORDS.some((word) => lower.includes(word))) {
    return -1;
  }
  let score = 0;
  for (const word of PROFILE_URL_WORDS) {
    if (lower.includes(word)) {
      score += 1;
    }
  }
  return score;
}

/**
 * Replay the most profile-looking endpoints the page called on itself and
 * deep-scan their responses. This is the self-healing path: it needs no
 * hard-coded URL, so it keeps working when a platform reshuffles its API.
 */
async function discoverFromRecordedEndpoints(
  authSession: Session,
  adapter: PlatformAdapter,
  known: PlatformProfile,
): Promise<PlatformProfile | null> {
  const candidates = getRecordedEndpoints(authSession)
    .map((url) => ({ url, score: scoreUrl(url) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_REPLAYS);

  if (candidates.length === 0) {
    log('no recorded endpoints to replay');
    return null;
  }

  const found: PlatformProfile = { ...known };
  for (const candidate of candidates) {
    const result = await fetchSource(authSession, adapter, {
      url: candidate.url,
      // Paths unknown by definition — deepScan does the extraction.
      idPaths: [],
      nicknamePaths: [],
      avatarPaths: [],
    });
    merge(found, result);
    if (isComplete(found)) {
      break;
    }
  }
  return isEmpty(found) ? null : found;
}

/**
 * Last-resort scrape of the logged-in page. Platform markup changes often,
 * so this is expected to miss sometimes; the user can always rename the
 * account by hand afterwards.
 */
async function scrapeFromPage(
  webContents: WebContents,
  scrape: ProfileScrape,
): Promise<PlatformProfile | null> {
  const script = `
    (() => {
      const pickText = (selectors) => {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          const text = el && el.textContent ? el.textContent.trim() : '';
          if (text && text.length <= 40) {
            return text;
          }
        }
        return undefined;
      };
      const pickImg = (selectors) => {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          const src = el && el.getAttribute ? el.getAttribute('src') : '';
          if (src) {
            return src;
          }
        }
        return undefined;
      };
      return {
        nickname: pickText(${JSON.stringify(scrape.nicknameSelectors)}),
        avatarUrl: pickImg(${JSON.stringify(scrape.avatarSelectors)}),
      };
    })()
  `;
  try {
    const raw: unknown = await webContents.executeJavaScript(script, true);
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const result = raw as { nickname?: unknown; avatarUrl?: unknown };
    const profile: PlatformProfile = {
      nickname:
        typeof result.nickname === 'string' ? result.nickname : undefined,
      avatarUrl: normalizeUrl(
        typeof result.avatarUrl === 'string' ? result.avatarUrl : undefined,
      ),
    };
    return isEmpty(profile) ? null : profile;
  } catch {
    return null;
  }
}

/**
 * Best-effort account profile lookup, in increasing order of brittleness:
 * a user-id cookie, then each declared API endpoint, then a DOM scrape.
 * Partial results are merged; callers that gate auth success must use
 * {@link hasLoggedInUserInfo} (id + nickname), not mere non-emptiness.
 */
export async function fetchPlatformProfile(options: {
  adapter: PlatformAdapter;
  authSession: Session;
  cookies: CookieLike[];
  webContents?: WebContents;
}): Promise<PlatformProfile | null> {
  const { adapter, authSession, cookies, webContents } = options;
  const merged: PlatformProfile = {};

  if (adapter.userIdCookie) {
    const cookie = cookies.find((item) => item.name === adapter.userIdCookie);
    if (cookie?.value) {
      merged.platformUserId = cookie.value;
    }
  }

  for (const source of adapter.profileSources ?? []) {
    merge(merged, await fetchSource(authSession, adapter, source));
    if (isComplete(merged)) {
      log(`${adapter.id}: resolved from declared sources`);
      return merged;
    }
  }

  // Declared endpoints incomplete — fall back to replaying what the page
  // itself called. This is what covers platforms whose APIs we never knew.
  merge(
    merged,
    await discoverFromRecordedEndpoints(authSession, adapter, merged),
  );
  if (isComplete(merged)) {
    log(`${adapter.id}: resolved via recorded endpoints`);
    return merged;
  }

  if (adapter.profileScrape && webContents && !webContents.isDestroyed()) {
    const scraped = await scrapeFromPage(webContents, adapter.profileScrape);
    log(`dom scrape -> ${scraped ? describe(scraped) : 'nothing'}`);
    merged.nickname = merged.nickname ?? scraped?.nickname;
    merged.avatarUrl = merged.avatarUrl ?? scraped?.avatarUrl;
  }

  log(`${adapter.id}: final ${describe(merged)}`);
  return isEmpty(merged) ? null : merged;
}
