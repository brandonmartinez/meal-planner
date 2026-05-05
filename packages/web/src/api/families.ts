const API_BASE = '/api/families';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface FamilyMember {
  id: string;
  role: 'PARENT' | 'CHILD';
  familyId: string;
  userId: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

export interface Family {
  id: string;
  name: string;
  createdAt: string;
  members: FamilyMember[];
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  createdAt: string;
  lastUsed: string | null;
}

export interface ApiKeyCreated extends ApiKeyInfo {
  key: string;
}

export function createFamily(name: string) {
  return request<Family>(API_BASE, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function listFamilies() {
  return request<Family[]>(API_BASE);
}

export function getFamily(familyId: string) {
  return request<Family>(`${API_BASE}/${familyId}`);
}

export function getMembers(familyId: string) {
  return request<FamilyMember[]>(`${API_BASE}/${familyId}/members`);
}

export function generateInvite(familyId: string, role: 'PARENT' | 'CHILD') {
  return request<{ token: string }>(`${API_BASE}/${familyId}/invite`, {
    method: 'POST',
    body: JSON.stringify({ role }),
  });
}

export function joinFamily(familyId: string, token: string) {
  return request<FamilyMember>(`${API_BASE}/${familyId}/join`, {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function updateMemberRole(familyId: string, memberId: string, role: 'PARENT' | 'CHILD') {
  return request<FamilyMember>(`${API_BASE}/${familyId}/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export function removeMember(familyId: string, memberId: string) {
  return request<void>(`${API_BASE}/${familyId}/members/${memberId}`, {
    method: 'DELETE',
  });
}

export function createApiKey(familyId: string, name: string) {
  return request<ApiKeyCreated>(`${API_BASE}/${familyId}/api-keys`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function listApiKeys(familyId: string) {
  return request<ApiKeyInfo[]>(`${API_BASE}/${familyId}/api-keys`);
}

export function revokeApiKey(familyId: string, keyId: string) {
  return request<void>(`${API_BASE}/${familyId}/api-keys/${keyId}`, {
    method: 'DELETE',
  });
}
