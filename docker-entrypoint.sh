#!/bin/sh
set -e

# Apply any pending Prisma migrations before starting the API.
#
# In production (k8s), migrations are owned by the dedicated
# `meal-planner-migrate` Job and app pods set SKIP_MIGRATIONS=1, so replicas
# never run migrations on startup (issue #26). This default-on path remains for
# single-instance use (e.g. `docker run` / compose) and local debugging.
# Skipped when SKIP_MIGRATIONS=1.
if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  echo "Running prisma migrate deploy..."
  npx prisma migrate deploy --schema ./prisma/schema.prisma
else
  echo "SKIP_MIGRATIONS=1 set; skipping prisma migrate deploy."
fi

exec "$@"
