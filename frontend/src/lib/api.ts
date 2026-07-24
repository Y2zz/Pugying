const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const TOKEN_KEY = 'pugying_access_token';
const USER_KEY = 'pugying_user';
const TENANT_KEY = 'pugying_tenant_id';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  tenantId: string;
  permissions: string[];
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function getTenantId(): string | null {
  return localStorage.getItem(TENANT_KEY);
}

export function setSession(accessToken: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(TENANT_KEY, String(user.tenantId));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TENANT_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const tenantId = getTenantId();
  if (tenantId) {
    headers.set('X-Tenant-Id', tenantId);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) {
        message = body.message.join(', ');
      } else if (body.message) {
        message = body.message;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const result = await apiFetch<LoginResponse>('/identity/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setSession(result.accessToken, result.user);
  return result;
}

export async function fetchMe(): Promise<AuthUser> {
  return apiFetch<AuthUser>('/identity/me');
}
