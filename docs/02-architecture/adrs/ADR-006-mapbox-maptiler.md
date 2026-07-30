---
sidebar_position: 7
title: "ADR-006: Mapbox / MapTiler"
---

# ADR-006: Mapbox / MapTiler vs. Google Maps vs. Public OSM

## Status

Accepted

## Context

EcoTrack's mobile app and web dashboard require interactive map functionality for: displaying reported incidents as geo-pins, supporting radius-based proximity alerts, and geocoding address strings to coordinates for incident location tagging.

Three mapping provider options were evaluated:

- **Google Maps Platform** — the market-leading commercial mapping and geocoding API.
- **Public OSM Servers (OSMF)** — the free, community-maintained OpenStreetMap tile servers.
- **Commercial OSM Providers (Mapbox / MapTiler)** — commercial APIs serving OpenStreetMap data on enterprise-grade infrastructure.

## Considered Options

- **Option A: Google Maps Platform** — high-quality maps, extensive APIs, but high cost at scale.
- **Option B: Public OSM Servers (OSMF)** — free open-source data, strict usage policy limits.
- **Option C: Mapbox / MapTiler** — OpenStreetMap data on scalable commercial infrastructure.

## Decision

**Mapbox or MapTiler** (commercial OpenStreetMap providers) is adopted for map tile rendering and geocoding.

Both Mapbox and MapTiler serve the same open-source OpenStreetMap geographic dataset on enterprise-grade infrastructure. Both offer a free tier of up to **100,000 API requests per month**, which is sufficient for the prototype phase. Because both implement the same tile URL specification, the platform can switch between the two with a single API key change.

## Consequences

### Positive

- **High-concurrency support:** Unlike the public OSMF servers — which enforce a hard limit of 1 geocoding request per second under the Acceptable Use Policy — commercial OSM providers handle concurrent requests from multiple users without policy violations.
- **Zero cost for prototype:** 100,000 free API requests per month exceeds the expected prototype usage volume.
- **Open data licensing:** The underlying geographic data is OpenStreetMap — open-source and not subject to Google's proprietary data licensing restrictions.
- **React Native + Next.js SDK support:** Both Mapbox and MapTiler provide mature SDKs for the exact frameworks used in EcoTrack.
- **Provider flexibility:** If one provider's pricing or terms change, switching to the other requires only an API key rotation, with no code changes.

### Negative

- **API key dependency:** The map will not render if the API key expires or is revoked. This requires key rotation monitoring in production.
- **OSM data quality variance:** OpenStreetMap coverage quality varies by region. In the Sri Lanka use case (Bolgoda Lake area), OSM coverage is sufficient but may be less detailed than Google Maps in some sub-districts.

### Neutral

- All spatial calculations (radius queries, coordinate storage, distance measurements) are handled entirely by PostgreSQL + PostGIS within the backend. The map provider is used only for tile rendering and geocoding on the client side — switching providers has zero impact on backend spatial logic.
