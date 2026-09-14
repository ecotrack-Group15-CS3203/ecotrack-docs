---
sidebar_position: 2
title: Local Development
---

# Local Development

Reference for working on EcoTrack locally. For first-time setup, start with [Local Setup](../01-onboarding/local-setup.md).

---

## Service and port map

| Service | Runs as | Address |
|---|---|---|
| PostgreSQL 16 + PostGIS | `docker compose` in `ecotrack-api` (`postgres`) | `localhost:5434` |
| MinIO (S3-compatible) | `docker compose` in `ecotrack-api` (`minio`) | API `localhost:9000`, console `localhost:9001` (`ecotrack` / `ecotrack123`) |
| Bucket creation | `docker compose` in `ecotrack-api` (`minio-init`, exits after creating `ecotrack-media`) | |
| Mock JWKS / token minter (optional) | `pnpm mock:jwks` in `ecotrack-api` | `localhost:9999` |
| NestJS API | `pnpm start:dev` in `ecotrack-api` | `http://localhost:4000/v1`, Swagger at `/api/docs` |
| Next.js dashboard | `pnpm dev` in `ecotrack-web` | `http://localhost:3000` |
| Mobile app | `pnpm android` in `ecotrack-mobile` | Emulator or device |

`docker-compose.yml` lives in `ecotrack-api` and holds only the backing services. The API and dashboard run directly on your machine with hot reload.

---

## Environment files

| Repository | File | Template |
|---|---|---|
| `ecotrack-api` | `.env` | `.env.example` (works locally as-is, apart from the OIDC settings) |
| `ecotrack-web` | `.env.local` | `.env.local.example` |
| `ecotrack-mobile` | `.env` | `.env.example` |

What each Asgardeo and Mapbox value should be is covered in [External Services](./external-services.md). Production values are listed in [AWS Deployment → Environment files](./aws-deployment.md#step-7-environment-files).

Local defaults worth knowing in `ecotrack-api/.env`:

- `DB_SSL=disable`: the Docker Postgres has no certificate.
- `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE=true`, `S3_PUBLIC_URL` and the static S3 keys: needed for MinIO. Real S3 on EC2 uses none of them.
- `OIDC_ISSUER=` (empty): allowed outside production so the mock JWKS works.

---

## Common commands

All run from the repository named in the first column.

| Repo | Command | Purpose |
|---|---|---|
| api | `docker compose up -d` | Start Postgres and MinIO |
| api | `docker compose down` | Stop them, keeping data |
| api | `docker compose down -v` | Stop them and **delete** all data |
| api | `pnpm db:migrate` | Apply migrations. Also sets the `ecotrack_app` password from `DB_PASSWORD`. |
| api | `pnpm db:generate` | Generate a migration from schema changes (RLS policies are hand-written SQL) |
| api | `pnpm db:seed` | Demo organisation and incidents |
| api | `pnpm start:dev` | API with hot reload |
| api | `docker compose exec postgres psql -U ecotrack -d ecotrack` | psql shell as the owner role |
| web | `pnpm dev` | Dashboard with hot reload |
| mobile | `pnpm android` | Native Android build and run |
| mobile | `pnpm start` | Metro bundler for an already-installed build |

---

## Tests and checks

| Repo | Command | Needs |
|---|---|---|
| api | `pnpm test` | Nothing |
| api | `pnpm test:integration` | Postgres running and migrated |
| api | `pnpm exec eslint "{src,test}/**/*.ts"` and `pnpm exec tsc --noEmit` | Nothing |
| web | `pnpm test`, `pnpm exec eslint .`, `pnpm exec tsc --noEmit`, `CI=true pnpm build` | Nothing |
| mobile | `pnpm test`, `pnpm exec tsc --noEmit` | Nothing |

CI runs the same checks. See [CI/CD Pipeline](./ci-cd.md).

---

## Production images locally

Both `ecotrack-api` and `ecotrack-web` contain the production `Dockerfile` used in [AWS Deployment](./aws-deployment.md). To try the API image against the local services:

```bash
cd ecotrack-api
docker build -t ecotrack-api:local .
docker run --rm -p 127.0.0.1:4100:4000 --env-file .env \
  --add-host=host.docker.internal:host-gateway \
  -e DB_HOST=host.docker.internal -e S3_ENDPOINT=http://host.docker.internal:9000 \
  ecotrack-api:local
curl http://127.0.0.1:4100/v1/health
```

---

## Verifying PostGIS

```bash
docker compose exec postgres psql -U ecotrack -d ecotrack -c "SELECT PostGIS_Full_Version();"
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:5434` | Backing services not running | `docker compose up -d` in `ecotrack-api` |
| `password authentication failed for user "ecotrack_app"` | Migrations not run, or `DB_PASSWORD` changed since | `pnpm db:migrate` |
| API won't start: `"S3_ACCESS_KEY_ID" is not allowed to be empty` or `... without its required peers` | An empty or half-set S3 key | Set both keys (MinIO) or remove both lines |
| Every API call returns `401` | Token from a different issuer than `OIDC_JWKS_URI`/`OIDC_ISSUER` (mock vs real tenant) | Point the API at the issuer the client signs in with |
| Photos don't load or uploads fail on a physical phone | Presigned URLs point at `localhost:9000` | `S3_ENDPOINT=http://<LAN IP>:9000` in `ecotrack-api/.env`, then restart the API |
| Photos don't load when opening a stored URL directly | Expected: the bucket is private, and only the presigned URLs the API returns work | Use the URL from the API response |
| Web build fails with `Module not found` for `react-i18next` | Corrupted `node_modules` after an in-place `pnpm add` | `rm -rf node_modules && pnpm install` |
| Port `5434` or `9000` already in use | Another Postgres or MinIO on the host | Stop it, or change the host port in `docker-compose.yml` and `.env` |
