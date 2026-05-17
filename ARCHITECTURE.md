# DinkDonk architecture

## High-level overview

```txt
Twitch EventSub
    -> backend notification pipeline
        -> Discord notifications
        -> realtime Socket.IO events
        -> future Web Push notifications

Frontend
    -> manages subscriptions
    -> displays realtime state

Firestore
    -> users
    -> streamers
    -> sessions
    -> notification metadata
```

The backend is the source of truth.

Frontend clients and notification channels remain decoupled from Twitch integrations.

---

# Backend architecture

The backend entrypoint is:

```txt
server/src/index.js
```

The backend is organized into bounded modules.

---

## config/

Application configuration and runtime setup.

Responsibilities:
- environment loading
- Docker secret loading
- Firebase initialization
- runtime configuration validation

Important files:

```txt
server/src/config/env.js
server/src/config/firebase.js
```

Configuration should support:
- local `.env` files for development
- Docker secrets for production and staging
- service account JSON for Firebase in deployed environments

---

## http/

Express application layer.

Responsibilities:
- Express initialization
- middleware registration
- session handling
- Passport authentication
- HTTP routes
- OAuth callbacks

Expected responsibilities:
- expose API routes
- expose auth routes
- expose EventSub callback routes
- never contain low-level Twitch/Discord persistence logic

---

## integrations/

Third-party service clients.

Responsibilities:
- Twitch API access
- Discord bot lifecycle
- external API abstractions

Examples:

```txt
server/src/integrations/TwitchClient.js
server/src/integrations/DiscordBot.js
```

This layer should know how to speak to external APIs, but should not own high-level business workflows.

---

## services/

Application orchestration layer.

Responsibilities:
- EventSub workflows
- notification delivery
- subscription synchronization
- business logic coordination

This layer should remain independent from transport-specific implementations.

Current notification flow:

```txt
Twitch live event
    -> notification service
        -> Discord delivery
        -> Socket.IO delivery
```

Future notification architecture:

```txt
NotificationService
  -> DiscordNotificationChannel
  -> WebPushNotificationChannel
  -> future MobilePushNotificationChannel
  -> future NativeDesktopNotificationChannel
```

The goal is to avoid hard-coupling Twitch events to Discord delivery.

---

## stores/

Persistence adapters.

Responsibilities:
- Firestore repositories
- persistence abstraction
- user storage
- streamer storage
- session storage
- subscription storage

Important files:

```txt
server/src/stores/FirestoreRepository.js
server/src/stores/FirestoreSessionStore.js
```

Repository methods should preserve existing user data unless intentionally replacing it.

Important rule:

```txt
Partial user updates must not reset streamer subscriptions.
```

---

## realtime/

Socket.IO realtime communication.

Responsibilities:
- authenticated websocket sessions
- user-targeted events
- frontend realtime updates

Socket.IO should be treated as a realtime UI channel, not the primary persistence layer.

---

## utils/

Small reusable helpers.

Responsibilities:
- logging
- validation
- secret helpers
- utility abstractions

---

# Frontend architecture

Frontend entrypoint:

```txt
client/src/App.jsx
```

The frontend remains intentionally lightweight.

Responsibilities:
- authentication flow
- subscription management
- realtime UI updates
- future notification preferences

---

## pages/

Route-level screens.

Pages should compose UI components and call application services, but should avoid embedding backend transport logic directly.

---

## components/

Reusable UI components.

Components should stay presentation-focused when possible.

---

## services/

API and Socket.IO communication.

Examples:
- HTTP API wrapper
- Socket.IO client initialization
- auth probing
- subscription API calls

---

## context/

React providers and shared state.

Context files may be split to avoid React Fast Refresh issues when exporting both providers and hooks.

---

## router/

Application routing.

The router defines the public/login area and authenticated dashboard area.

---

# Infrastructure architecture

Production deployment uses:

```txt
Caddy
  -> serves frontend static assets
  -> reverse proxies backend
```

Only Caddy exposes public ports.

The backend remains private and unexposed.

Caddy handles:
- HTTPS certificates
- HTTP to HTTPS redirect
- static frontend serving
- API reverse proxy
- Socket.IO reverse proxy

---

# Deployment environments

## Development

Characteristics:
- Vite dev server
- nodemon hot reload
- bind-mounted backend source
- optional ngrok/tunnel usage
- EventSub cleanup allowed

Development favors iteration speed.

---

## Staging

Characteristics:
- production-like environment
- HTTPS enabled
- Docker secrets
- isolated testing domain
- useful for validating deployment before production

Staging is optional but useful when testing:
- Caddy
- DNS
- HTTPS
- EventSub callback URLs
- Docker secrets
- production-style container networking

---

## Production

Characteristics:
- hardened deployment
- automatic HTTPS
- Docker secrets
- persistent EventSub subscriptions
- backend hidden behind Caddy

Production favors stability and repeatability.

---

# EventSub lifecycle

Production should keep EventSub subscriptions across deploys and restarts.

Reason:

```txt
Stable production callback URL
    -> subscriptions remain valid
    -> less downtime
    -> fewer unnecessary Twitch API calls
```

Development and temporary tunnel environments may unsubscribe on shutdown because callback URLs often change.

Recommended values:

```env
# development / temporary tunnel
UNSUBSCRIBE_EVENTSUB_ON_SHUTDOWN=true

# production
UNSUBSCRIBE_EVENTSUB_ON_SHUTDOWN=false
```

---

# Notification architecture roadmap

Current:

```txt
Twitch EventSub
    -> Discord notifications
```

Target:

```txt
Twitch EventSub
    -> NotificationService
        -> Discord
        -> Web Push
        -> native clients
```

This architecture keeps the notification system extensible without coupling the application to a single delivery provider.

Recommended next step:

```txt
Add Web Push notifications before building full native apps.
```

Reason:
- works without Discord
- uses browser/OS notification systems
- fits the existing web UI
- keeps the project lightweight
- supports future mobile/PWA improvements
