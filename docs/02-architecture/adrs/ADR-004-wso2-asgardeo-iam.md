---
sidebar_position: 5
title: "ADR-004: WSO2 Asgardeo IAM"
---

# ADR-004: WSO2 Asgardeo for Identity and Access Management

## Status

Accepted

## Context

EcoTrack requires a secure authentication system for three user roles (Citizen, Volunteer, Organization Admin) operating across a mobile app and a web dashboard. The layer must provide email/password login, optional social login (OAuth), JWT issuance, and MFA support for admins — all at zero cost for the prototype phase.

The fundamental security principle at stake is **OWASP A07: Identification and Authentication Failures**. Custom-built authentication systems are a primary source of critical security vulnerabilities: session fixation, insecure token storage, weak password hashing, and missing brute-force protection.

Two approaches were evaluated:

- **Custom in-house authentication:** Build registration, login, token issuance, and session management directly within NestJS.
- **WSO2 Asgardeo (IDaaS):** Use a managed, enterprise-grade Identity-as-a-Service solution.

## Considered Options

- **Option A: Custom in-house authentication** — full control, no external dependency.
- **Option B: WSO2 Asgardeo** — managed CIAM platform with OAuth2/OIDC, social logins, and MFA.

## Decision

**WSO2 Asgardeo** is adopted for Identity and Access Management.

Asgardeo handles all user authentication and OAuth2 JWT issuance. The NestJS API validates Asgardeo-issued bearer tokens via the JWKS endpoint on every authenticated request. Critically, **tenant mapping and data isolation are not handled through Asgardeo's B2B organizational model** — they are handled at the database layer via PostgreSQL RLS (see ADR-002). This decoupling allows the platform to support an unlimited number of tenant organizations while remaining within the 7,500 Consumer MAU free-tier limit, bypassing the free tier's 3-organization B2B cap entirely.

## Consequences

### Positive

- **Security by default:** Asgardeo provides battle-tested implementations of password hashing, brute-force protection, secure session management, and token rotation. The team does not implement or audit any of these.
- **Social login support:** Google, GitHub, and other OAuth providers can be configured in the Asgardeo console without backend code changes.
- **MFA out of the box:** TOTP-based MFA is available for Organization Admin accounts without additional development effort.
- **Free tier coverage:** 7,500 Consumer Monthly Active Users covers the expected prototype user base at zero cost.
- **Compliance alignment:** Asgardeo's OIDC-compliant flows align with PDPA and GDPR requirements for user consent and identity management.

### Negative

- **External service dependency:** The platform's authentication path depends on Asgardeo's availability. An Asgardeo outage blocks all new logins (existing sessions remain valid until JWT expiry).
- **Vendor coupling:** Migrating away from Asgardeo in a future phase requires updating JWT validation logic and potentially re-migrating user accounts.
- **Architectural complexity:** Bypassing Asgardeo's B2B org model means two systems (Asgardeo user identity and the `organization_id` JWT claim) must stay in sync. A custom user-to-tenant mapping service is required.

### Neutral

- Asgardeo's free B2B tier is limited to 3 organizations. By using it purely for Consumer authentication (not B2B), this limit is bypassed while remaining within the 7,500 MAU consumer limit.
