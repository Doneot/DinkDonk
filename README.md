# DinkDonk

DinkDonk is a Twitch live notification platform.

It tracks Twitch streamers through Twitch EventSub and delivers live notifications to users through multiple notification channels.

Current notification channels:
- Discord direct messages
- Web realtime updates through Socket.IO

Planned notification channels:
- Web Push notifications
- Native desktop/mobile notifications

The project includes:
- React + Vite frontend
- Node.js + Express backend
- Socket.IO realtime layer
- Firestore persistence
- Discord bot integration
- Dockerized deployment architecture
- Caddy reverse proxy with automatic HTTPS

---

# Features

- Twitch OAuth login
- Streamer subscription management
- Discord live notifications
- EventSub lifecycle management
- Socket.IO realtime updates
- Production-ready Docker deployment
- Portable VPS architecture
- Automatic HTTPS with Caddy
- Environment separation: development, staging, production
- Docker secrets support

---

# Tech stack

## Frontend

- React
- Vite
- React Router
- Socket.IO client

## Backend

- Node.js
- Express
- Socket.IO
- Passport
- Firestore
- Discord.js

## Infrastructure

- Docker
- Docker Compose
- Caddy

---

# Project structure

```txt
client/
  src/

server/
  src/
  Dockerfile
  deploy-commands.js

deploy/
  compose.dev.yml
  compose.staging.yml
  compose.prod.yml
  Dockerfile.caddy
  Caddyfile
  .env.production
  .env.staging
  secrets/
  secrets-staging/

ARCHITECTURE.md
DEPLOYMENT.md
README.md
```

---

# Development setup

## Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

## Configure development environment

Create:

```txt
server/.env.development
client/.env
```

The backend development env should contain local credentials and Firebase development credentials.

The frontend env should only contain public `VITE_*` values.

## Start backend

Recommended: Docker Compose, matching production's topology and giving you Redis plus the Prometheus/Grafana monitoring stack for free.

First launch or after dependency changes:

```bash
docker compose -f deploy/compose.dev.yml up --build
```

Normal development:

```bash
docker compose -f deploy/compose.dev.yml up
```

The backend uses bind mounts and nodemon for hot reload.

### Without Docker

Docker isn't required. `REDIS_URL` is optional - every Redis-backed feature (rate limiting, EventSub replay dedup, the distributed token-refresh lock) falls back to an in-process equivalent when it's unset, so you can run the backend directly:

```bash
cd server
npm run dev
```

Leave `REDIS_URL` out of `server/.env.development` entirely to run this way. This is fine for solo development; it just means rate limiting/replay dedup reset on every restart and don't apply across multiple instances - exactly the tradeoff production avoids by setting `REDIS_URL`. If you want real Redis without the rest of the Compose stack, run `docker run -p 6379:6379 redis:7-alpine` (or a local Redis install) and set `REDIS_URL=redis://localhost:6379`.

## Start frontend

In another terminal:

```bash
cd client
npm run dev
```

Open:

```txt
http://localhost:5000
```

---

# Production deployment

See:

```txt
DEPLOYMENT.md
```

---

# Discord slash commands

Deploy Discord commands manually:

```bash
cd server
npm run deploy:commands
```

Slash command deployment should remain explicit. It should not happen on every backend startup.

---

# EventSub behavior

Production deployments intentionally keep EventSub subscriptions during restart/redeploy.

Development environments can optionally remove subscriptions on shutdown:

```env
UNSUBSCRIBE_EVENTSUB_ON_SHUTDOWN=true
```

Production recommendation:

```env
UNSUBSCRIBE_EVENTSUB_ON_SHUTDOWN=false
```

---

# Secrets

Production secrets live in:

```txt
deploy/secrets/
```

Staging secrets live in:

```txt
deploy/secrets-staging/
```

Only `.gitkeep` should be committed from those directories.

Never commit:
- Discord bot token
- Discord client secret
- Twitch client secret
- Twitch webhook secret
- Firebase service account JSON
- session secret
- admin password

---

# Future roadmap

- Notification channel abstraction
- Web Push notifications
- Native desktop notifications
- Mobile push notifications
- Notification preference UI
- PWA support

---

# License

Private project.
