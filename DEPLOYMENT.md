# Deployment guide

## Production architecture

```txt
Internet
    -> Caddy container (:80 / :443)
        -> serves React frontend
        -> reverse proxies backend

Backend container
    -> Twitch API
    -> Discord API
    -> Firestore
```

Only Caddy exposes public ports.

The backend is not directly reachable from the internet.

---

# Deployment environments

## Development

Purpose:
- local feature development
- hot reload
- debugging

Compose file:

```txt
deploy/compose.dev.yml
```

## Staging

Purpose:
- production-like testing
- HTTPS validation
- deployment validation
- EventSub testing

Compose file:

```txt
deploy/compose.staging.yml
```

## Production

Purpose:
- real deployment
- public access
- persistent infrastructure

Compose file:

```txt
deploy/compose.prod.yml
```

---

# DNS configuration

Production:

```txt
A  dinkdonk.donuts.ovh -> server IPv4
```

Staging:

```txt
A  staging.dinkdonk.donuts.ovh -> server IPv4
```

If using a home machine for testing, the DNS record must point to your public IPv4 and your router must forward ports 80 and 443 to the local machine.

---

# Required public ports

Caddy needs:

```txt
80/tcp
443/tcp
```

These are required for:
- HTTP to HTTPS redirection
- Let's Encrypt certificate issuance/renewal
- serving the application

The backend must not expose public ports in production.

---

# Docker secrets

Production secrets:

```txt
deploy/secrets/
```

Staging secrets:

```txt
deploy/secrets-staging/
```

Important:
- never commit secrets
- keep only `.gitkeep`
- use `.env.example` for documentation

Expected production secret files:

```txt
deploy/secrets/
  .gitkeep
  firebase-service-account.json
  discord-token
  discord-client-secret
  twitch-client-secret
  twitch-webhook-secret
  session-secret
  admin-password
```

Expected staging secret files:

```txt
deploy/secrets-staging/
  .gitkeep
  firebase-service-account.json
  discord-token
  discord-client-secret
  twitch-client-secret
  twitch-webhook-secret
  session-secret
  admin-password
```

Each non-JSON secret file should contain only the raw value.

Example:

```txt
deploy/secrets/session-secret
```

```txt
long-random-secret-value
```

---

# Firebase setup

Production uses a Firebase service account JSON file.

Path:

```txt
deploy/secrets/firebase-service-account.json
```

The backend uses:

```env
GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/firebase_service_account
```

Development may either:
- use Firebase env vars in `server/.env.development`
- or mount a local service account file

---

# Environment files

Development:

```txt
server/.env.development
client/.env
```

Staging:

```txt
deploy/.env.staging
```

Production:

```txt
deploy/.env.production
```

Production example:

```env
NODE_ENV=production
PORT=3000

DOMAIN=dinkdonk.donuts.ovh
ACME_EMAIL=your-email@example.com

SERVER_URL=https://dinkdonk.donuts.ovh
CLIENT_ORIGIN=https://dinkdonk.donuts.ovh

DISCORD_CLIENT_ID=1397806486637514752
DISCORD_GUILD_ID=431708372295876618

TWITCH_CLIENT_ID=your_twitch_client_id

UNSUBSCRIBE_EVENTSUB_ON_SHUTDOWN=false
```

Secrets should not be stored in production env files when Docker secrets are available.

---

# Development workflow

## Backend

First run or after dependency changes:

```bash
docker compose -f deploy/compose.dev.yml up --build
```

Normal development:

```bash
docker compose -f deploy/compose.dev.yml up
```

Backend hot reload is enabled through nodemon.

Rebuild only when:
- dependencies change
- Dockerfile changes
- compose dev image needs refreshing

## Frontend

```bash
cd client
npm run dev
```

---

# Production deployment

## Requirements

- Docker
- Docker Compose plugin
- domain name
- ports 80 and 443 open
- production env file
- production secrets

## First deploy

1. Clone repository.
2. Configure DNS.
3. Create:

```txt
deploy/.env.production
```

4. Create production secrets:

```txt
deploy/secrets/
```

5. Start stack:

```bash
docker compose --env-file deploy/.env.production -f deploy/compose.prod.yml up -d --build
```

6. Check logs:

```bash
docker compose --env-file deploy/.env.production -f deploy/compose.prod.yml logs -f
```

7. Test:

```bash
curl https://dinkdonk.donuts.ovh/api/health
```

---

# Staging deployment

1. Configure staging DNS.
2. Create:

```txt
deploy/.env.staging
```

3. Create:

```txt
deploy/secrets-staging/
```

4. Start staging:

```bash
docker compose --env-file deploy/.env.staging -f deploy/compose.staging.yml up -d --build
```

Note: production and staging cannot both bind host ports 80 and 443 on the same machine unless they share one edge proxy.

---

# Migrating to another VPS

Migration is intentionally simple.

Copy:

```txt
deploy/.env.production
deploy/secrets/
```

Then:

1. install Docker
2. clone repository
3. restore env and secrets
4. point DNS to the new server
5. start compose stack

Caddy automatically regenerates HTTPS certificates.

---

# EventSub behavior

Production intentionally keeps EventSub subscriptions across:
- deploys
- restarts
- VPS reboot

This avoids notification downtime.

Development/staging may optionally clean subscriptions:

```env
UNSUBSCRIBE_EVENTSUB_ON_SHUTDOWN=true
```

Production recommendation:

```env
UNSUBSCRIBE_EVENTSUB_ON_SHUTDOWN=false
```

---

# Healthcheck

The backend healthcheck should use Node rather than requiring `wget` or `curl` inside the production image.

Recommended healthcheck:

```yaml
healthcheck:
  test:
    [
      "CMD-SHELL",
      "node -e \"fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))\""
    ]
  interval: 30s
  timeout: 5s
  retries: 5
  start_period: 30s
```

This avoids adding unnecessary packages to the backend image.

---

# Caddy routing

Caddy should route API paths before serving the SPA fallback.

Expected behavior:
- `/api/*` proxies to backend
- `/eventsub` proxies to backend
- `/socket.io/*` proxies to backend
- everything else serves the React app

This prevents API routes from being rewritten to `index.html`.

---

# Security recommendations

- never expose backend ports publicly
- use Docker secrets for sensitive values
- use long random session secrets
- avoid committing `.env` files
- isolate environments
- keep Caddy as the only public entrypoint
- keep dependencies updated
- do not store production secrets in git
- do not depend on local build artifacts for production
