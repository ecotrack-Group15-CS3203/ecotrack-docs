---
sidebar_position: 2
title: Authentication
---

# Authentication

EcoTrack uses **WSO2 Asgardeo** for identity and OAuth2 token issuance. All protected API endpoints require a valid JWT bearer token issued by Asgardeo. Role-Based Access Control (RBAC) is enforced at the NestJS Guard layer using role claims embedded in the token.

---

## OAuth2 Authorization Flows

### Web Dashboard — Authorization Code Flow

```
1. User clicks "Sign In" on the web dashboard
2. Browser redirects to Asgardeo authorization endpoint
3. User authenticates (email/password, social login, or MFA)
4. Asgardeo redirects back to the dashboard with ?code=AUTH_CODE
5. Dashboard backend exchanges the code for tokens (server-side)
6. Access token is stored in an HttpOnly cookie
```

### Mobile App — Authorization Code + PKCE Flow

The mobile app uses PKCE (Proof Key for Code Exchange) because native apps cannot securely store a client secret.

```
1. App generates a random code_verifier and computes code_challenge = SHA-256(code_verifier)
2. App opens the Asgardeo login URL with code_challenge and method=S256
3. User authenticates in the in-app browser (ASWebAuthenticationSession / Chrome Custom Tab)
4. Asgardeo redirects back to the app deep link with ?code=AUTH_CODE
5. App exchanges the code + code_verifier for tokens (no client secret required)
6. Access token is stored in the device Secure Enclave / Keychain
```

---

## Token Format

Asgardeo issues standard JWT access tokens. EcoTrack requires the following custom claims to be configured in the Asgardeo application:

```json
{
  "iss": "https://api.asgardeo.io/t/your-org/oauth2/token",
  "sub": "3a1b2c4d-0000-0000-0000-abc123456789",
  "aud": "your-client-id",
  "exp": 1753963800,
  "iat": 1753960200,
  "email": "admin@bolgoda.org",
  "roles": ["org_admin"],
  "organizationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

| Claim | Type | Description |
|---|---|---|
| `sub` | string | Unique user ID (Asgardeo user subject) |
| `email` | string | User's email address |
| `roles` | string[] | One of: `citizen`, `volunteer`, `org_admin` |
| `organizationId` | string (UUID) | Tenant the user belongs to. Used by the NestJS middleware to set the PostgreSQL RLS session variable. |

:::note
The `organizationId` claim is set when a user registers with or is invited to an organization. Citizens who have not joined any organization have `organizationId: null` and can only access public endpoints (incident map, nearby incidents).
:::

---

## Making Authenticated Requests

Include the access token in the `Authorization` header of every API request:

```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

---

## Token Refresh

Access tokens expire after **1 hour**. Use the refresh token to obtain a new access token without requiring re-authentication:

```http
POST https://api.asgardeo.io/t/{org}/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=REFRESH_TOKEN
&client_id=YOUR_CLIENT_ID
```

---

## Role-Based Access Control

EcoTrack enforces three roles. Each role inherits all permissions of the roles listed above it.

| Role | Inherits From | Key Permissions |
|---|---|---|
| `citizen` | — | Report incidents, view incident map, browse organizations, request to join an org |
| `volunteer` | `citizen` | View own assigned tasks and events, submit task completion evidence, RSVP to events |
| `org_admin` | `volunteer` | Verify incidents, create tasks and events, assign volunteers, manage workflow stages, view org analytics, generate invite links |

### Endpoint Authorization Matrix

| Endpoint | `citizen` | `volunteer` | `org_admin` |
|---|:---:|:---:|:---:|
| `POST /incidents` | ✓ | ✓ | ✓ |
| `GET /incidents/nearby` | ✓ | ✓ | ✓ |
| `GET /incidents` (org list) | — | — | ✓ |
| `POST /incidents/:id/verify` | — | — | ✓ |
| `GET /tasks` (own tasks) | — | ✓ | ✓ |
| `POST /tasks` | — | — | ✓ |
| `POST /tasks/:id/complete` | — | ✓ | ✓ |
| `POST /events` | — | — | ✓ |
| `POST /events/:id/rsvp` | — | ✓ | ✓ |
| `GET /workflows` | — | — | ✓ |
| `POST /workflows/stages` | — | — | ✓ |
| `GET /organizations` (public) | ✓ | ✓ | ✓ |
| `POST /organizations` | ✓ | ✓ | ✓ |
| `POST /organizations/:id/invites` | — | — | ✓ |

---

## Authentication Error Responses

| Status Code | Error Code | Cause |
|---|---|---|
| `401 Unauthorized` | `TOKEN_MISSING` | No `Authorization` header provided |
| `401 Unauthorized` | `TOKEN_EXPIRED` | JWT has passed its `exp` claim |
| `401 Unauthorized` | `TOKEN_INVALID` | JWT signature verification failed against Asgardeo JWKS |
| `403 Forbidden` | `INSUFFICIENT_ROLE` | Authenticated user's role does not have permission for this endpoint |
| `403 Forbidden` | `TENANT_MISMATCH` | Resource belongs to a different organization than the token's `organizationId` |

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "JWT token has expired",
  "code": "TOKEN_EXPIRED"
}
```
