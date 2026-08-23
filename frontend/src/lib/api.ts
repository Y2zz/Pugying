const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://localhost:3000';

const TOKEN_KEY = 'pugying_access_token';
const USER_KEY = 'pugying_user';
const TEAM_KEY = 'pugying_team_id';
const TEAM_INFO_KEY = 'pugying_team_info';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  teamId: string | null;
  permissions: string[];
}

export interface TeamOption {
  id: string;
  name: string;
  displayName: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface LoginRequiresTeamSelection {
  requiresTeamSelection: true;
  loginTicket: string;
  teams: TeamOption[];
}

export type LoginResult = LoginResponse | LoginRequiresTeamSelection;

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

export function getTeamId(): string | null {
  return localStorage.getItem(TEAM_KEY);
}

export function getStoredTeam(): TeamOption | null {
  const raw = localStorage.getItem(TEAM_INFO_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as TeamOption;
  } catch {
    return null;
  }
}

export function setStoredTeam(team: TeamOption | null): void {
  if (!team) {
    localStorage.removeItem(TEAM_INFO_KEY);
    return;
  }
  localStorage.setItem(TEAM_INFO_KEY, JSON.stringify(team));
}

export function setSession(
  accessToken: string,
  user: AuthUser,
  team?: TeamOption,
): void {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (user.teamId) {
    localStorage.setItem(TEAM_KEY, user.teamId);
    if (team && team.id === user.teamId) {
      setStoredTeam(team);
    } else {
      const prev = getStoredTeam();
      if (!prev || prev.id !== user.teamId) {
        setStoredTeam({
          id: user.teamId,
          name: '',
          displayName: '…',
        });
      }
    }
  } else {
    localStorage.removeItem(TEAM_KEY);
    setStoredTeam(null);
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TEAM_KEY);
  localStorage.removeItem(TEAM_INFO_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const isFormData =
    typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (!headers.has('Content-Type') && init.body && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const teamId = getTeamId();
  if (teamId) {
    headers.set('X-Team-Id', teamId);
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

  // Nest 的 void DELETE 常为 200 + 空 body；仅认 204 会误走 json() 抛 Unexpected end of JSON input
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text.trim()) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export function isLoginRequiresTeamSelection(
  result: LoginResult,
): result is LoginRequiresTeamSelection {
  return (
    'requiresTeamSelection' in result && result.requiresTeamSelection === true
  );
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResult> {
  return apiFetch<LoginResult>('/account/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export interface RegisterResponse {
  id: string;
  email: string;
  username: string;
  active: boolean;
}

export async function register(body: {
  email: string;
  username: string;
  password: string;
}): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>('/account/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function selectTeam(
  loginTicket: string,
  team: TeamOption,
): Promise<LoginResponse> {
  const result = await apiFetch<LoginResponse>('/account/login/select-team', {
    method: 'POST',
    body: JSON.stringify({ loginTicket, teamId: team.id }),
  });
  setSession(result.accessToken, result.user, team);
  return result;
}

export async function switchTeam(team: TeamOption): Promise<LoginResponse> {
  const result = await apiFetch<LoginResponse>('/account/switch-team', {
    method: 'POST',
    body: JSON.stringify({ teamId: team.id }),
  });
  setSession(result.accessToken, result.user, team);
  return result;
}

export async function refreshClaims(): Promise<LoginResponse> {
  const result = await apiFetch<LoginResponse>('/account/refresh-claims', {
    method: 'POST',
  });
  const team = getStoredTeam();
  setSession(
    result.accessToken,
    result.user,
    team?.id === result.user.teamId ? team : undefined,
  );
  return result;
}

export async function fetchMyTeams(): Promise<TeamOption[]> {
  return apiFetch<TeamOption[]>('/account/my-teams');
}

export async function fetchMe(): Promise<AuthUser> {
  return apiFetch<AuthUser>('/identity/me');
}

export async function completeLogin(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const result = await login(email, password);
  if (isLoginRequiresTeamSelection(result)) {
    throw new Error('REQUIRES_TEAM_SELECTION');
  }
  setSession(result.accessToken, result.user);
  const teams = await fetchMyTeams();
  const match = teams.find((t) => t.id === result.user.teamId);
  if (match) {
    setStoredTeam(match);
  }
  return result;
}

export type PlatformId = 'douyin' | 'toutiao' | 'channels' | 'bilibili' | 'xiaohongshu';

export interface PlatformCatalogItem {
  id: PlatformId;
  displayName: string;
  loginUrl: string;
}

export interface PlatformAccountItem {
  id: string;
  teamId: string;
  platform: PlatformId;
  displayName: string;
  platformUserId: string | null;
  avatarUrl: string | null;
  status: 'active' | 'expired' | 'revoked';
  lastAuthedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Best-effort profile scraped by the Agent; every field may be missing. */
export interface PlatformProfile {
  platformUserId?: string;
  nickname?: string;
  avatarUrl?: string;
}

export async function fetchPlatformCatalog(): Promise<PlatformCatalogItem[]> {
  return apiFetch<PlatformCatalogItem[]>('/platform-accounts/platforms');
}

export async function fetchPlatformAccounts(params?: {
  platform?: PlatformId;
}): Promise<PlatformAccountItem[]> {
  const query = params?.platform
    ? `?platform=${encodeURIComponent(params.platform)}`
    : '';
  return apiFetch<PlatformAccountItem[]>(`/platform-accounts${query}`);
}

export async function bindPlatformAccount(body: {
  platform: string;
  displayName?: string;
  platformUserId?: string;
  cookies: unknown[];
  finalUrl?: string;
  profile?: PlatformProfile;
}): Promise<PlatformAccountItem> {
  return apiFetch<PlatformAccountItem>('/platform-accounts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function reauthPlatformAccount(
  id: string,
  body: {
    cookies: unknown[];
    displayName?: string;
    platformUserId?: string;
    finalUrl?: string;
    profile?: PlatformProfile;
  },
): Promise<PlatformAccountItem> {
  return apiFetch<PlatformAccountItem>(`/platform-accounts/${id}/reauth`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Manual rename — fallback when the Agent couldn't scrape a nickname. */
export async function renamePlatformAccount(
  id: string,
  displayName: string,
): Promise<PlatformAccountItem> {
  return apiFetch<PlatformAccountItem>(`/platform-accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  });
}

export async function deletePlatformAccount(id: string): Promise<void> {
  await apiFetch<void>(`/platform-accounts/${id}`, {
    method: 'DELETE',
  });
}

export interface PlatformAccountCredentials {
  accountId: string;
  platform: PlatformId;
  displayName: string;
  /** Creator-center entry URL for this platform */
  openUrl: string;
  cookies: unknown[];
  finalUrl: string | null;
}

/** Decrypted cookies for the desktop Agent to open a creator-center window. */
export async function fetchPlatformAccountCredentials(
  id: string,
): Promise<PlatformAccountCredentials> {
  return apiFetch<PlatformAccountCredentials>(
    `/platform-accounts/${id}/credentials`,
    { method: 'POST' },
  );
}

export type ContentType = 'article' | 'video';
export type ContentStatus = 'draft' | 'published';
export type ContentVisibility = 'public' | 'friends' | 'private';
export type TargetPublishStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

/** 针对单个账号的差异字段；未设置的字段使用内容通用设置 */
export interface ContentTargetOverrides {
  title?: string;
  body?: string;
  coverUrl?: string;
  tags?: string[];
  scheduledAt?: string;
}

export interface ContentTargetItem {
  id: string;
  teamId: string;
  contentId: string;
  platformAccountId: string;
  platform: PlatformId;
  overrides: ContentTargetOverrides;
  publishStatus: TargetPublishStatus;
  platformPostId: string | null;
  platformUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentItem {
  id: string;
  teamId: string;
  type: ContentType;
  title: string;
  body: string | null;
  coverUrl: string | null;
  coverLandscapeUrl: string | null;
  mediaUrls: string[];
  status: ContentStatus;
  publishedAt: string | null;
  tags: string[];
  location: string | null;
  visibility: ContentVisibility;
  scheduledAt: string | null;
  allowDownload: boolean;
  targets: ContentTargetItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ContentTargetInput {
  platformAccountId: string;
  overrides?: ContentTargetOverrides;
}

export interface CreateContentBody {
  type: ContentType;
  title: string;
  body?: string;
  coverUrl?: string;
  coverLandscapeUrl?: string;
  mediaUrls?: string[];
  status?: ContentStatus;
  tags?: string[];
  location?: string;
  visibility?: ContentVisibility;
  scheduledAt?: string;
  allowDownload?: boolean;
  targets?: ContentTargetInput[];
}

export type UpdateContentBody = Partial<Omit<CreateContentBody, 'type'>>;

export interface PublishCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expirationDate?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

export interface PublishDispatch {
  targetId: string;
  platform: string;
  accountId: string;
  mediaUrl: string;
  coverUrl: string;
  coverLandscapeUrl: string;
  title: string;
  body?: string;
  visibility: string;
  scheduledAt?: string;
  allowDownload: boolean;
  cookies: PublishCookie[];
  mediaExpiresAt: number;
  coverExpiresAt: number;
}

export interface PublishStartResult {
  content: ContentItem;
  dispatches: PublishDispatch[];
}

export interface MediaUploadInitResult {
  uploadId: string;
  chunkSize: number;
  chunkCount: number;
}

export interface MediaAssetResult {
  id: string;
  kind: 'video' | 'cover' | 'cover_landscape';
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  checksumSha256?: string;
}

export type MediaLibraryCategory = 'video' | 'image';

export interface MediaLibraryItem extends MediaAssetResult {
  category: MediaLibraryCategory;
  createdAt: string;
  updatedAt: string;
}

export interface MediaDuplicateHit {
  id: string;
  kind: 'video' | 'cover' | 'cover_landscape';
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  checksumSha256: string;
  createdAt: string;
}

export async function checkMediaDuplicate(body: {
  kind: 'video' | 'cover' | 'cover_landscape';
  checksumSha256: string;
}): Promise<{ duplicate: MediaDuplicateHit | null }> {
  return apiFetch<{ duplicate: MediaDuplicateHit | null }>(
    '/media/assets/check-duplicate',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export async function fetchMediaAssets(
  type?: 'all' | MediaLibraryCategory,
): Promise<MediaLibraryItem[]> {
  const query =
    type && type !== 'all' ? `?type=${encodeURIComponent(type)}` : '';
  return apiFetch<MediaLibraryItem[]>(`/media/assets${query}`);
}

export async function deleteMediaAsset(id: string): Promise<void> {
  await apiFetch(`/media/assets/${id}`, { method: 'DELETE' });
}

export async function fetchContents(params?: {
  type?: ContentType;
  q?: string;
}): Promise<ContentItem[]> {
  const search = new URLSearchParams();
  if (params?.type) {
    search.set('type', params.type);
  }
  const q = params?.q?.trim();
  if (q) {
    search.set('q', q);
  }
  const query = search.toString();
  return apiFetch<ContentItem[]>(`/contents${query ? `?${query}` : ''}`);
}

export async function fetchContent(id: string): Promise<ContentItem> {
  return apiFetch<ContentItem>(`/contents/${id}`);
}

export async function createContent(
  body: CreateContentBody,
): Promise<ContentItem> {
  return apiFetch<ContentItem>('/contents', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateContent(
  id: string,
  body: UpdateContentBody,
): Promise<ContentItem> {
  return apiFetch<ContentItem>(`/contents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteContent(id: string): Promise<void> {
  await apiFetch<void>(`/contents/${id}`, {
    method: 'DELETE',
  });
}

export async function publishContent(id: string): Promise<PublishStartResult> {
  return apiFetch<PublishStartResult>(`/contents/${id}/publish`, {
    method: 'POST',
  });
}

export async function startContentTarget(
  contentId: string,
  targetId: string,
): Promise<{ target: ContentTargetItem; dispatch: PublishDispatch }> {
  return apiFetch(`/contents/${contentId}/targets/${targetId}/start`, {
    method: 'POST',
  });
}

export async function completeContentTarget(
  contentId: string,
  targetId: string,
  body: {
    ok: boolean;
    errorCode?: string;
    errorMessage?: string;
    platformPostId?: string;
    platformUrl?: string;
  },
): Promise<ContentTargetItem> {
  return apiFetch(`/contents/${contentId}/targets/${targetId}/complete`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function cancelContentTarget(
  contentId: string,
  targetId: string,
): Promise<ContentTargetItem> {
  return apiFetch(`/contents/${contentId}/targets/${targetId}/cancel`, {
    method: 'POST',
  });
}

export async function retryContentTarget(
  contentId: string,
  targetId: string,
): Promise<{ target: ContentTargetItem; dispatch: PublishDispatch }> {
  return apiFetch(`/contents/${contentId}/targets/${targetId}/retry`, {
    method: 'POST',
  });
}

export async function initMediaUpload(body: {
  kind: 'video' | 'cover' | 'cover_landscape';
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  chunkSize?: number;
}): Promise<MediaUploadInitResult> {
  return apiFetch<MediaUploadInitResult>('/media/uploads', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function putMediaChunk(
  uploadId: string,
  index: number,
  chunk: Blob,
): Promise<{ received: number; chunkCount: number }> {
  const form = new FormData();
  form.append('chunk', chunk, `chunk-${index}`);
  return apiFetch(`/media/uploads/${uploadId}/chunks/${index}`, {
    method: 'PUT',
    body: form,
  });
}

export async function completeMediaUpload(
  uploadId: string,
): Promise<MediaAssetResult> {
  return apiFetch<MediaAssetResult>(`/media/uploads/${uploadId}/complete`, {
    method: 'POST',
  });
}

export async function fetchMediaSignedUrl(
  assetId: string,
): Promise<{ url: string; expiresAt: number }> {
  return apiFetch<{ url: string; expiresAt: number }>(
    `/media/assets/${assetId}/signed-url`,
    { method: 'POST' },
  );
}

/** 从 `/media/assets/{uuid}` 或裸 UUID 解析资产 ID */
export function parseMediaAssetId(ref: string | null | undefined): string | null {
  if (!ref?.trim()) {
    return null;
  }
  const trimmed = ref.trim();
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuid.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(
    /\/media\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/|$|\?)/i,
  );
  return match?.[1] ?? null;
}

/** 分片上传本地文件到团队库，返回资产（url 形如 /media/assets/{id}） */
export async function uploadMediaFile(
  file: File,
  kind: 'video' | 'cover' | 'cover_landscape',
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<MediaAssetResult> {
  const throwIfAborted = () => {
    if (signal?.aborted) {
      // 与 UI「取消上传」文案对齐，便于页面直接展示
      throw new DOMException('上传已取消', 'AbortError');
    }
  };
  throwIfAborted();
  const init = await initMediaUpload({
    kind,
    originalName: file.name,
    mimeType: file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
    sizeBytes: file.size,
  });
  for (let i = 0; i < init.chunkCount; i += 1) {
    throwIfAborted();
    const start = i * init.chunkSize;
    const end = Math.min(file.size, start + init.chunkSize);
    await putMediaChunk(init.uploadId, i, file.slice(start, end));
    onProgress?.((i + 1) / init.chunkCount);
  }
  throwIfAborted();
  return completeMediaUpload(init.uploadId);
}

export interface TeamMember {
  id: string;
  email: string;
  username: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface RoleItem {
  id: string;
  name: string;
  teamId: string;
  permissions: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TeamDetail {
  id: string;
  name: string;
  displayName: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export async function fetchTeamMembers(): Promise<TeamMember[]> {
  return apiFetch<TeamMember[]>('/identity/users');
}

export async function inviteTeamMember(body: {
  email: string;
  teamId: string;
  extraPermissions?: string[];
}): Promise<unknown> {
  return apiFetch('/account/invite', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function kickTeamMember(body: {
  userId: string;
  teamId: string;
}): Promise<void> {
  await apiFetch<void>('/account/kick', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function leaveTeam(teamId: string): Promise<void> {
  await apiFetch<void>('/account/leave', {
    method: 'POST',
    body: JSON.stringify({ teamId }),
  });
}

export async function fetchUserRoles(userId: string): Promise<RoleItem[]> {
  return apiFetch<RoleItem[]>(`/identity/users/${userId}/roles`);
}

export async function assignUserRole(
  userId: string,
  roleId: string,
): Promise<void> {
  await apiFetch<void>(`/identity/users/${userId}/roles`, {
    method: 'POST',
    body: JSON.stringify({ roleId }),
  });
}

export async function unassignUserRole(
  userId: string,
  roleId: string,
): Promise<void> {
  await apiFetch<void>(`/identity/users/${userId}/roles/${roleId}`, {
    method: 'DELETE',
  });
}

export async function fetchRoles(): Promise<RoleItem[]> {
  return apiFetch<RoleItem[]>('/identity/roles');
}

export async function createRole(body: {
  name: string;
  teamId: string;
  permissions?: string[];
}): Promise<RoleItem> {
  return apiFetch<RoleItem>('/identity/roles', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateRole(
  id: string,
  body: { name?: string; permissions?: string[] },
): Promise<RoleItem> {
  return apiFetch<RoleItem>(`/identity/roles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteRole(id: string): Promise<void> {
  await apiFetch<void>(`/identity/roles/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchPermissionCatalog(): Promise<string[]> {
  return apiFetch<string[]>('/identity/permissions');
}

export async function fetchTeam(id: string): Promise<TeamDetail> {
  return apiFetch<TeamDetail>(`/team-management/${id}`);
}

export async function updateTeam(
  id: string,
  body: { displayName?: string; name?: string; active?: boolean },
): Promise<TeamDetail> {
  return apiFetch<TeamDetail>(`/team-management/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}
