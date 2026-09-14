---
sidebar_position: 3
title: AWS Deployment
---

# AWS Deployment

Deploys the API and web dashboard to a single EC2 instance behind Nginx, with Amazon RDS for PostgreSQL and a private S3 bucket. Set up Asgardeo and Mapbox first, following [External Services](./external-services.md).

---

## Architecture

```
Internet ──HTTPS──▶ EC2 (Ubuntu, Docker)
                     Nginx :443
                       ├── ecotrack.example.com      ─▶ ecotrack-web  container :3000
                       └── api.ecotrack.example.com  ─▶ ecotrack-api  container :4000
                                                          │
                     ecotrack-web ──http──▶ ecotrack-api  │ (Docker network, server-side only)
                                                          ├──TLS──▶ RDS PostgreSQL 16 (private)
                                                          └──IAM role──▶ S3 (private bucket)

Mobile app ──HTTPS──▶ api.ecotrack.example.com
Mobile app ──presigned PUT/GET──▶ S3
```

- **Photos**: the mobile app uploads straight to S3 with a presigned PUT. The API never handles image bytes. The bucket stays private: every API response that includes a photo carries a presigned GET URL valid for 15 minutes.
- **Database**: the API connects as `ecotrack_app`, a `NOBYPASSRLS` role that migrations create. Migrations run as the RDS master user, who owns the schema and can create the `postgis`, `uuid-ossp` and `pg_trgm` extensions.
- **Credentials**: S3 access comes from the EC2 instance profile role. No AWS keys live on the instance.

Examples use region `ap-southeast-1`, domain `ecotrack.example.com` and bucket `ecotrack-media-prod`. Substitute your own.

---

## Step 1: Security groups

Create two security groups in the VPC you'll use (the default VPC is fine):

| Group | Inbound rule | Source |
|---|---|---|
| `ecotrack-ec2` | TCP 22 (SSH) | Your IP only |
| `ecotrack-ec2` | TCP 80, 443 | `0.0.0.0/0` |
| `ecotrack-rds` | TCP 5432 | Security group `ecotrack-ec2` |

Ports 3000 and 4000 are never opened. The containers bind to `127.0.0.1` and only Nginx reaches them.

---

## Step 2: RDS PostgreSQL

Create the database in the console (**RDS → Create database**) with:

| Setting | Value |
|---|---|
| Engine | PostgreSQL **16.x** (the version the project's Docker image and CI use) |
| Template / class | Free tier or `db.t4g.micro` |
| DB instance identifier | `ecotrack-db` |
| Master username | `ecotrack`. This becomes `DB_MIGRATOR_USER`. |
| Master password | A strong secret. This becomes `DB_MIGRATOR_PASSWORD`. |
| Storage | 20 GB gp3, encryption on |
| Public access | **No** |
| VPC security group | `ecotrack-rds` |
| Initial database name | `ecotrack` (under *Additional configuration*) |
| Backup retention | 7 days |

Leave the default parameter group. On PostgreSQL 15 and later it sets `rds.force_ssl = 1`, so unencrypted connections are refused, which is what the API's `DB_SSL` setting handles.

Once the instance is **Available**, copy its **endpoint** (for example `ecotrack-db.xxxxxxxx.ap-southeast-1.rds.amazonaws.com`).

You don't need to enable PostGIS by hand. The first migration creates the extensions.

---

## Step 3: S3 bucket

1. **S3 → Create bucket**: name `ecotrack-media-prod`, region `ap-southeast-1`.
2. Keep **Block all public access** turned **on**, and default encryption at SSE-S3.
3. No bucket policy and no CORS rule are needed. The mobile app's uploads aren't browser requests, so CORS doesn't apply, and browsers display the presigned URLs through `<img>` tags, which don't use CORS. If a browser client ever uploads directly, add a CORS rule allowing `PUT` from the dashboard origin.

---

## Step 4: IAM role for the instance

1. **IAM → Roles → Create role**, trusted entity **AWS service → EC2**. Name it `ecotrack-ec2`.
2. Add this inline policy (least privilege: one bucket, read and write objects only):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::ecotrack-media-prod/*"
    }
  ]
}
```

Presigned URLs are signed with whatever credentials the API holds, so the role needs `PutObject` for uploads and `GetObject` for viewing, even though clients make those requests themselves.

---

## Step 5: EC2 instance

1. Launch **Ubuntu Server 24.04 LTS**, `t3.small` (2 GB; two Node processes on a 1 GB instance risk running out of memory), 20 GB disk.
2. Security group `ecotrack-ec2`. Under *Advanced details*, set the **IAM instance profile** to `ecotrack-ec2`, **Metadata version** to *V2 only*, and **Metadata response hop limit** to **2**.
   The hop limit matters. With the default of 1, processes inside Docker containers can't reach the instance metadata service, and the API fails to load S3 credentials. To fix an existing instance:
   ```bash
   aws ec2 modify-instance-metadata-options --instance-id i-xxxxxxxx \
     --http-tokens required --http-put-response-hop-limit 2
   ```
3. Allocate an **Elastic IP** and associate it. Create DNS `A` records for `ecotrack.example.com` and `api.ecotrack.example.com` pointing at it.
4. Install the tooling:

```bash
ssh ubuntu@<elastic-ip>
sudo apt update
sudo apt install -y docker.io nginx certbot python3-certbot-nginx postgresql-client
sudo usermod -aG docker ubuntu && newgrp docker
```

5. Download the RDS certificate bundle and check the database is reachable over verified TLS:

```bash
sudo mkdir -p /etc/ecotrack
sudo curl -fsSL -o /etc/ecotrack/rds-global-bundle.pem \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
sudo chmod 644 /etc/ecotrack/rds-global-bundle.pem

psql "host=<rds-endpoint> port=5432 dbname=ecotrack user=ecotrack sslmode=verify-full sslrootcert=/etc/ecotrack/rds-global-bundle.pem" \
  -c "select version();"
```

---

## Step 6: Build and ship the images

Build on your machine or in CI, not on the instance (the Next.js build needs more memory than a small instance has spare). Both repositories include a production `Dockerfile`.

```bash
# In ecotrack-api
docker build --platform linux/amd64 -t ecotrack-api:1.0.0 .

# In ecotrack-web. NEXT_PUBLIC_* values are baked in at build time.
docker build --platform linux/amd64 -t ecotrack-web:1.0.0 \
  --build-arg NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxxxxxxx \
  --build-arg NEXT_PUBLIC_MOBILE_APP_URL= .

# Copy both to the instance
docker save ecotrack-api:1.0.0 ecotrack-web:1.0.0 | gzip | ssh ubuntu@<elastic-ip> 'gunzip | docker load'
```

(If you'd rather use a registry, push to Amazon ECR and add `ecr:GetAuthorizationToken` plus pull permissions to the instance role.)

---

## Step 7: Environment files

Create these on the instance with `sudo`, and `chmod 600` each one. Docker's `--env-file` reads values literally, so **don't wrap values in quotes**.

`/etc/ecotrack/api.env` holds the runtime settings the API container always gets:

```dotenv
NODE_ENV=production
PORT=4000
TRUST_PROXY=1
CORS_ORIGINS=https://ecotrack.example.com

DB_HOST=<rds-endpoint>
DB_PORT=5432
DB_NAME=ecotrack
DB_USER=ecotrack_app
# Generate one, e.g. openssl rand -base64 32 | tr -d '/+='
DB_PASSWORD=<strong app-role password>
DB_SSL=verify-full
DB_SSL_CA=/certs/rds-global-bundle.pem

OIDC_JWKS_URI=https://api.asgardeo.io/t/<org>/oauth2/jwks
OIDC_ISSUER=https://api.asgardeo.io/t/<org>/oauth2/token
OIDC_AUDIENCE=<web client ID>,<mobile client ID>

S3_BUCKET=ecotrack-media-prod
S3_REGION=ap-southeast-1
```

Leave `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` and `S3_PUBLIC_URL` **out entirely**. Without keys the API uses the instance role, and an empty `S3_ACCESS_KEY_ID=` line fails validation.

`/etc/ecotrack/migrator.env` holds the master credentials. It's only passed to the one-off migration container, so the long-running API never holds them:

```dotenv
DB_MIGRATOR_USER=ecotrack
DB_MIGRATOR_PASSWORD=<RDS master password>
```

`/etc/ecotrack/web.env`:

```dotenv
API_URL=http://ecotrack-api:4000/v1
ASGARDEO_BASE_URL=https://api.asgardeo.io/t/<org>
ASGARDEO_CLIENT_ID=<web client ID>
ASGARDEO_CLIENT_SECRET=<web client secret>
ASGARDEO_REDIRECT_URI=https://ecotrack.example.com/api/auth/callback
ASGARDEO_POST_LOGOUT_REDIRECT_URI=https://ecotrack.example.com
```

---

## Step 8: Migrate and start

```bash
docker network create ecotrack

# 1. Migrations (as the RDS master user). This also sets the ecotrack_app
#    password to DB_PASSWORD, and it refuses to run while DB_PASSWORD is
#    still the development placeholder.
docker run --rm --network ecotrack \
  --env-file /etc/ecotrack/api.env --env-file /etc/ecotrack/migrator.env \
  -v /etc/ecotrack/rds-global-bundle.pem:/certs/rds-global-bundle.pem:ro \
  ecotrack-api:1.0.0 node dist/database/migrate.js
# Expect: "Migrations applied successfully." then
#         "Password for role "ecotrack_app" set from DB_PASSWORD."

# 2. API
docker run -d --name ecotrack-api --restart unless-stopped --network ecotrack \
  -p 127.0.0.1:4000:4000 --env-file /etc/ecotrack/api.env \
  -v /etc/ecotrack/rds-global-bundle.pem:/certs/rds-global-bundle.pem:ro \
  ecotrack-api:1.0.0

# 3. Web dashboard
docker run -d --name ecotrack-web --restart unless-stopped --network ecotrack \
  -p 127.0.0.1:3000:3000 --env-file /etc/ecotrack/web.env \
  ecotrack-web:1.0.0

curl -s http://127.0.0.1:4000/v1/health
# {"status":"ok",...,"checks":{"database":"up"}}
```

---

## Step 9: Nginx and TLS

`/etc/nginx/sites-available/ecotrack`:

```nginx
server {
    listen 80;
    server_name ecotrack.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name api.ecotrack.example.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ecotrack /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ecotrack.example.com -d api.ecotrack.example.com
```

Certbot adds the `listen 443` blocks and the HTTP→HTTPS redirect, and installs a renewal timer.

Nginx is the one proxy hop in front of the API, which is why `api.env` sets `TRUST_PROXY=1`. If you add a load balancer in front of Nginx later, raise it to `2`.

---

## Step 10: Verify

| Check | How | Expected |
|---|---|---|
| API health | `curl https://api.ecotrack.example.com/v1/health` | `200`, `"database":"up"` |
| TLS to RDS is enforced | The API starts at all (with `DB_SSL` unset it would fail with `no pg_hba.conf entry ... no encryption`) | Healthy |
| Dashboard sign-in | Open `https://ecotrack.example.com`, sign in | Asgardeo login, then the dashboard |
| Mobile sign-in | App built with `EXPO_PUBLIC_API_BASE_URL=https://api.ecotrack.example.com` | Signed in, profile loads |
| Upload + private bucket | Report an incident with a photo from the app, then open it | Photo shows; the object exists in S3 |
| Bucket isn't public | `curl -I https://ecotrack-media-prod.s3.ap-southeast-1.amazonaws.com/<object-key>` | `403` |
| Rate limiting sees real IPs | `for i in $(seq 11); do curl -s -o /dev/null -w "%{http_code} " https://api.ecotrack.example.com/v1/invites/not-a-token; done` | The 11th request is `429`, and a request from another network right after is not |
| CORS allowlist | `curl -sI -H 'Origin: https://evil.example' https://api.ecotrack.example.com/v1/health` | No `Access-Control-Allow-Origin` header |

---

## Updating

```bash
# Build and load new tags as in Step 6, then on the instance:
docker run --rm --network ecotrack \
  --env-file /etc/ecotrack/api.env --env-file /etc/ecotrack/migrator.env \
  -v /etc/ecotrack/rds-global-bundle.pem:/certs/rds-global-bundle.pem:ro \
  ecotrack-api:1.0.1 node dist/database/migrate.js

docker rm -f ecotrack-api && docker run -d --name ecotrack-api ...   # same flags as Step 8, new tag
docker rm -f ecotrack-web && docker run -d --name ecotrack-web ...
```

**Rotating the app database password**: change `DB_PASSWORD` in `api.env`, re-run the migration container (it re-applies the password), then restart `ecotrack-api`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `no pg_hba.conf entry for host ... no encryption` | TLS not enabled | `DB_SSL=verify-full` (or `require`) |
| `self-signed certificate in certificate chain` / `unable to get local issuer certificate` | CA bundle not mounted or wrong path | Check the `-v` mount and `DB_SSL_CA` |
| `password authentication failed for user "ecotrack_app"` | Migrations not re-run since `DB_PASSWORD` was set or changed | Run the migration container again |
| `permission denied to create extension` during migration | Migrating as a user other than the RDS master | Check `migrator.env` |
| `Could not load credentials from any providers` on photo requests | No instance role, or metadata hop limit still 1 | Step 4 and Step 5 (hop limit 2) |
| Photo upload from the app fails with `403 SignatureDoesNotMatch` | Upload `Content-Type` differs from the one requested, or the device clock is badly off | Check the app's upload request |
| Photos stop loading after the screen is left open a long time | Presigned URLs expire after 15 minutes | Reload. Screens fetch fresh URLs. |
| Every user gets `429` together | `TRUST_PROXY` missing, so every request looks like it comes from Nginx | Set `TRUST_PROXY=1` |
| API exits at startup: `"OIDC_ISSUER" is not allowed to be empty` | Production requires the issuer | Set `OIDC_ISSUER` |
| Asgardeo sign-in problems | See [External Services → Asgardeo troubleshooting](./external-services.md#asgardeo-troubleshooting) | |

---

## Cost monitoring

Rough on-demand monthly figures after the Free Tier. Check the AWS Pricing Calculator for your region.

| Service | Resource | Approx. |
|---|---|---|
| EC2 | `t3.small` | ~$15–20 |
| RDS | `db.t4g.micro`, 20 GB gp3 | ~$15–20 |
| S3 | Storage + requests at low volume | ~$1–5 |
| Data transfer | Outbound | ~$5 |

Set a billing alarm (billing metrics live in `us-east-1`):

```bash
aws cloudwatch put-metric-alarm --region us-east-1 \
  --alarm-name "EcoTrack-Monthly-Cost-Alert" \
  --metric-name EstimatedCharges --namespace AWS/Billing \
  --dimensions Name=Currency,Value=USD \
  --statistic Maximum --period 21600 --evaluation-periods 1 \
  --threshold 15 --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:<account-id>:<topic-name>
```
