---
sidebar_position: 4
title: CI/CD Pipeline
---

# CI/CD Pipeline

EcoTrack uses **GitHub Actions** for automated CI/CD. The pipeline runs on every push to `main` and every pull request, executing lint, unit tests, end-to-end tests, Docker builds, and a zero-downtime deployment to EC2.

GitHub Actions is chosen over a self-hosted Jenkins server because it runs on GitHub-hosted runners at no cost for this project, eliminating the need for a second EC2 instance (see [ADR-005](../architecture/adrs/ADR-005-modular-monolith)).

---

## Pipeline Overview

```mermaid
flowchart LR
  A([Push / PR]) --> B[Lint]
  B --> C[Unit Tests\nJest]
  C --> D[E2E Tests\nCypress]
  D --> E{Branch?}
  E -- PR --> F([Tests Pass\nNo Deploy])
  E -- main --> G[Docker Build]
  G --> H[Deploy to EC2\nSSH + Docker Compose]
  H --> I([Health Check])
```

| Stage | Tool | Triggers |
|---|---|---|
| Lint | ESLint + TypeScript `tsc --noEmit` | All pushes and PRs |
| Unit Tests | Jest | All pushes and PRs |
| E2E Tests | Cypress | All pushes and PRs |
| Docker Build | `docker compose build` | `main` branch only |
| Deploy | SSH + `docker compose up --build -d` | `main` branch only |
| Health Check | `curl` API health endpoint | After every deploy |

---

## Workflow File

The full pipeline is defined in `.github/workflows/ci-cd.yml`:

```yaml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: "20"

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck  # tsc --noEmit across all packages

  unit-tests:
    name: Unit Tests (Jest)
    runs-on: ubuntu-latest
    needs: lint
    services:
      postgres:
        image: postgis/postgis:15-3.3
        env:
          POSTGRES_DB: ecotrack_test
          POSTGRES_USER: ecotrack
          POSTGRES_PASSWORD: ecotrack
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    env:
      DATABASE_URL: postgresql://ecotrack:ecotrack@localhost:5432/ecotrack_test
      NODE_ENV: test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Run migrations on test DB
        run: pnpm --filter api drizzle-kit migrate
      - name: Run unit tests
        run: pnpm --filter api test --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: api/coverage/

  e2e-tests:
    name: E2E Tests (Cypress)
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Start full stack via Docker Compose
        run: docker compose -f docker-compose.test.yml up -d --wait
        env:
          ASGARDEO_CLIENT_ID: ${{ secrets.ASGARDEO_CLIENT_ID_TEST }}
          ASGARDEO_CLIENT_SECRET: ${{ secrets.ASGARDEO_CLIENT_SECRET_TEST }}
      - name: Run Cypress E2E tests
        run: pnpm --filter web cypress run --headless
        env:
          CYPRESS_BASE_URL: http://localhost:3000
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: cypress-screenshots
          path: web/cypress/screenshots/
      - name: Tear down test stack
        if: always()
        run: docker compose -f docker-compose.test.yml down -v

  deploy:
    name: Deploy to EC2
    runs-on: ubuntu-latest
    needs: e2e-tests
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ubuntu
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd /home/ubuntu/ecotrack
            git pull origin main
            docker compose -f docker-compose.prod.yml up --build -d
            docker compose -f docker-compose.prod.yml exec -T api pnpm drizzle-kit migrate
      - name: Health check
        run: |
          sleep 15
          curl --fail --retry 5 --retry-delay 5 \
            https://api.ecotrack.example.com/health
```

---

## Required GitHub Secrets

Configure the following secrets in the GitHub repository under **Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `EC2_HOST` | Public IP or domain of the production EC2 instance |
| `EC2_SSH_KEY` | Private SSH key (PEM format) for EC2 access |
| `ASGARDEO_CLIENT_ID` | Asgardeo client ID for the production environment |
| `ASGARDEO_CLIENT_SECRET` | Asgardeo client secret for the production environment |
| `ASGARDEO_CLIENT_ID_TEST` | Asgardeo client ID for the test/staging environment |
| `ASGARDEO_CLIENT_SECRET_TEST` | Asgardeo client secret for the test environment |

:::caution SSH Key Security
Generate a dedicated EC2 key pair for CI/CD use only. Never use the same key pair used for interactive SSH access. Restrict the CI/CD key to the `ubuntu` user and disable password authentication on the instance.
:::

---

## Branch Strategy

| Branch | Pipeline Runs | Deploy |
|---|---|---|
| `main` | Lint → Unit → E2E → Docker Build → **Deploy** | Production EC2 |
| `develop` | Lint → Unit → E2E | No deploy |
| `feature/*` | Lint → Unit | No deploy |
| Pull Request to `main` | Lint → Unit → E2E | No deploy |

---

## Unit Tests — Jest

Unit tests live in `api/src/**/*.spec.ts` and cover:

- NestJS service layer (business logic)
- RBAC Guards (role enforcement)
- Tenant middleware (RLS session variable injection)
- Drizzle query builders
- DTO validation pipes

**Critical tests for multi-tenant isolation:**

```typescript
// Example: verify cross-tenant data leak is impossible
it('should not return incidents from a different organization', async () => {
  // Create incident for Org A
  const incidentOrgA = await incidentService.create(orgAContext, payload);

  // Query as Org B — should return empty
  const result = await incidentService.findAll(orgBContext);
  expect(result.data).toHaveLength(0);
  expect(result.data.find(i => i.id === incidentOrgA.id)).toBeUndefined();
});
```

Run locally:

```bash
cd api && pnpm test
pnpm test --coverage   # with coverage report
pnpm test --watch      # watch mode during development
```

---

## E2E Tests — Cypress

Cypress tests live in `web/cypress/e2e/` and test the full request cycle through the browser against a running Docker Compose stack.

Key test suites:

| Suite | What it Verifies |
|---|---|
| `auth.cy.ts` | Login, token refresh, unauthorized redirect |
| `incidents.cy.ts` | Submit report, verify, status update |
| `workflows.cy.ts` | Create custom stage, reorder, delete |
| `task-assignment.cy.ts` | Convert incident to task in 3 clicks (NFR: ≤3 clicks) |
| `cross-tenant.cy.ts` | Verifies data from Org A is not visible when logged in as Org B |

Run locally (requires the full Docker Compose stack running):

```bash
# Interactive mode (opens Cypress Test Runner UI)
cd web && pnpm cypress open

# Headless mode (used in CI)
pnpm cypress run --headless --browser chrome
```

---

## Rollback Procedure

If a deployment causes a regression detected by the health check or monitoring:

```bash
# SSH into EC2
ssh -i your-key.pem ubuntu@<ec2-host>

cd /home/ubuntu/ecotrack

# Roll back to the previous commit
git log --oneline -5          # find the last good commit hash
git checkout <commit-hash>

# Restart services with the rolled-back code
docker compose -f docker-compose.prod.yml up --build -d
```

For database migrations, Drizzle ORM generates reversible SQL migration files. To roll back a migration:

```bash
docker compose exec api pnpm drizzle-kit rollback
```

:::warning
Database rollbacks are irreversible if the migration dropped columns or tables. Always back up the RDS instance before deploying a migration that includes destructive schema changes.
:::
