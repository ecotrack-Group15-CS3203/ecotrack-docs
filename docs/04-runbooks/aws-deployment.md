---
sidebar_position: 3
title: AWS Deployment
---

# AWS Deployment

This runbook covers deploying the EcoTrack platform to AWS using the Free Tier architecture: Docker Compose on EC2 for compute, Amazon RDS for the managed PostgreSQL database, and Amazon S3 for media storage.

---

## Architecture Overview

```
Internet
  └── EC2 t2.micro (Nginx → Docker Compose)
        ├── NestJS API container (:3001)
        └── Next.js Web container (:3000)

Amazon RDS (PostgreSQL 15 + PostGIS 3) ─── EC2 private subnet
Amazon S3 (ecotrack-incident-media)     ─── API → presigned URLs → client uploads
```

The database is **decoupled from EC2** to prevent OOM crashes and data loss on container restarts (see [ADR-005](../architecture/adrs/ADR-005-modular-monolith)).

---

## Prerequisites

- AWS account with Free Tier eligibility
- AWS CLI v2 installed and configured (`aws configure`)
- An EC2 key pair created in the target region
- A registered domain name (pointed to the EC2 Elastic IP)

---

## Step 1: Create the RDS Database

### Launch a PostgreSQL 15 RDS Instance

```bash
aws rds create-db-instance \
  --db-instance-identifier ecotrack-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version "15.6" \
  --master-username ecotrack \
  --master-user-password YOUR_SECURE_PASSWORD \
  --allocated-storage 20 \
  --no-multi-az \
  --publicly-accessible false \
  --db-name ecotrack_db \
  --region ap-southeast-1
```

:::warning Free Tier Note
`db.t3.micro` with 20 GB storage is within the AWS Free Tier for 12 months. Do not enable Multi-AZ or increase storage beyond 20 GB without understanding the cost implications.
:::

### Enable PostGIS on RDS

Once the instance status is `available`, connect via psql and enable the extension:

```bash
psql -h <rds-endpoint> -U ecotrack -d ecotrack_db
```

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Verify
SELECT PostGIS_Full_Version();
```

### Configure the RDS Security Group

The RDS instance's security group must allow inbound TCP on port `5432` **only from the EC2 instance's security group**, not from the public internet.

```bash
# Allow EC2 security group to reach RDS
aws ec2 authorize-security-group-ingress \
  --group-id sg-XXXXXXXX \   # RDS security group ID
  --protocol tcp \
  --port 5432 \
  --source-group sg-YYYYYYYY  # EC2 security group ID
```

---

## Step 2: Create the S3 Bucket

### Create the Bucket

```bash
aws s3api create-bucket \
  --bucket ecotrack-incident-media \
  --region ap-southeast-1 \
  --create-bucket-configuration LocationConstraint=ap-southeast-1
```

### Block Public Access (Required)

All objects are accessed via presigned URLs — the bucket must **not** be publicly accessible.

```bash
aws s3api put-public-access-block \
  --bucket ecotrack-incident-media \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### Configure CORS for Presigned Uploads

The mobile and web clients upload files directly to S3 using presigned PUT URLs. S3 needs CORS configured to allow this from the app's domain.

Save the following as `cors.json`:

```json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["PUT", "GET"],
      "AllowedOrigins": [
        "https://ecotrack.example.com",
        "http://localhost:3000"
      ],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

```bash
aws s3api put-bucket-cors \
  --bucket ecotrack-incident-media \
  --cors-configuration file://cors.json
```

---

## Step 3: Configure IAM

### Create an IAM Policy for S3 Access

The EC2 instance needs an IAM role that allows the NestJS API to call S3. Apply least-privilege: only the specific bucket, only the required actions.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::ecotrack-incident-media/*"
    }
  ]
}
```

Attach this policy to an IAM Role, then attach the role to the EC2 instance. This is preferred over embedding `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in environment files.

---

## Step 4: Launch the EC2 Instance

```bash
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \  # Ubuntu 22.04 LTS (ap-southeast-1)
  --instance-type t2.micro \
  --key-name your-key-pair-name \
  --security-group-ids sg-YYYYYYYY \
  --iam-instance-profile Name=ecotrack-ec2-profile \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=ecotrack-api}]'
```

### Configure the EC2 Security Group

| Port | Protocol | Source | Purpose |
|---|---|---|---|
| `22` | TCP | Your IP only | SSH access |
| `80` | TCP | `0.0.0.0/0` | HTTP (redirects to HTTPS) |
| `443` | TCP | `0.0.0.0/0` | HTTPS (Nginx) |

**Do not expose ports `3000` or `3001` directly** — all traffic must go through Nginx.

### Install Docker on the EC2 Instance

```bash
ssh -i your-key.pem ubuntu@<ec2-public-ip>

# Install Docker
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable docker && sudo systemctl start docker
sudo usermod -aG docker ubuntu
newgrp docker

# Verify
docker --version
docker compose version
```

---

## Step 5: Configure Nginx as a Reverse Proxy

Install Nginx and configure it to proxy `api.ecotrack.example.com` → port `3001` and `ecotrack.example.com` → port `3000`.

```nginx
# /etc/nginx/sites-available/ecotrack
server {
    server_name ecotrack.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    server_name api.ecotrack.example.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }
}
```

Enable the config and obtain a TLS certificate via Let's Encrypt:

```bash
sudo ln -s /etc/nginx/sites-available/ecotrack /etc/nginx/sites-enabled/
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ecotrack.example.com -d api.ecotrack.example.com
sudo systemctl reload nginx
```

---

## Step 6: Set Production Environment Variables

Store secrets in GitHub Actions (for CI/CD injection) and on the EC2 instance. **Do not commit `.env` files containing secrets to the repository.**

On the EC2 instance, create `/home/ubuntu/ecotrack/api/.env` with the production values. At minimum:

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://ecotrack:<password>@<rds-endpoint>:5432/ecotrack_db
ASGARDEO_ORG_NAME=your-org
ASGARDEO_CLIENT_ID=your-client-id
ASGARDEO_CLIENT_SECRET=your-client-secret
AWS_REGION=ap-southeast-1
AWS_S3_BUCKET=ecotrack-incident-media
FIREBASE_PROJECT_ID=your-firebase-project
FIREBASE_SERVICE_ACCOUNT_KEY=<json-string>
```

When using the IAM Role on EC2 (Step 3), `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are **not needed** — the AWS SDK automatically uses instance metadata credentials.

---

## Step 7: Initial Deployment

```bash
# On EC2: clone repos and start services
cd /home/ubuntu
git clone https://github.com/ecotrack/api.git
git clone https://github.com/ecotrack/web.git

docker compose -f docker-compose.prod.yml up --build -d

# Run migrations against RDS
docker compose -f docker-compose.prod.yml exec api pnpm drizzle-kit migrate
```

---

## Health Check Verification

| Check | Command | Expected |
|---|---|---|
| API health | `curl https://api.ecotrack.example.com/health` | `{"status":"ok"}` |
| Web dashboard | Open `https://ecotrack.example.com` in browser | Login page loads |
| RDS connectivity | `docker compose exec api pnpm db:ping` | `Database connection OK` |
| PostGIS | See [local setup PostGIS verification](./local-development#verifying-postgis) | Version string |

---

## Cost Monitoring

After the 12-month Free Tier period expires, the estimated monthly baseline cost is approximately **$30–$50 USD**:

| Service | Resource | Estimated Cost |
|---|---|---|
| EC2 | t2.micro, on-demand | ~$9/month |
| RDS | db.t3.micro, 20 GB gp2 | ~$15/month |
| S3 | Storage + requests (small volume) | ~$1–$5/month |
| Data Transfer | Outbound internet | ~$5/month |

Set up an **AWS Billing Alarm** to alert when monthly charges exceed $15:

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "EcoTrack-Monthly-Cost-Alert" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 86400 \
  --threshold 15 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:<account-id>:<topic-name>
```
