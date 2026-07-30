---
sidebar_position: 4
title: Local Setup
---

# Local Setup

This guide walks you through running the full EcoTrack stack locally using Docker Compose.

## Prerequisites

Ensure the following tools are installed before proceeding:

| Tool | Version | Purpose |
|---|---|---|
| [Node.js](https://nodejs.org/) | 20 LTS or later | Running Next.js web dashboard and NestJS API outside Docker |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Latest stable | Running all services via Docker Compose |
| [pnpm](https://pnpm.io/) | 9+ | Package manager (used across the monorepo) |
| [Git](https://git-scm.com/) | Any recent | Cloning repositories |

## 1. Clone the Repositories

EcoTrack consists of three separate codebases. Clone them into a shared parent directory:

```bash
mkdir ecotrack && cd ecotrack

git clone https://github.com/ecotrack/api.git          # NestJS backend
git clone https://github.com/ecotrack/web.git          # Next.js web dashboard
git clone https://github.com/ecotrack/mobile.git       # React Native mobile app
```

## 2. Configure Environment Variables

Each service requires a `.env` file. Copy the provided example files and fill in the values:

```bash
cp api/.env.example api/.env
cp web/.env.example web/.env
```

### Backend API — `api/.env`

```dotenv
# ── Database ────────────────────────────────────────────────
DATABASE_URL=postgresql://ecotrack:ecotrack@localhost:5432/ecotrack_db

# ── WSO2 Asgardeo (Identity & Auth) ─────────────────────────
ASGARDEO_ORG_NAME=your-org-name
ASGARDEO_CLIENT_ID=your-client-id
ASGARDEO_CLIENT_SECRET=your-client-secret
ASGARDEO_BASE_URL=https://api.asgardeo.io/t/${ASGARDEO_ORG_NAME}

# ── AWS (S3 object storage for incident media) ───────────────
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_S3_BUCKET=ecotrack-incident-media

# ── Firebase (push notifications) ───────────────────────────
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# ── App ──────────────────────────────────────────────────────
NODE_ENV=development
PORT=3001
```

### Web Dashboard — `web/.env`

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-public-token
NEXT_PUBLIC_ASGARDEO_CLIENT_ID=your-client-id
NEXT_PUBLIC_ASGARDEO_ORG_NAME=your-org-name
```

:::tip Local Development Shortcuts
For local development, you can skip the real AWS S3 and Firebase setup by using [LocalStack](https://localstack.cloud/) for S3 emulation and the Firebase Emulator Suite for push notifications.
:::

## 3. Start the Services with Docker Compose

A `docker-compose.yml` at the monorepo root defines the following services:

| Service | Image | Port | Description |
|---|---|---|---|
| `postgres` | `postgis/postgis:15-3.3` | `5432` | PostgreSQL 15 with PostGIS 3 extension |
| `api` | Local build (`api/Dockerfile`) | `3001` | NestJS REST API |
| `web` | Local build (`web/Dockerfile`) | `3000` | Next.js web dashboard |

Start all services:

```bash
docker compose up --build
```

To run in detached mode (background):

```bash
docker compose up --build -d
```

## 4. Run Database Migrations

Once the `postgres` and `api` containers are healthy, run the Drizzle ORM migrations to initialize the schema:

```bash
docker compose exec api pnpm drizzle-kit migrate
```

This applies all pending migrations, creates the multi-tenant tables, and sets up the PostgreSQL RLS policies.

## 5. Verify the Stack

| Service | URL | Expected Response |
|---|---|---|
| NestJS API | `http://localhost:3001/health` | `{"status":"ok"}` |
| Next.js Web | `http://localhost:3000` | Admin login page |
| PostgreSQL | `localhost:5432` | Connect with any psql client |

Use a database client (e.g., [TablePlus](https://tableplus.com/) or `psql`) to verify PostGIS is enabled:

```sql
SELECT PostGIS_Version();
```

## 6. Seed Development Data (Optional)

To seed the database with a sample tenant, admin user, and test incidents:

```bash
docker compose exec api pnpm seed
```

This creates:
- 1 tenant organization (`Bolgoda Lake Conservation Society`)
- 1 admin account (`admin@bolgoda.local` / `password: admin123`)
- 5 sample incidents with geo-coordinates around Bolgoda Lake, Sri Lanka

## Common Issues

| Symptom | Likely Cause | Fix |
|---|---|---|
| `FATAL: role "ecotrack" does not exist` | Container started before volume was initialized | `docker compose down -v` then `docker compose up --build` |
| `PostGIS extension not found` | Using plain PostgreSQL image instead of PostGIS image | Confirm the `postgres` service uses `postgis/postgis:15-3.3` |
| `ECONNREFUSED 127.0.0.1:5432` | API started before the database was ready | Add `depends_on: postgres: condition: service_healthy` in `docker-compose.yml` |
| Next.js shows blank API responses | `NEXT_PUBLIC_API_URL` points to wrong port | Check `web/.env` matches the API container port |
| Drizzle migration fails | `DATABASE_URL` not set or wrong | Verify `api/.env` and that the `postgres` container is running |
