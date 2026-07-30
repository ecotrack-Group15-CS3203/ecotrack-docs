---
sidebar_position: 4
title: "ADR-003: Drizzle ORM"
---

# ADR-003: Drizzle ORM vs. Prisma vs. Raw SQL

## Status

Accepted

## Context

The EcoTrack backend requires a database access layer that satisfies two competing requirements simultaneously:

1. **Type safety:** The multi-tenant domain model is complex. TypeScript compile-time checks on query inputs and results prevent bugs where, for example, an `organizationId` field is accidentally omitted from a query filter, silently leaking cross-tenant data.
2. **PostGIS compatibility:** Spatial radius queries (e.g., `ST_DWithin` for proximity alerts) require PostGIS-specific functions and custom geometry data types that are not representable in a standard SQL abstraction.

Three options were evaluated:

- **Prisma ORM** — a popular TypeScript ORM with a schema-first approach and a Rust-based query engine.
- **Raw SQL** — plain parameterized SQL using the `pg` driver directly.
- **Drizzle ORM** — a lightweight, TypeScript-first ORM designed as a thin, transparent layer over SQL.

## Considered Options

- **Option A: Prisma ORM** — strong type safety, but limited PostGIS support.
- **Option B: Raw SQL** — full PostGIS control, but no compile-time type safety.
- **Option C: Drizzle ORM** — type-safe schema with escape-hatch raw SQL template literals.

## Decision

**Drizzle ORM** is adopted as the database access layer.

Drizzle provides a strictly-typed schema definition (used for all standard CRUD operations) alongside safe, parameterized raw SQL template literals (used for PostGIS spatial queries). This hybrid model retains TypeScript's static typing for standard operations while allowing the full power of PostGIS for geospatial queries — without sacrificing SQL injection protection, since all values in Drizzle's `sql` template literals are automatically parameterized.

## Consequences

### Positive

- **Type-safe standard queries:** Inserting, updating, and reading incidents, tasks, and users is fully type-checked at compile time. The schema definition is the single source of truth for TypeScript types.
- **PostGIS compatibility:** PostGIS geometry types and spatial functions can be used verbatim in Drizzle's `sql` template literals. Prisma's lack of PostGIS support would have required a parallel raw SQL layer, negating its type-safety benefits.
- **SQL injection protection:** Drizzle parameterizes all values in `sql` template literals automatically — there is no path to unparameterized string concatenation.
- **Transparent SQL generation:** Drizzle generates predictable, inspectable SQL with no hidden query optimizations that could produce unexpected query plans on complex multi-tenant joins.
- **Minimal runtime footprint:** Drizzle has no heavyweight runtime engine, critical on a 1 GB RAM EC2 Free Tier instance where resident memory directly impacts stability.

### Negative

- **Smaller ecosystem:** Drizzle has fewer community plugins and third-party integrations compared to Prisma. Tooling such as a visual schema browser (comparable to Prisma Studio) is not yet available.
- **Migration tooling maturity:** `drizzle-kit` migration generation is less mature than Prisma's and requires more manual review of generated SQL migration files.

### Neutral

- Drizzle's schema-first TypeScript approach is conceptually similar to Prisma's Schema Language, reducing the learning curve for developers with Prisma experience.
