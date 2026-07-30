---
sidebar_position: 2
title: "ADR-001: NestJS vs. Express.js"
---

# ADR-001: NestJS vs. Express.js for the Backend API

## Status

Accepted

## Context

The EcoTrack backend requires a Node.js application framework to build a RESTful API supporting multi-tenant authentication, RBAC authorization, spatial queries, and a complex domain model spanning incidents, tasks, events, and configurable workflows.

Two primary options were evaluated:

- **Express.js** — a minimalist, unopinionated Node.js web framework.
- **NestJS** — a TypeScript-first framework built on Express, enforcing a modular, dependency-injected architecture.

The key concern is that, as domain complexity grows in a multi-tenant system, **architectural inconsistency** becomes a significant maintenance liability. A team of 3 engineers must produce a codebase that is maintainable and can be extended or split into microservices in a future phase.

## Considered Options

- **Option A: Express.js** — minimal framework, manually structured.
- **Option B: NestJS** — structured framework with enforced modular architecture.

## Decision

**NestJS** is adopted as the backend application framework.

NestJS enforces a strict, modular architecture out-of-the-box and provides seamless TypeScript integration and enterprise design patterns (Guards, Interceptors, Pipes, Decorators). This approach supports the modular monolith strategy, ensuring the codebase remains maintainable as the prototype scales.

## Consequences

### Positive

- **Enforced structure:** Each domain area (Incidents, Organizations, Tasks, Events, Workflows) lives in its own NestJS module with clearly separated controllers, services, and repositories. New team members can locate and modify any feature without understanding the entire codebase.
- **TypeScript-first:** Compile-time type checking eliminates a class of runtime errors that are especially dangerous in a multi-tenant API where incorrect `organizationId` handling could expose cross-tenant data.
- **Scalability path:** NestJS modules are designed to be extracted into standalone microservices. When the platform outgrows a monolith, the module boundaries are already defined.
- **Built-in enterprise primitives:** Guards (RBAC enforcement), Interceptors (request logging, tenant context injection), and Pipes (DTO validation) are first-class citizens — no manual middleware composition required.

### Negative

- **Learning curve:** NestJS introduces more concepts (decorators, DI containers, modules) compared to Express, increasing initial onboarding time for developers unfamiliar with Angular-style architecture.
- **Boilerplate overhead:** For trivial endpoints, the module + controller + service file structure is heavier than a single Express route handler.

### Neutral

- NestJS runs on Express internally by default, so all Express-compatible middleware remains usable. The framework can be switched to a Fastify adapter for improved performance in a future scaling phase.
