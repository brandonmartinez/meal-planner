import type {
  FamilyDTO,
  FamilyMemberDTO,
  ApiKeyListItemDTO,
  CreatedApiKeyDTO,
} from '@meal-planner/shared';

// Re-export the shared DTOs so pages can keep importing family/api-key types
// from this resource module. These are the single source of truth in
// `@meal-planner/shared` — no local duplication.
export type {
  FamilyDTO,
  FamilyMemberDTO,
  ApiKeyListItemDTO,
  CreatedApiKeyDTO,
} from '@meal-planner/shared';

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

export function createFamily(name: string) {
  return request<FamilyDTO>(API_BASE, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function listFamilies() {
  return request<FamilyDTO[]>(API_BASE);
}

export function getFamily(familyId: string) {
  return request<FamilyDTO>(`${API_BASE}/${familyId}`);
}

export function getMembers(familyId: string) {
  return request<FamilyMemberDTO[]>(`${API_BASE}/${familyId}/members`);
}

export function generateInvite(familyId: string, role: 'PARENT' | 'CHILD') {
  return request<{ token: string }>(`${API_BASE}/${familyId}/invite`, {
    method: 'POST',
    body: JSON.stringify({ role }),
  });
}

export function joinFamily(familyId: string, token: string) {
  return request<FamilyMemberDTO>(`${API_BASE}/${familyId}/join`, {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function updateMemberRole(familyId: string, memberId: string, role: 'PARENT' | 'CHILD') {
  return request<FamilyMemberDTO>(`${API_BASE}/${familyId}/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export function updateFamily(
  familyId: string,
  data: { name?: string; timezone?: string },
) {
  return request<FamilyDTO>(`${API_BASE}/${familyId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function removeMember(familyId: string, memberId: string) {
  return request<void>(`${API_BASE}/${familyId}/members/${memberId}`, {
    method: 'DELETE',
  });
}

export function createApiKey(familyId: string, name: string) {
  return request<CreatedApiKeyDTO>(`${API_BASE}/${familyId}/api-keys`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function listApiKeys(familyId: string) {
  return request<ApiKeyListItemDTO[]>(`${API_BASE}/${familyId}/api-keys`);
}

export function revokeApiKey(familyId: string, keyId: string) {
  return request<void>(`${API_BASE}/${familyId}/api-keys/${keyId}`, {
    method: 'DELETE',
  });
}
