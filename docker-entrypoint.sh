#!/bin/sh
set -e

# Apply any pending Prisma migrations before starting the API.
# Skipped when SKIP_MIGRATIONS=1 (useful for sidecars or debugging).
if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  echo "Running prisma migrate deploy..."
  npx prisma migrate deploy --schema ./prisma/schema.prisma
else
  echo "SKIP_MIGRATIONS=1 set; skipping prisma migrate deploy."
fi

exec "$@"
