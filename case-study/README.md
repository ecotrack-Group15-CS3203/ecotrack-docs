# Case study: Bolgoda Lake restoration simulation

These are the scripts and raw results behind the **EcoTrack Case Study Report** (Coordinating a Community Lake Restoration: Bolgoda Lake). The report analyses how EcoTrack improves coordination for a lake restoration campaign. Its evidence is a simulated campaign run end to end on the real system.

The simulation drives the real EcoTrack API through 11 fictional personas:
- the Bolgoda Lake Conservation Society and a University Green Society, with overlapping service areas;
- three residents;
- five volunteers;
- one applicant from outside the service area.

Each persona is an ordinary user account. Every step is a normal API call that passes through the same authentication, row-level security and workflow code as production. Only the identity provider (Asgardeo) is replaced, by a local token issuer.

The organisations and people are fictional. The run takes about 25 seconds, so its timings describe the script, not how fast a real community would act.

## Contents

| Path | What it is |
|---|---|
| `scenario/run-scenario.js` | Runs the campaign: setup, recruiting, reporting, claiming, organising, field response and oversight. Writes `scenario-results.json` and `scenario-log.txt`. |
| `scenario/reset-and-run.sh` | Creates a fresh PostGIS container, applies the migrations, starts the API against a local token issuer, and runs the scenario. |
| `scenario/scenario-results.json` | Raw output of the run used in the report (run `mus4nhzx`, 2026-10-03). It includes every call with its status and timing, the step log, notifications, audit counts and dashboard figures. |
| `scenario/scenario-log.txt` | Readable step log of the same run. |
| `screens/local-issuer.js` | Local stand-in for Asgardeo. It serves a JWKS at the Asgardeo path and mints tokens that both the API and the web app accept. |
| `screens/shoot.js` | Takes screenshots of web dashboard pages as a scenario user, using headless Chrome. |
| `diagrams/*.html` | Source of the report's before/after process diagrams. |

## Prerequisites

- Linux or macOS with Docker, Node.js 22, pnpm and `ss` (iproute2).
- [ecotrack-api](https://github.com/ecotrack-Group15-CS3203/ecotrack-api) cloned **next to this repository**, with dependencies installed (`pnpm install`). If it is somewhere else, set `API_DIR`.
- MinIO from the API's compose file running on `:9000`, with the `ecotrack-media` bucket.
- For screenshots only: [ecotrack-web](https://github.com/ecotrack-Group15-CS3203/ecotrack-web) with dependencies installed, plus Google Chrome.

```
parent/
├── ecotrack-api/
├── ecotrack-web/      (screenshots only)
└── ecotrack-docs/
    └── case-study/
```

## Re-running the simulation

```bash
# 1. Object storage (from the API checkout)
cd ecotrack-api && docker compose up -d minio minio-init

# 2. Fresh database, API on :4100, scenario run
cd ../ecotrack-docs/case-study/scenario
./reset-and-run.sh            # or: API_DIR=/path/to/ecotrack-api ./reset-and-run.sh
```

The script overwrites `scenario-results.json` and `scenario-log.txt` with the new run. It uses a separate container, `ecotrack-casestudy-db`, on port 5435, so your normal development database is not touched. Logs are written to `/tmp/ecotrack-case-study`.

When it finishes, the API (`:4100`) and the token issuer (`:9999`) are still running. Remove the database with `docker rm -f ecotrack-casestudy-db`.

### What to expect

Every run should end with `0 unexpected errors`. It should also show each of the platform's deliberate refusals:

| Situation | Expected outcome |
|---|---|
| Join request from Kandy, outside the service area | 422 |
| Second organisation claiming the oil-sheen incident at the same moment | 409 or 404, depending on timing. Both mean the claim was refused. |
| Completing a task without a photo | 400 |
| Fifth RSVP to the 4-place cleanup event | 409 |
| Second organisation reading the first organisation's tasks | 403 |

The oil-sheen incident should stay in "Cleanup Scheduled" after the first of its two tasks is completed. It should move to "Resolved" automatically after the second.

## Taking the dashboard screenshots

These steps run after a scenario run. The API must be restarted so that it trusts the local issuer:

```bash
# Local Asgardeo stand-in on :9998
node case-study/screens/local-issuer.js &

# API on :4100, trusting the local issuer (from ecotrack-api)
DB_PORT=5435 DB_PASSWORD=ecotrack_app DB_MIGRATOR_PASSWORD=ecotrack \
OIDC_JWKS_URI=http://localhost:9998/oauth2/jwks OIDC_ISSUER=http://localhost:9998/oauth2/token \
PORT=4100 pnpm start &

# Web dashboard on :3100 (from ecotrack-web)
ASGARDEO_BASE_URL=http://localhost:9998 ASGARDEO_CLIENT_ID=casestudy-local \
API_URL=http://localhost:4100/v1 ASGARDEO_POST_LOGOUT_REDIRECT_URI=http://localhost:3100 \
npx next dev -p 3100 &

# Sign in as the society's coordinator (sub = cs-<runId>-nimal) and capture pages.
# Each argument is route:file[:waitMs[:viewportHeight[:buttonTextToClick]]]
RUN=$(node -p 'require("./case-study/scenario/scenario-results.json").runId')
NAME="Nimal (BLCS coordinator)" node case-study/screens/shoot.js cs-$RUN-nimal ./png \
  "/dashboard:01-dashboard.png:16000:1300" "/incidents:02-board.png:12000:900:Board" "/workflow:10-workflow.png:10000:1500"
```

The issuer's tokens last just under one hour, because the API rejects any access token whose lifetime exceeds one hour. Each start of the issuer uses a new key ID, so a restarted issuer is picked up without restarting the API.
