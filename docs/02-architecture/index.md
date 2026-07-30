---
sidebar_position: 1
title: Architecture
---

# Architecture

This section documents the structural design of the EcoTrack platform — from high-level system boundaries down to multi-tenant data isolation strategy and individual technology choices.

## In This Section

- [System Context](./system-context) — C4 Level 1 and Level 2 diagrams; infrastructure deployment view
- [Tech Stack](./tech-stack) — Full technology choices with rationale for each layer
- [Multi-Tenancy](./multi-tenancy) — Shared-schema strategy, PostgreSQL RLS policies, and tenant onboarding flow
- [ADRs](./adrs) — Architectural Decision Records for each significant technology choice

## Architectural Philosophy

EcoTrack is designed as a **Modular Monolith** for the initial prototype phase, deliberately chosen over a microservices architecture. Key principles:

| Principle | Applied As |
|---|---|
| Rapid iteration over operational overhead | Single deployable unit (NestJS monolith) instead of multiple independently deployed services |
| Data isolation without cost explosion | Shared PostgreSQL instance with Row-Level Security rather than a database per tenant |
| Type safety end-to-end | TypeScript across web (Next.js), mobile (React Native), and backend (NestJS), with Drizzle ORM for type-safe SQL |
| Defer complexity until it is needed | Redis caching, microservices split, and ECS/Kubernetes deferred to a post-launch scaling phase |
