---
sidebar_position: 2.5
title: External Services
---

# External Services

How to set up each third-party service EcoTrack depends on, and which setting in which repository it feeds. The [AWS Deployment](./aws-deployment.md) runbook uses these steps; so does local development against real services instead of the mocks.

| Service | Used by | Purpose | Status |
|---|---|---|---|
| WSO2 Asgardeo | web, mobile, API | Sign-in (OIDC) and access-token validation | Required |
| Amazon RDS for PostgreSQL | API | Database (PostGIS, RLS) | Required in production. See [AWS Deployment](./aws-deployment.md#step-2-rds-postgresql) |
| Amazon S3 | API, mobile | Incident and task photos | Required in production. See [AWS Deployment](./aws-deployment.md#step-3-s3-bucket) |
| Mapbox | web, mobile | Maps | Required |
| Expo Push → FCM / APNs | API, mobile | Push notifications | **Not configured yet**, see [below](#push-notifications-not-configured-yet) |

Throughout, replace `<org>` with your Asgardeo organization name and `ecotrack.example.com` with your domain.

---

## WSO2 Asgardeo

EcoTrack uses **two Asgardeo applications** in one organization: a confidential web application for the dashboard, and a public (PKCE) mobile application. The API has no Asgardeo application of its own. It only validates the access tokens those two issue.

Create the organization at [console.asgardeo.io](https://console.asgardeo.io). Its base URL is `https://api.asgardeo.io/t/<org>`.

:::info No roles to configure
EcoTrack does **not** read roles, groups or organization claims from tokens. The API resolves every user's role and organisation from its own `users` table on each request, and creates the user on their first valid token. You don't need roles, groups or custom claims in Asgardeo. The first admin of an organisation is whoever registers it at `/organisations/new` on the dashboard.
:::

### 1. Web dashboard application

1. **Applications → New Application → Traditional Web Application**, protocol **OpenID Connect**. Name it `EcoTrack Web`.
2. **Authorized redirect URLs**: add all of:
   - `https://ecotrack.example.com/api/auth/callback`
   - `https://ecotrack.example.com` (the post-logout redirect must also be listed here)
   - for local development: `http://localhost:3000/api/auth/callback` and `http://localhost:3000`
3. **Protocol** tab:
   - Allowed grant types: **Code** and **Refresh Token**.
   - Access Token → **Token type: JWT**. The default is *opaque*, which the API cannot validate.
4. **User Attributes** tab: request **Email**, **First Name** and **Last Name**.
5. Back on the **Protocol** tab, Access Token → **Access token attributes**: select **email**, and optionally `given_name` and `family_name`. This list is separate from the requested attributes in step 4. If `email` isn't in the *access token*, every API call fails with `401 Access token has no email claim`.
6. Copy the **Client ID** and **Client secret** from the Protocol tab.

Web settings (`ecotrack-web`, `.env.local` locally or the web env file in production):

| Variable | Value |
|---|---|
| `ASGARDEO_BASE_URL` | `https://api.asgardeo.io/t/<org>` |
| `ASGARDEO_CLIENT_ID` | Client ID from step 6 |
| `ASGARDEO_CLIENT_SECRET` | Client secret from step 6 (server-side only, never `NEXT_PUBLIC_`) |
| `ASGARDEO_REDIRECT_URI` | `https://ecotrack.example.com/api/auth/callback` |
| `ASGARDEO_POST_LOGOUT_REDIRECT_URI` | `https://ecotrack.example.com` |

The dashboard requests the scopes `openid profile email`. Session cookies are `Secure` when `NODE_ENV=production`, so production must be served over HTTPS or sign-in will loop.

### 2. Mobile application

1. **Applications → New Application → Mobile Application**. Name it `EcoTrack Mobile`. This template creates a public client: no secret, PKCE required.
2. **Authorized redirect URLs**: `ecotrack://redirect`. The app uses the same URL for sign-in and sign-out.
3. **Protocol** tab: grant types **Code** and **Refresh Token**, **Token type: JWT**.
4. **User Attributes** and **Access token attributes**: the same as the web application (email in the access token).
5. Copy the **Client ID**.

Mobile settings (`ecotrack-mobile/.env`):

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_ASGARDEO_ISSUER` | `https://api.asgardeo.io/t/<org>/oauth2/token` |
| `EXPO_PUBLIC_ASGARDEO_MOBILE_CLIENT_ID` | Client ID from step 5 |
| `EXPO_PUBLIC_API_BASE_URL` | `https://api.ecotrack.example.com` (locally: `http://<your LAN IP>:4000`) |

`ecotrack://redirect` is what `expo-auth-session` produces in a native build of the app (`pnpm android`). Expo Go generates an `exp://…` redirect instead, which would need registering separately, and the map module doesn't run in Expo Go anyway.

### 3. Sign-up options

- **Self-registration**: Login & Registration → Self Registration → enable it, so citizens can create accounts. Turn on account verification if email addresses must be confirmed.
- **Google sign-in** (optional): Connections → New Connection → Google (needs a Google OAuth client). Then add Google to the **Login Flow** of both applications.

### 4. API settings

In `ecotrack-api` (`.env` locally or the API env file in production):

| Variable | Value |
|---|---|
| `OIDC_JWKS_URI` | `https://api.asgardeo.io/t/<org>/oauth2/jwks` |
| `OIDC_ISSUER` | `https://api.asgardeo.io/t/<org>/oauth2/token` (required when `NODE_ENV=production`) |
| `OIDC_AUDIENCE` | `<web client ID>,<mobile client ID>`. Tokens issued to any other client are rejected. |

### Asgardeo troubleshooting

| Symptom | Cause |
|---|---|
| API `401 Access token has no email claim` | `email` is requested as a user attribute but isn't selected under **Access token attributes** |
| API `401` on every call, with `jwt malformed` in the logs | The application still issues **opaque** tokens |
| API `401` with `jwt issuer invalid` | `OIDC_ISSUER` doesn't match the token's `iss`. It must end in `/oauth2/token`. |
| API `401` with `jwt audience invalid` | The client ID is missing from `OIDC_AUDIENCE` |
| Asgardeo error page: redirect URI mismatch | The redirect or post-logout URL isn't in **Authorized redirect URLs** exactly (scheme, host, port, path) |
| Dashboard redirects back to login after signing in | The site is served over plain HTTP in production, so the `Secure` session cookie is dropped |

---

## Mapbox

Both clients render maps with Mapbox and each needs a **public** token (`pk.…`).

1. Sign in at [account.mapbox.com](https://account.mapbox.com) → **Tokens → Create a token**. The default public scopes are enough.
2. Create two tokens:
   - **Web**: under *URL restrictions* add `https://ecotrack.example.com` (and `http://localhost:3000` if the same token is used locally). The token is readable in the page source, so restricting it stops reuse elsewhere.
   - **Mobile**: no URL restriction (restrictions apply only to browser requests).
3. Set them:
   - `ecotrack-web`: `NEXT_PUBLIC_MAPBOX_TOKEN`. This is inlined **at build time**, so pass it as a Docker build argument, not in the runtime env file.
   - `ecotrack-mobile`: `EXPO_PUBLIC_MAPBOX_TOKEN`.

If an Android build fails while downloading the Mapbox SDK (an HTTP 401 from `api.mapbox.com`), follow the download-token step in the `@rnmapbox/maps` installation guide.

---

## Push notifications (not configured yet)

Push isn't enabled at this stage. Nothing breaks without it: in-app notifications are always stored and shown, and the API's push dispatcher skips users who have no registered device token. The mobile app only registers a token when an EAS project ID is configured, and none is.

Enabling it later involves:

1. An Expo account and an EAS project for `ecotrack-mobile` (`eas init`), with the project ID exposed to the app as `extra.eas.projectId`.
2. **Android**: a Firebase project with an Android app for `com.ecotrack.mobile`. Its `google-services.json` is wired into the build, and a Firebase **service account key (FCM V1)** is uploaded to Expo with `eas credentials`.
3. **iOS**: an APNs key from an Apple Developer Program membership, uploaded with `eas credentials`.
4. A development or preview build installed on a physical device. Push doesn't work in simulators or Expo Go.
5. Optionally, **Enhanced push security** on the Expo project, with an access token set as `EXPO_ACCESS_TOKEN` on the API. The API already supports this variable.
