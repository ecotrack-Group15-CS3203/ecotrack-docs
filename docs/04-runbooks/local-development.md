---
sidebar_position: 2
title: Local Development
---

# Local Development

This runbook covers running the full EcoTrack stack locally using Docker Compose for the database layer, with hot-reload development servers for the API and web dashboard.

---

## Service Port Map

| Service | Container / Process | Local Port |
|---|---|---|
| PostgreSQL + PostGIS | Docker (`postgres`) | `5432` |
| NestJS API | Docker (`api`) or `pnpm dev` | `3001` |
| Next.js Web Dashboard | Docker (`web`) or `pnpm dev` | `3000` |
| Nginx (production only) | Docker (`nginx`) | `80` / `443` |

---

## Docker Compose Configuration

The root `docker-compose.yml` defines three services. The `api` and `web` services wait for a healthy `postgres` container before starting.

```yaml
services:
  postgres:
    image: postgis/postgis:15-3.3
    environment:
      POSTGRES_DB: ecotrack_db
      POSTGRES_USER: ecotrack
      POSTGRES_PASSWORD: ecotrack
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ecotrack -d ecotrack_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build:
      context: ./api
      target: development
    ports:
      - "3001:3001"
    env_file: ./api/.env
    volumes:
      - ./api/src:/app/src  # mount source for hot reload
    depends_on:
      postgres:
        condition: service_healthy

  web:
    build:
      context: ./web
      target: development
    ports:
      - "3000:3000"
    env_file: ./web/.env
    depends_on:
      - api

volumes:
  postgres_data:
```

---

## Setup Steps

### 1. Clone and Configure

```bash
# Clone all three repos into a shared parent directory
mkdir ecotrack && cd ecotrack
git clone https://github.com/ecotrack/api.git
git clone https://github.com/ecotrack/web.git
git clone https://github.com/ecotrack/mobile.git

# Copy example env files
cp api/.env.example api/.env
cp web/.env.example web/.env
```

Edit `api/.env` and `web/.env` with your local values. At minimum, set the WSO2 Asgardeo credentials and Mapbox token. The database URL and ports are pre-filled to match the Docker Compose defaults.

### 2. Start Services

```bash
# From the ecotrack/ parent directory (where docker-compose.yml lives)
docker compose up --build
```

On first run, Docker pulls `postgis/postgis:15-3.3` (~400 MB) and builds the API and web images. Subsequent starts are faster.

To start only the database (useful when running API/web natively):

```bash
docker compose up postgres -d
```

### 3. Run Database Migrations

Once the `postgres` health check passes, apply the Drizzle ORM migrations to create all tables and RLS policies:

```bash
docker compose exec api pnpm drizzle-kit migrate
```

Verify the schema was applied:

```bash
docker compose exec postgres psql -U ecotrack -d ecotrack_db -c "\dt"
```

### 4. Seed Development Data

Populate the database with a sample tenant, admin, volunteers, and incidents:

```bash
docker compose exec api pnpm seed
```

This creates the following dev fixtures:

| Entity | Details |
|---|---|
| Organization | `Bolgoda Lake Conservation Society` (slug: `bolgoda-lake`) |
| Admin user | `admin@bolgoda.local` / password set via Asgardeo dev tenant |
| Volunteers | 3 test volunteer accounts |
| Incidents | 5 geo-tagged incidents around Bolgoda Lake (lat ~6.82, lng ~80.03) |
| Workflow stages | Default 4-stage flow: Reported → Verified → Cleanup Scheduled → Resolved |

---

## Running Without Docker (Hot Reload)

For faster iteration cycles, run the API and web processes natively with file-watching, while keeping only the database in Docker:

```bash
# Terminal 1 — database only
docker compose up postgres -d

# Terminal 2 — NestJS API (hot reload via ts-node-dev)
cd api && pnpm install && pnpm dev

# Terminal 3 — Next.js web dashboard (hot reload via Next.js dev server)
cd web && pnpm install && pnpm dev
```

The API connects to `localhost:5432` using the `DATABASE_URL` in `api/.env`.

---

## Useful Commands

| Command | Description |
|---|---|
| `docker compose up --build -d` | Start all services in detached mode |
| `docker compose down` | Stop all services, preserve data volumes |
| `docker compose down -v` | Stop all services and **destroy** all data volumes |
| `docker compose logs -f api` | Tail API container logs |
| `docker compose exec api pnpm drizzle-kit generate` | Generate a new migration from schema changes |
| `docker compose exec api pnpm drizzle-kit migrate` | Apply pending migrations |
| `docker compose exec api pnpm test` | Run Jest unit tests inside the container |
| `docker compose exec postgres psql -U ecotrack -d ecotrack_db` | Open a psql shell |

---

## Verifying PostGIS

Confirm the PostGIS extension is active after running migrations:

```sql
SELECT PostGIS_Full_Version();
-- Expected: POSTGIS="3.3.x" [EXTENSION] PGSQL="150" ...
```

---

## Common Issues

| Symptom | Likely Cause | Fix |
|---|---|---|
| `FATAL: role "ecotrack" does not exist` | Volume initialized before user was created | `docker compose down -v && docker compose up --build` |
| API starts before DB is ready | Missing `depends_on` health check | Confirm the `depends_on.postgres.condition: service_healthy` block is present in `docker-compose.yml` |
| `PostGIS extension not found` | Using plain `postgres` image instead of `postgis/postgis` | Confirm the `image:` field in the compose file is `postgis/postgis:15-3.3` |
| Port `5432` already in use | Local PostgreSQL instance running on the host | Stop the host instance: `sudo systemctl stop postgresql` |
| Next.js shows `ECONNREFUSED` on API calls | `NEXT_PUBLIC_API_URL` points to wrong port | Check `web/.env` — it must match the API container's published port (`3001`) |
| Drizzle migration fails | `DATABASE_URL` not set or wrong | Verify `api/.env` and that the `postgres` container is healthy: `docker compose ps` |
