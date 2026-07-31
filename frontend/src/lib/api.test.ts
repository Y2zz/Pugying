import {
  apiFetch,
  clearSession,
  completeLogin,
  fetchContents,
  getAccessToken,
  getStoredTeam,
  getStoredUser,
  getTeamId,
  isAuthenticated,
  isLoginRequiresTeamSelection,
  kickTeamMember,
  login,
  refreshClaims,
  register,
  selectTeam,
  setSession,
  setStoredTeam,
  switchTeam,
  type AuthUser,
  type LoginResult,
  type TeamOption,
} from '@/lib/api';

const TOKEN_KEY = 'pugying_access_token';
const USER_KEY = 'pugying_user';
const TEAM_KEY = 'pugying_team_id';
const TEAM_INFO_KEY = 'pugying_team_info';

function createLocalStorageStub(): Storage {
  let store = new Map<string, string>();
  return {
    get length(): number {
      return store.size;
    },
    clear(): void {
      store = new Map();
    },
    getItem(key: string): string | null {
      const value = store.get(key);
      return value === undefined ? null : value;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
  };
}

const savedGlobals: Record<string, PropertyDescriptor | undefined> = {
  localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
  fetch: Object.getOwnPropertyDescriptor(globalThis, 'fetch'),
};

function setGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, {
    value,
    writable: true,
    configurable: true,
  });
}

function restoreGlobals(): void {
  for (const [name, descriptor] of Object.entries(savedGlobals)) {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, name);
    }
  }
}

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

let fetchCalls: FetchCall[] = [];

function fakeResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: (): Promise<unknown> => {
      if (body === undefined) {
        return Promise.reject(new Error('no JSON body'));
      }
      return Promise.resolve(body);
    },
  } as unknown as Response;
}

function stubFetch(...responses: Response[]): void {
  const queue = [...responses];
  setGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push({ url, init });
    const next = queue.shift();
    if (!next) {
      return Promise.reject(new Error(`unexpected fetch call: ${url}`));
    }
    return Promise.resolve(next);
  });
}

function headersOf(call: FetchCall | undefined): Headers {
  return new Headers(call?.init?.headers);
}

function bodyOf(call: FetchCall | undefined): unknown {
  const body = call?.init?.body;
  if (typeof body !== 'string') {
    throw new Error('expected a string request body');
  }
  return JSON.parse(body);
}

const sampleUser: AuthUser = {
  id: 'user-1',
  email: 'admin@pugying.local',
  username: 'admin',
  teamId: 'team-1',
  permissions: ['TeamManagement.Teams.View'],
};

const sampleTeam: TeamOption = {
  id: 'team-1',
  name: 'default',
  displayName: '默认团队',
};

const loginResponse = { accessToken: 'token-abc', user: sampleUser };

beforeEach(() => {
  setGlobal('localStorage', createLocalStorageStub());
  fetchCalls = [];
});

afterEach(() => {
  restoreGlobals();
});

describe('session storage helpers', () => {
  it('returns empty session values when storage is empty', () => {
    expect(getAccessToken()).toBeNull();
    expect(getStoredUser()).toBeNull();
    expect(getStoredTeam()).toBeNull();
    expect(getTeamId()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });

  it('getStoredUser parses the stored user and tolerates corrupt JSON', () => {
    localStorage.setItem(USER_KEY, JSON.stringify(sampleUser));
    expect(getStoredUser()).toEqual(sampleUser);

    localStorage.setItem(USER_KEY, '{not-json');
    expect(getStoredUser()).toBeNull();
  });

  it('setStoredTeam stores, replaces and removes team info', () => {
    setStoredTeam(sampleTeam);
    expect(getStoredTeam()).toEqual(sampleTeam);

    setStoredTeam(null);
    expect(getStoredTeam()).toBeNull();
    expect(localStorage.getItem(TEAM_INFO_KEY)).toBeNull();

    localStorage.setItem(TEAM_INFO_KEY, '{not-json');
    expect(getStoredTeam()).toBeNull();
  });

  it('setSession stores token, user, team id and team info', () => {
    setSession('token-abc', sampleUser, sampleTeam);

    expect(getAccessToken()).toBe('token-abc');
    expect(getStoredUser()).toEqual(sampleUser);
    expect(getTeamId()).toBe('team-1');
    expect(getStoredTeam()).toEqual(sampleTeam);
    expect(isAuthenticated()).toBe(true);
  });

  it('setSession falls back to a placeholder when team info is unknown', () => {
    setSession('token-abc', sampleUser);

    expect(getStoredTeam()).toEqual({ id: 'team-1', name: '', displayName: '…' });
  });

  it('setSession keeps previously stored info for the same team', () => {
    setStoredTeam(sampleTeam);
    setSession('token-abc', sampleUser);

    expect(getStoredTeam()).toEqual(sampleTeam);
  });

  it('setSession clears team keys for a user without a team', () => {
    setSession('old-token', sampleUser, sampleTeam);
    setSession('token-abc', { ...sampleUser, teamId: null });

    expect(getTeamId()).toBeNull();
    expect(getStoredTeam()).toBeNull();
    expect(localStorage.getItem(TEAM_KEY)).toBeNull();
  });

  it('clearSession removes every session key', () => {
    setSession('token-abc', sampleUser, sampleTeam);
    clearSession();

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(localStorage.getItem(TEAM_KEY)).toBeNull();
    expect(localStorage.getItem(TEAM_INFO_KEY)).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });
});

describe('apiFetch', () => {
  it('prefixes the default base URL and parses the JSON body', async () => {
    stubFetch(fakeResponse(200, { hello: 'world' }));

    const result = await apiFetch<{ hello: string }>('/ping');

    expect(result).toEqual({ hello: 'world' });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('http://localhost:3000/ping');
  });

  it('sends no auth headers when logged out and no body is present', async () => {
    stubFetch(fakeResponse(200, {}));

    await apiFetch('/ping');

    const headers = headersOf(fetchCalls[0]);
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.has('X-Team-Id')).toBe(false);
    expect(headers.has('Content-Type')).toBe(false);
  });

  it('sends Authorization and X-Team-Id headers for an active session', async () => {
    setSession('token-abc', sampleUser, sampleTeam);
    stubFetch(fakeResponse(200, {}));

    await apiFetch('/contents');

    const headers = headersOf(fetchCalls[0]);
    expect(headers.get('Authorization')).toBe('Bearer token-abc');
    expect(headers.get('X-Team-Id')).toBe('team-1');
  });

  it('sets Content-Type for requests with a body unless already provided', async () => {
    stubFetch(fakeResponse(200, {}), fakeResponse(200, {}));

    await apiFetch('/a', { method: 'POST', body: '{"x":1}' });
    await apiFetch('/b', {
      method: 'POST',
      body: 'raw',
      headers: { 'Content-Type': 'text/plain' },
    });

    expect(headersOf(fetchCalls[0]).get('Content-Type')).toBe('application/json');
    expect(headersOf(fetchCalls[1]).get('Content-Type')).toBe('text/plain');
  });

  it('throws the server-provided message on error responses', async () => {
    stubFetch(fakeResponse(401, { message: 'Invalid credentials' }));

    await expect(apiFetch('/x')).rejects.toThrow('Invalid credentials');
  });

  it('joins array error messages with commas', async () => {
    stubFetch(fakeResponse(400, { message: ['email must be an email', 'password too short'] }));

    await expect(apiFetch('/x')).rejects.toThrow('email must be an email, password too short');
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    stubFetch(fakeResponse(500));

    await expect(apiFetch('/x')).rejects.toThrow('Request failed (500)');
  });

  it('resolves undefined for 204 responses', async () => {
    stubFetch(fakeResponse(204));

    await expect(apiFetch('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});

describe('auth and team flows', () => {
  it('login posts the credentials to /account/login', async () => {
    stubFetch(fakeResponse(200, loginResponse));

    const result = await login('admin@pugying.local', 'Admin123!');

    expect(result).toEqual(loginResponse);
    expect(fetchCalls[0].url).toContain('/account/login');
    expect(fetchCalls[0].init?.method).toBe('POST');
    expect(bodyOf(fetchCalls[0])).toEqual({
      email: 'admin@pugying.local',
      password: 'Admin123!',
    });
  });

  it('isLoginRequiresTeamSelection narrows the login result union', () => {
    const selection: LoginResult = {
      requiresTeamSelection: true,
      loginTicket: 'ticket-1',
      teams: [sampleTeam],
    };

    expect(isLoginRequiresTeamSelection(selection)).toBe(true);
    expect(isLoginRequiresTeamSelection(loginResponse)).toBe(false);
  });

  it('completeLogin throws without storing a session when team selection is required', async () => {
    stubFetch(fakeResponse(200, { requiresTeamSelection: true, loginTicket: 't', teams: [] }));

    await expect(completeLogin('a@b.c', 'pw')).rejects.toThrow('REQUIRES_TEAM_SELECTION');
    expect(getAccessToken()).toBeNull();
  });

  it('completeLogin stores the session and resolves the team info', async () => {
    stubFetch(fakeResponse(200, loginResponse), fakeResponse(200, [sampleTeam]));

    await completeLogin('admin@pugying.local', 'Admin123!');

    expect(fetchCalls[1].url).toContain('/account/my-teams');
    // The second request already carries the freshly stored token.
    expect(headersOf(fetchCalls[1]).get('Authorization')).toBe('Bearer token-abc');
    expect(getAccessToken()).toBe('token-abc');
    expect(getStoredTeam()).toEqual(sampleTeam);
  });

  it('selectTeam posts the ticket and persists the session', async () => {
    const otherTeam: TeamOption = { id: 'team-2', name: 'demo', displayName: '演示团队' };
    const response = {
      accessToken: 'token-t2',
      user: { ...sampleUser, teamId: 'team-2' },
    };
    stubFetch(fakeResponse(200, response));

    const result = await selectTeam('ticket-1', otherTeam);

    expect(result).toEqual(response);
    expect(fetchCalls[0].url).toContain('/account/login/select-team');
    expect(bodyOf(fetchCalls[0])).toEqual({ loginTicket: 'ticket-1', teamId: 'team-2' });
    expect(getAccessToken()).toBe('token-t2');
    expect(getStoredTeam()).toEqual(otherTeam);
  });

  it('switchTeam posts the team id and persists the session', async () => {
    const otherTeam: TeamOption = { id: 'team-2', name: 'demo', displayName: '演示团队' };
    stubFetch(
      fakeResponse(200, {
        accessToken: 'token-t2',
        user: { ...sampleUser, teamId: 'team-2' },
      })
    );

    await switchTeam(otherTeam);

    expect(fetchCalls[0].url).toContain('/account/switch-team');
    expect(bodyOf(fetchCalls[0])).toEqual({ teamId: 'team-2' });
    expect(getTeamId()).toBe('team-2');
    expect(getStoredTeam()).toEqual(otherTeam);
  });

  it('kickTeamMember posts user and team ids', async () => {
    stubFetch(fakeResponse(204, undefined));

    await kickTeamMember({ userId: 'user-2', teamId: 'team-1' });

    expect(fetchCalls[0].url).toContain('/account/kick');
    expect(fetchCalls[0].init?.method).toBe('POST');
    expect(bodyOf(fetchCalls[0])).toEqual({ userId: 'user-2', teamId: 'team-1' });
  });

  it('register posts email username and password', async () => {
    stubFetch(
      fakeResponse(200, {
        id: 'user-new',
        email: 'new@example.com',
        username: 'newbie',
        active: true,
      }),
    );

    const result = await register({
      email: 'new@example.com',
      username: 'newbie',
      password: 'Secret123!',
    });

    expect(result.username).toBe('newbie');
    expect(fetchCalls[0].url).toContain('/account/register');
    expect(bodyOf(fetchCalls[0])).toEqual({
      email: 'new@example.com',
      username: 'newbie',
      password: 'Secret123!',
    });
  });

  it('refreshClaims keeps stored team info when the team id still matches', async () => {
    setSession('old-token', sampleUser, sampleTeam);
    stubFetch(fakeResponse(200, { accessToken: 'new-token', user: sampleUser }));

    await refreshClaims();

    expect(fetchCalls[0].url).toContain('/account/refresh-claims');
    expect(fetchCalls[0].init?.method).toBe('POST');
    expect(getAccessToken()).toBe('new-token');
    expect(getStoredTeam()).toEqual(sampleTeam);
  });

  it('fetchContents appends the type query only when provided', async () => {
    stubFetch(fakeResponse(200, []), fakeResponse(200, []));

    await fetchContents();
    await fetchContents('article');

    expect(fetchCalls[0].url.endsWith('/contents')).toBe(true);
    expect(fetchCalls[1].url.endsWith('/contents?type=article')).toBe(true);
  });
});
