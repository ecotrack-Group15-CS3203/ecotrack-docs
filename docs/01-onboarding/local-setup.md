---
sidebar_position: 4
title: Local Setup
---

# Local Setup

Get the API, web dashboard and mobile app running on your machine. For the full reference (ports, commands, tests, troubleshooting) see [Local Development](../04-runbooks/local-development.md).

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| [Node.js](https://nodejs.org/) | 22 | All three apps |
| [pnpm](https://pnpm.io/) | 11 | All three apps |
| [Docker](https://docs.docker.com/get-docker/) | Recent, with Compose | Local Postgres + PostGIS and MinIO (S3) |
| [Android Studio](https://developer.android.com/studio) | Recent | Building and running the mobile app |
| A WSO2 Asgardeo organization | | Signing in to the dashboard and the app. See [External Services](../04-runbooks/external-services.md#wso2-asgardeo). |
| A Mapbox account | | Maps. See [External Services](../04-runbooks/external-services.md#mapbox). |

## 1. Clone the repositories

EcoTrack is split across separate repositories. Clone them side by side:

```
ecotrack/
├── ecotrack-api      NestJS API
├── ecotrack-web      Next.js dashboard
├── ecotrack-mobile   Expo / React Native app
└── echotrack-docs    This documentation
```

## 2. API

```bash
cd ecotrack-api
cp .env.example .env
pnpm install
docker compose up -d          # Postgres (host port 5434) + MinIO (9000, console 9001)
pnpm db:migrate               # schema, RLS policies, the ecotrack_app role
pnpm start:dev                # http://localhost:4000/v1
```

`.env.example` works as-is for Postgres and MinIO. Choose how tokens are validated:

- **Real Asgardeo** (needed to use the dashboard or the app): set `OIDC_JWKS_URI` and `OIDC_ISSUER` to your tenant, as described in [External Services → API settings](../04-runbooks/external-services.md#4-api-settings).
- **Mock tokens** (API only, for curl or Swagger): keep the defaults and run `pnpm mock:jwks`. Mint a token with
  `curl "http://localhost:9999/token?sub=demo-user&email=demo@example.dev&name=Demo+User"`.

Optional demo data: `pnpm db:seed`.

Check it: `curl http://localhost:4000/v1/health` should return `"database":"up"`. Swagger UI is at `http://localhost:4000/api/docs`.

## 3. Web dashboard

```bash
cd ecotrack-web
cp .env.local.example .env.local   # fill in the ASGARDEO_* values and NEXT_PUBLIC_MAPBOX_TOKEN
pnpm install
pnpm dev                           # http://localhost:3000
```

`API_URL` already points at the local API. The Asgardeo web application must list `http://localhost:3000/api/auth/callback` and `http://localhost:3000` as authorized redirect URLs.

## 4. Mobile app

```bash
cd ecotrack-mobile
cp .env.example .env
pnpm install
pnpm android                       # native build on an emulator or a USB-connected device
```

In `.env`, set:

- `EXPO_PUBLIC_API_BASE_URL`: `http://10.0.2.2:4000` for the Android emulator, or `http://<your LAN IP>:4000` for a physical phone.
- `EXPO_PUBLIC_ASGARDEO_ISSUER` and `EXPO_PUBLIC_ASGARDEO_MOBILE_CLIENT_ID` from your Asgardeo mobile application.
- `EXPO_PUBLIC_MAPBOX_TOKEN`.

On a physical phone, photo uploads and photo URLs point at MinIO through the API's `S3_ENDPOINT`. Set `S3_ENDPOINT=http://<your LAN IP>:9000` in `ecotrack-api/.env` so the phone can reach it.

## Next steps

- [Local Development](../04-runbooks/local-development.md): commands, tests, resetting data, troubleshooting
- [External Services](../04-runbooks/external-services.md): Asgardeo, Mapbox, push
- [AWS Deployment](../04-runbooks/aws-deployment.md): running it for real
