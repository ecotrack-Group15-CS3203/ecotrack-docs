---
sidebar_position: 3
title: "ADR-002: PostgreSQL RLS for Multi-Tenancy"
---

# ADR-002: PostgreSQL RLS for Multi-Tenant Data Isolation

## Status

Accepted

## Context

EcoTrack must support multiple independent environmental organizations (tenants) operating on the same platform. Each tenant's data (incidents, volunteers, tasks) must be completely invisible to other tenants — even if an application bug, a misconfigured query, or a compromised service account attempts cross-tenant access.

Three multi-tenancy strategies were evaluated:

- **Database-per-Tenant:** Each organization gets a dedicated PostgreSQL instance.
- **Schema-per-Tenant:** Each organization gets its own set of tables within a shared PostgreSQL instance.
- **Shared Database, Shared Schema with RLS:** All organizations share the same tables; isolation is enforced by PostgreSQL Row-Level Security policies.

## Considered Options

- **Option A: Database-per-Tenant** — maximum isolation via total infrastructure separation.
- **Option B: Schema-per-Tenant** — isolation via schema namespacing within a single instance.
- **Option C: Shared Schema + PostgreSQL RLS** — isolation enforced by the database engine through row-level policies.

## Decision

**Shared Database, Shared Schema with PostgreSQL Row-Level Security (RLS)** is adopted.

Every multi-tenant table carries an `organization_id` UUID foreign key. A PostgreSQL RLS policy is attached to each such table:

```sql
CREATE POLICY tenant_isolation ON incidents
  USING (organization_id = current_setting('app.current_tenant')::UUID);
```

The NestJS API sets `app.current_tenant` from the validated JWT claim at the start of every database transaction. No query can return a row whose `organization_id` does not match the session variable — this check is enforced by the PostgreSQL engine itself, not the application layer.

## Consequences

### Positive

- **Engine-level enforcement:** Even a direct SQL injection that bypasses application code cannot retrieve another tenant's rows — the RLS policy is evaluated by PostgreSQL before any row is returned.
- **Zero provisioning overhead:** Onboarding a new tenant requires a single `INSERT INTO organizations` — no schema migrations, no new database instances, no infrastructure changes.
- **Cost efficiency:** A single RDS instance hosts all tenants, operating entirely within the AWS Free Tier for the prototype. Database-per-Tenant would require N RDS instances for N tenants.
- **Operational simplicity:** A single schema simplifies migrations, backups, and monitoring.

### Negative

- **Policy maintenance discipline:** Every new tenant-scoped table requires an RLS policy. A missing policy silently exposes all tenants' data in that table. Mitigated by an automated test suite that verifies isolation on every multi-tenant table.
- **Performance overhead:** RLS adds a predicate to every query. Negligible with a proper index on `organization_id`, but must be monitored as data volume grows.
- **`BYPASSRLS` risk:** Any database role granted `BYPASSRLS` or superuser privileges bypasses all policies. The application database role must be strictly limited to DML operations only.

### Neutral

- Drizzle ORM's raw SQL template literal support makes it straightforward to set the `app.current_tenant` session variable within a transaction without sacrificing type safety on the rest of the query.
