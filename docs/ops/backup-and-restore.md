# Backup, restore & image-volume consistency

Operational guidance for backing up and restoring Meal Planner **without
breaking recipe images**. This covers the uploaded-image asset backend shipped
in #104, the orphan-cleanup command from #106, and the future object-storage
migration path.

> **The one thing to remember:** the PostgreSQL database and the image volume are
> a **matched pair**. An `ImageAsset` row in the database points at a file on the
> image volume (`{root}/{familyId}/{assetId}.{ext}`). Back up one without the
> other and you get **broken recipe images** on restore — a DB that references
> files the volume doesn't have, or files the DB no longer knows about. Always
> capture and restore them **together, as of the same point in time**.

## How images are stored (recap of #104)

- Each uploaded image is an `ImageAsset` row **and** a file on disk.
- The file lives at `{IMAGE_STORAGE_ROOT}/{familyId}/{assetId}.{ext}` — see
  [`packages/api/src/services/imageStorage.ts`](../../packages/api/src/services/imageStorage.ts).
- `IMAGE_STORAGE_ROOT` defaults to a local path in dev
  ([`config/index.ts`](../../packages/api/src/config/index.ts)); in production it
  must point at a **durable volume** (see the prerequisite below).
- The DB row is the source of truth for *what should exist*; the file is the
  bytes. Drift between the two is what the cleanup command reconciles.

## Durable-volume prerequisite (⚠️ read first)

**A durable image volume is not yet wired into the k8s manifests.** The
[`k8s/deployment.yaml`](../../k8s/deployment.yaml) container today sets **no**
`IMAGE_STORAGE_ROOT` and mounts **no** volume, so uploaded images land on the
pod's ephemeral filesystem and are **lost on every restart or reschedule**.
Wiring the production volume is the deferred scope of **#93**; until it lands,
backup of images is moot because there is no durable volume to back up.

When #93 wires the volume, it should look roughly like the following (shown here
as **guidance only** — do not apply this as an active kustomization change under
this issue):

```yaml
# --- PersistentVolumeClaim (new file, e.g. k8s/image-pvc.yaml) ---
# apiVersion: v1
# kind: PersistentVolumeClaim
# metadata:
#   name: meal-planner-images
# spec:
#   accessModes: ["ReadWriteOnce"]   # RWX if >1 replica must share the volume
#   resources:
#     requests:
#       storage: 5Gi
#
# --- deployment.yaml additions ---
# spec.template.spec.containers[0].env:
#   - name: IMAGE_STORAGE_ROOT
#     value: "/data/images"
# spec.template.spec.containers[0].volumeMounts:
#   - name: images
#     mountPath: /data/images
# spec.template.spec.volumes:
#   - name: images
#     persistentVolumeClaim:
#       claimName: meal-planner-images
```

> **Replica note:** `deployment.yaml` runs `replicas: 2`. A `ReadWriteOnce` PVC
> binds to a single node, so either pin the app to one node, use a `ReadWriteMany`
> volume, or (preferred long-term) move to object storage (below) so replicas
> share the same backing store.

## Backing up

Capture both halves as close in time as possible. Briefly quiescing uploads (or
snapshotting the volume first, then dumping the DB) minimises the window where a
new upload lands in one but not the other; the #106 cleanup command reconciles
any residual drift safely.

### 1. Database

```bash
# From a host with access to the DB (adjust connection to your environment).
pg_dump "$DATABASE_URL" --format=custom --file="mealplanner-$(date +%F).dump"
```

### 2. Image volume

Snapshot or copy the **entire** `IMAGE_STORAGE_ROOT` tree, preserving the
`{familyId}/{assetId}.{ext}` layout:

```bash
# Example: rsync the mounted volume to a backup target.
rsync -a --delete "$IMAGE_STORAGE_ROOT/" "backup-target:/mealplanner-images/$(date +%F)/"
```

If the volume is a cloud disk or a CSI-backed PVC, prefer a **volume snapshot**
(atomic, point-in-time) over a file copy. Snapshot the DB and the volume as a
labelled pair so a restore always uses matching halves.

## Restoring

Restore the **matched pair** — a DB dump and the image backup taken at the same
point in time. Order does not strictly matter, but restore the volume **before**
bringing the app up so the first requests find their files.

```bash
# 1. Restore the image volume first.
rsync -a --delete "backup-target:/mealplanner-images/2026-07-02/" "$IMAGE_STORAGE_ROOT/"

# 2. Restore the database.
pg_restore --clean --if-exists --dbname "$DATABASE_URL" mealplanner-2026-07-02.dump

# 3. Bring the app up, then reconcile any drift (see below).
```

### Verify consistency after restore

Run the cleanup command in its **default dry-run** mode to report drift without
changing anything:

```bash
pnpm --filter @meal-planner/api run images:cleanup
```

- **`missingFiles` (rows without files)** → the image backup was older than the
  DB, or incomplete. Restore a newer/complete image backup; do **not** delete
  rows to "fix" broken images.
- **`orphanedFiles` (files without rows)** → the DB was older than the image
  backup. Usually harmless residue; clean it up once you've confirmed the DB is
  the intended one (see below).

## Orphan cleanup command (#106)

The cleanup command reconciles drift between the DB and the volume. It is
**dry-run by default** and every deletion is routed through the audited
[`imageStorage`](../../packages/api/src/services/imageStorage.ts) layer, which
re-validates ids/extension and asserts the path stays under the storage root —
so it can never delete outside `IMAGE_STORAGE_ROOT`.

Implementation:
[`packages/api/src/services/imageCleanup.ts`](../../packages/api/src/services/imageCleanup.ts)
(logic) and
[`packages/api/src/scripts/imageCleanup.ts`](../../packages/api/src/scripts/imageCleanup.ts)
(CLI).

```bash
# Dry run (DEFAULT): report orphaned files, missing files, and stray entries.
pnpm --filter @meal-planner/api run images:cleanup

# JSON output (for scripting / cron reporting).
pnpm --filter @meal-planner/api run images:cleanup -- --json

# Apply: DELETE orphaned files (files with no ImageAsset row).
pnpm --filter @meal-planner/api run images:cleanup -- --apply

# Also delete dangling ROWS (ImageAsset rows whose file is gone). Opt-in, and
# only takes effect together with --apply. Use with care — a missing file is
# usually a restore problem, not a reason to drop the row.
pnpm --filter @meal-planner/api run images:cleanup -- --apply --delete-rows
```

In production (compiled build) run the same script via the built output:

```bash
node dist/scripts/imageCleanup.js            # dry run
node dist/scripts/imageCleanup.js --apply    # apply file deletions
```

### What each category means

| Category | Meaning | Default action |
| --- | --- | --- |
| `orphanedFiles` | File on disk, **no** matching `ImageAsset` row | Deleted only with `--apply` |
| `missingFiles` | Live `ImageAsset` row, **no** file on disk (broken image) | Reported; row deleted only with `--apply --delete-rows` |
| `unrecognized` | Entry that isn't a valid `{uuid}/{uuid}.{ext}` file | **Never deleted** — reported for human review |

**Safety contract:** a file is a deletion candidate **only** if its `assetId` is
provably absent from the live-id set loaded from the database. A file whose id
matches any row is never selected — a referenced image cannot be deleted.
Scanning is read-only; dry-run is the default; `unrecognized` entries are never
auto-removed.

### Suggested cadence

Run the dry-run on a schedule (e.g. weekly cron) and alert on non-empty
`orphanedFiles`/`missingFiles`. Apply deletions manually after reviewing the
report — this is an ops chore, not an automated destructive job.

## Future: object-storage migration path

`ImageStorage` is a pluggable interface
([`imageStorage.ts`](../../packages/api/src/services/imageStorage.ts)), so moving
from the filesystem to object storage (S3/R2/GCS/MinIO) is an additive backend
swap, not a schema change. Outline:

1. **Add an `ObjectStorageImageStorage`** implementing the same
   `put/get/delete/exists` contract, keyed by the same `{familyId}/{assetId}.{ext}`
   object key. The DB schema is unchanged — rows still hold `familyId`/`assetId`/
   `extension`.
2. **Dual-write + backfill:** write new uploads to both backends, backfill
   existing files by copying the volume into the bucket (the key layout is
   identical), then flip reads to the bucket and retire the filesystem backend.
3. **Backup shifts to the bucket:** enable **bucket versioning** and
   **cross-region replication** instead of volume snapshots. The DB↔storage
   consistency rule is unchanged — a DB dump must still pair with a bucket
   backup/version as of the same point in time.
4. **Cleanup command carries over:** the same orphan/missing reconciliation
   applies against object listings; only the storage backend implementation
   changes, not the cleanup logic.

Object storage also removes the single-node PVC constraint, letting all replicas
share one backing store — the preferred long-term answer to the replica note
above.
