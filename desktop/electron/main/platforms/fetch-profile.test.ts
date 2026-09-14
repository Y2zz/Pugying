import type { Session } from 'electron';
import type { PlatformAdapter } from './adapters';
import { recordJsonEndpoints } from './endpoint-recorder';
import { fetchPlatformProfile } from './fetch-profile';

interface CompletedDetails {
  url: string;
  method: string;
  statusCode: number;
  resourceType: string;
  responseHeaders?: Record<string, string[]>;
}

/**
 * Session double whose fetch serves canned JSON per URL and whose
 * webRequest lets tests replay "the page called this endpoint" events.
 */
function makeSession(routes: Record<string, unknown>): {
  session: Session;
  emitCompleted: (details: CompletedDetails) => void;
  fetched: string[];
} {
  let listener: (details: CompletedDetails) => void = () => undefined;
  const fetched: string[] = [];
  const fake = {
    webRequest: {
      onCompleted: (_filter: unknown, cb: (d: CompletedDetails) => void) => {
        listener = cb;
      },
    },
    fetch: (url: string, _init?: unknown) => {
      fetched.push(url);
      if (Object.prototype.hasOwnProperty.call(routes, url)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(routes[url]),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      });
    },
  };
  return {
    session: fake as unknown as Session,
    emitCompleted: (details) => listener(details),
    fetched,
  };
}

function makeAdapter(overrides: Partial<PlatformAdapter>): PlatformAdapter {
  return {
    id: 'douyin',
    displayName: '测试平台',
    loginUrl: 'https://creator.example.com/',
    cookieDomains: ['.example.com'],
    isAuthed: () => false,
    ...overrides,
  };
}

describe('fetchPlatformProfile', () => {
  it('merges the user-id cookie with a declared profile source', async () => {
    const adapter = makeAdapter({
      userIdCookie: 'uid_cookie',
      profileSources: [
        {
          url: 'https://creator.example.com/api/user',
          idPaths: ['data.id'],
          nicknamePaths: ['data.nick'],
          avatarPaths: ['data.avatar'],
        },
      ],
    });
    const { session } = makeSession({
      'https://creator.example.com/api/user': {
        data: { nick: '小明', avatar: 'https://img.example.com/a.png' },
      },
    });

    const profile = await fetchPlatformProfile({
      adapter,
      authSession: session,
      cookies: [{ name: 'uid_cookie', value: '424242' }],
    });

    expect(profile).toEqual({
      platformUserId: '424242',
      nickname: '小明',
      avatarUrl: 'https://img.example.com/a.png',
    });
  });

  it('normalizes protocol-relative and http avatar URLs to https', async () => {
    const adapter = makeAdapter({
      profileSources: [
        {
          url: 'https://creator.example.com/api/a',
          idPaths: ['id'],
          nicknamePaths: ['nick'],
          avatarPaths: ['avatar'],
        },
        {
          url: 'https://creator.example.com/api/b',
          idPaths: ['id2'],
          nicknamePaths: ['nick2'],
          avatarPaths: ['avatar2'],
        },
      ],
    });
    const { session } = makeSession({
      'https://creator.example.com/api/a': {
        id: 7,
        nick: 'n1',
        avatar: '//img.example.com/p.png',
      },
    });

    const profile = await fetchPlatformProfile({
      adapter,
      authSession: session,
      cookies: [],
    });

    expect(profile?.platformUserId).toBe('7');
    expect(profile?.avatarUrl).toBe('https://img.example.com/p.png');
  });

  it('falls back to a deep scan when declared paths miss', async () => {
    const adapter = makeAdapter({
      profileSources: [
        {
          url: 'https://creator.example.com/api/user',
          idPaths: ['data.id'],
          nicknamePaths: ['data.nick'],
          avatarPaths: ['data.avatar'],
        },
      ],
    });
    const { session } = makeSession({
      'https://creator.example.com/api/user': {
        // Shifted shape: nothing at the declared paths.
        name: 'App Section',
        payload: {
          box: {
            user_id: 987654,
            nickname: '深扫用户',
            avatar_url: 'http://img.example.com/deep.png',
          },
        },
      },
    });

    const profile = await fetchPlatformProfile({
      adapter,
      authSession: session,
      cookies: [],
    });

    expect(profile).toEqual({
      platformUserId: '987654',
      // The specific `nickname` key must beat the generic `name` key.
      nickname: '深扫用户',
      avatarUrl: 'https://img.example.com/deep.png',
    });
  });

  it('merges partial results across multiple declared sources', async () => {
    const adapter = makeAdapter({
      profileSources: [
        {
          url: 'https://creator.example.com/api/first',
          idPaths: ['no.such.path'],
          nicknamePaths: ['nick'],
          avatarPaths: ['no.avatar'],
        },
        {
          url: 'https://creator.example.com/api/second',
          idPaths: ['uid'],
          nicknamePaths: ['no.nick'],
          avatarPaths: ['face'],
        },
      ],
    });
    const { session, fetched } = makeSession({
      'https://creator.example.com/api/first': { nick: '甲' },
      'https://creator.example.com/api/second': {
        uid: 'u-1',
        face: 'https://img.example.com/f.png',
      },
    });

    const profile = await fetchPlatformProfile({
      adapter,
      authSession: session,
      cookies: [],
    });

    expect(fetched).toEqual([
      'https://creator.example.com/api/first',
      'https://creator.example.com/api/second',
    ]);
    expect(profile).toEqual({
      platformUserId: 'u-1',
      nickname: '甲',
      avatarUrl: 'https://img.example.com/f.png',
    });
  });

  it('replays recorded page endpoints when declared sources fail', async () => {
    const adapter = makeAdapter({ profileSources: [] });
    const { session, emitCompleted, fetched } = makeSession({
      'https://api.example.com/creator/user/info': {
        data: { user_id: 'rec-1', nickname: '录制', face: 'https://a.example.com/i.png' },
      },
    });
    recordJsonEndpoints(session, adapter.cookieDomains);
    emitCompleted({
      url: 'https://api.example.com/creator/user/info',
      method: 'GET',
      statusCode: 200,
      resourceType: 'xhr',
      responseHeaders: { 'content-type': ['application/json'] },
    });
    // Unsafe-looking URLs must never be replayed.
    emitCompleted({
      url: 'https://api.example.com/user/delete',
      method: 'GET',
      statusCode: 200,
      resourceType: 'xhr',
      responseHeaders: { 'content-type': ['application/json'] },
    });

    const profile = await fetchPlatformProfile({
      adapter,
      authSession: session,
      cookies: [],
    });

    expect(profile).toEqual({
      platformUserId: 'rec-1',
      nickname: '录制',
      avatarUrl: 'https://a.example.com/i.png',
    });
    expect(fetched).toContain('https://api.example.com/creator/user/info');
    expect(fetched).not.toContain('https://api.example.com/user/delete');
  });

  it('returns null when nothing can be determined', async () => {
    const adapter = makeAdapter({
      profileSources: [
        {
          url: 'https://creator.example.com/api/missing',
          idPaths: ['id'],
          nicknamePaths: ['nick'],
          avatarPaths: ['avatar'],
        },
      ],
    });
    const { session } = makeSession({});

    const profile = await fetchPlatformProfile({
      adapter,
      authSession: session,
      cookies: [{ name: 'other', value: 'y' }],
    });

    expect(profile).toBeNull();
  });

  it('survives a fetch that rejects outright', async () => {
    const adapter = makeAdapter({
      profileSources: [
        {
          url: 'https://creator.example.com/api/boom',
          idPaths: ['id'],
          nicknamePaths: ['nick'],
          avatarPaths: ['avatar'],
        },
      ],
    });
    const throwing = {
      webRequest: { onCompleted: () => undefined },
      fetch: () => Promise.reject(new Error('network down')),
    } as unknown as Session;

    const profile = await fetchPlatformProfile({
      adapter,
      authSession: throwing,
      cookies: [],
    });

    expect(profile).toBeNull();
  });
});
