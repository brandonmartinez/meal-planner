# Session Log — Prod image-upload 500 + MCP image-upload feature

- **Timestamp:** 2026-07-05T21:05:00Z
- **Logged by:** Scribe
- **Requester:** brandonmartinez

## What happened

### Feature shipped — #180 / PR #183 (Livingston)

Livingston implemented MCP/agent binary image upload for meals. New `meal:image` scope,
agent route accepting base64 bytes + declared `contentType` (validated server-side via
magic-byte sniffing), MCP `apiClient` + `upload_meal_image` tool, shared constants update,
and a `FamilySettingsPage` scope toggle in the web app. PR #183 squash-merged, issues
#180 closed.

Folded into PR #183: added `console.error(...)` to three previously-silent catch blocks in
`packages/api/src/routes/images.ts` (upload/fetch/delete). These were masking the prod 500
as a generic error with no server-side trace.

### Prod incident — #181 (Basher → wrong-repo pivot)

User hit HTTP 500 uploading a ~311 KB JPEG via the web UI at meals.themartinez.cloud.
Root cause: no `IMAGE_STORAGE_ROOT` env, no durable volume, `node` user could not write to
root-owned `/app/.data/images/` (EACCES). Logging-free catch blocks hid the real error.

Basher initially fixed `k8s/` in this repo (PR #182: single-replica RWO PVC + fsGroup:1000
+ IMAGE_STORAGE_ROOT env). **This was the wrong target.** Production deploys via
`raspberry-pi-kubernetes-cluster` (ArgoCD); meal-planner's `k8s/` folder never reaches
prod. PR #182 was CLOSED and the branch deleted.

### Correct fix — raspberry-pi-kubernetes-cluster issue #104 (in-flight)

The real fix is filed as issue #104 in the cluster repo, owned by Dallas (GitOps engineer).
Approach: Longhorn ReadWriteMany PVC (shared across HPA replicas 2–3) + `IMAGE_STORAGE_ROOT`
+ `fsGroup:1000`. Using RWO would have required dropping to 1 replica, breaking the HPA.

## Decisions recorded

- "Production deploys via `raspberry-pi-kubernetes-cluster`, NOT meal-planner's `k8s/`."
- "Durable image storage uses Longhorn RWX PVC + `IMAGE_STORAGE_ROOT=/data/images` +
  `fsGroup:1000` — never single-replica RWO."

## Agents involved

- **Livingston** — delivered #180/#183 feature + diagnostic logging fix
- **Basher** — investigated #181, authored wrong-repo PR #182 (closed), documented root cause
