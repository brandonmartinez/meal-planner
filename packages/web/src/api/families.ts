import type {
  FamilyDTO,
  FamilyMemberDTO,
  ApiKeyListItemDTO,
  CreatedApiKeyDTO,
  AgentCredentialListItemDTO,
  CreatedAgentCredentialDTO,
  RevokedAgentCredentialDTO,
  AgentScope,
} from '@meal-planner/shared';
import { request } from './client';

// Re-export the shared DTOs so pages can keep importing family/api-key types
// from this resource module. These are the single source of truth in
// `@meal-planner/shared` — no local duplication.
export type {
  FamilyDTO,
  FamilyMemberDTO,
  ApiKeyListItemDTO,
  CreatedApiKeyDTO,
  AgentCredentialListItemDTO,
  CreatedAgentCredentialDTO,
  RevokedAgentCredentialDTO,
  AgentScope,
} from '@meal-planner/shared';

const API_BASE = '/api/families';

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

// --- Scoped MCP agent credentials (issue #6) ------------------------------
// Parent-facing management of least-privilege agent credentials. Mirrors the
// API-key client shape, but each credential carries explicit `scopes[]` and an
// optional `expiresAt`. The raw key is returned ONCE on create and on rotate;
// the list endpoint returns metadata only and never a key.

/** List a family's agent credentials (metadata only — never a raw key). */
export function listAgentCredentials(familyId: string) {
  return request<AgentCredentialListItemDTO[]>(
    `${API_BASE}/${familyId}/agent-credentials`,
  );
}

/** Create a scoped agent credential. The response carries the raw `key`
 *  exactly once. `expiresAt`, when provided, is an ISO date string in the
 *  future. */
export function createAgentCredential(
  familyId: string,
  data: { name: string; scopes: AgentScope[]; expiresAt?: string | null },
) {
  return request<CreatedAgentCredentialDTO>(
    `${API_BASE}/${familyId}/agent-credentials`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

/** Rotate a credential — issues a brand-new raw `key` (returned once) and
 *  invalidates the old one. */
export function rotateAgentCredential(familyId: string, credentialId: string) {
  return request<CreatedAgentCredentialDTO>(
    `${API_BASE}/${familyId}/agent-credentials/${credentialId}/rotate`,
    { method: 'POST' },
  );
}

/** Soft-revoke a credential (stamps `revokedAt`). Idempotent. */
export function revokeAgentCredential(familyId: string, credentialId: string) {
  return request<RevokedAgentCredentialDTO>(
    `${API_BASE}/${familyId}/agent-credentials/${credentialId}`,
    { method: 'DELETE' },
  );
}
