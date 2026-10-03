#!/usr/bin/env bash
# Runs the Bolgoda Lake scenario on a fresh, throwaway PostGIS database so the
# platform-wide numbers (public stats, audit totals) contain only this campaign.
# Needs: Docker, MinIO from ecotrack-api/docker-compose.yml on :9000, and an
# ecotrack-api checkout with dependencies installed (set API_DIR if it is not
# cloned next to this repo). Leaves the API (:4100) and mock JWKS (:9999) running.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
API_DIR="${API_DIR:-$HERE/../../../ecotrack-api}"  # default: ecotrack-api cloned next to this repo
LOGS="${LOGS:-/tmp/ecotrack-case-study}"
mkdir -p "$LOGS"

pid() { ss -ltnp 2>/dev/null | grep ":$1 " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }
[ -n "$(pid 4100)" ] && kill "$(pid 4100)" && sleep 2
[ -z "$(pid 9999)" ] && (cd "$API_DIR" && setsid nohup node tools/mock-jwks.js > "$LOGS/jwks.log" 2>&1 < /dev/null &)

docker rm -f ecotrack-casestudy-db >/dev/null 2>&1 || true
docker run -d --name ecotrack-casestudy-db -e POSTGRES_USER=ecotrack -e POSTGRES_PASSWORD=ecotrack \
  -e POSTGRES_DB=ecotrack -p 5435:5432 postgis/postgis:16-3.4 >/dev/null
until docker exec ecotrack-casestudy-db pg_isready -U ecotrack >/dev/null 2>&1; do sleep 2; done
sleep 4

export DB_PORT=5435 DB_PASSWORD=ecotrack_app DB_MIGRATOR_PASSWORD=ecotrack
(cd "$API_DIR" && pnpm -s db:migrate)
(cd "$API_DIR" && OIDC_JWKS_URI=http://localhost:9999/jwks OIDC_ISSUER=http://localhost:9999 PORT=4100 \
  setsid nohup pnpm -s start > "$LOGS/api.log" 2>&1 < /dev/null &)
until curl -sf localhost:4100/v1/health >/dev/null; do sleep 2; done

node "$HERE/run-scenario.js"
