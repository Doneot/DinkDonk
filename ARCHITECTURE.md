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

The backend is written in TypeScript and entered via:

```txt
server/src/app/index.ts
```

`npm run build` compiles `src/` to `dist/` (see `tsconfig.build.json`); `npm run dev` runs the TypeScript source directly through `tsx`.

The backend is organized as a small composition root (`app/`) wiring together an HTTP layer (`http/`), a set of bounded modules (`modules/*`), and cross-cutting shared code (`shared/`). Each bounded module is internally layered (domain / ports / infrastructure / application), loosely following a hexagonal/ports-and-adapters style: domain types and business rules don't depend on Firestore, Express, or any other framework detail.

---

## app/

The composition root and process lifecycle.

Responsibilities:
- process entrypoint and startup sequencing
- dependency injection ("container") wiring every module's repositories, providers, and services together
- runtime setup (tunneling, working-directory resolution)
- graceful shutdown on `SIGINT`/`SIGTERM`
- the recurring subscription garbage-collection scheduler

Important files:

```txt
server/src/app/index.ts               entrypoint - awaits bootstrap(), exits non-zero on failure
server/src/app/bootstrap.ts           starts the runtime, container, HTTP server, Twitch/Discord clients
server/src/app/shutdown.ts            registers signal handlers, tears everything down with per-step timeouts
server/src/app/server.ts              builds the http.Server + Socket.IO server
server/src/app/configureEventSubscriptions.ts   wires DomainEventBus events to application services
server/src/app/SubscriptionCleanupScheduler.ts  periodic EventSub subscription garbage collection
server/src/app/container/            dependency injection: repositories.ts, providers.ts, services.ts, notifications.ts, index.ts
server/src/app/runtime/              tunnel/runtime lifecycle (ngrok/ssh), independent of any one module
```

This layer should only wire things together - business logic belongs in `modules/*`, and request handling belongs in `http/`.

---

## http/

Express application layer.

Responsibilities:
- Express app/middleware initialization (`createApp.ts`, `configureMiddleware.ts`)
- session handling (Firestore-backed session store, cookie config)
- Passport authentication strategies and OAuth callback routes
- request validation (Zod schemas per route)
- HTTP routes: API routes, auth routes, the Twitch EventSub webhook, health and metrics endpoints

Important files:

```txt
server/src/http/createApp.ts
server/src/http/configureMiddleware.ts
server/src/http/configureRoutes.ts
server/src/http/passport.ts
server/src/http/routes/            apiRoutes.ts, authRoutes.ts, eventSubRoutes.ts, healthRoutes.ts, metricsRoutes.ts
server/src/http/middleware/        requestId, requestLogger, httpMetrics, auth, errorHandler, validate
server/src/http/schemas/           Zod request/response schemas, also reused to generate the OpenAPI spec
server/src/http/errors/            typed HTTP error classes (BadRequestError, NotFoundError, ...)
```

This layer should expose routes and translate HTTP <-> application calls, but should never contain low-level Twitch/Discord/Firestore persistence logic directly.

---

## modules/

Bounded modules, one per domain concept: `auth`, `discord`, `notifications`, `streamers`, `twitch`, `users`. Each module is organized the same way (not every module has every layer, but the layering is consistent where it appears):

```txt
modules/<name>/domain/            entities, value objects, plain business types (no framework deps)
modules/<name>/ports/             interfaces the application layer depends on (repositories, services)
modules/<name>/infrastructure/    concrete adapters implementing those ports (Firestore repositories,
                                   the Twitch/Discord clients, notification channels)
modules/<name>/application/       orchestration services that implement use cases against ports
modules/<name>/schemas/           Zod schemas for the module's persisted/public shapes
modules/<name>/types/             small module-local result/DTO types
```

Examples:

```txt
server/src/modules/notifications/domain/Notification.ts
server/src/modules/notifications/ports/PushSubscriptionRepository.ts
server/src/modules/notifications/infrastructure/firestore/FirestorePushSubscriptionRepository.ts
server/src/modules/notifications/infrastructure/channels/DiscordNotificationChannel.ts
server/src/modules/notifications/infrastructure/channels/WebPushNotificationChannel.ts
server/src/modules/notifications/application/NotificationManager.ts
server/src/modules/notifications/application/EventSubSyncService.ts
server/src/modules/users/infrastructure/firestore/FirestoreUserRepository.ts
server/src/modules/twitch/infrastructure/TwitchClient.ts
server/src/modules/discord/infrastructure/DiscordBot.ts
```

Current notification flow:

```txt
Twitch live event
    -> NotificationManager
        -> DiscordNotificationChannel
        -> WebPushNotificationChannel
        -> Socket.IO delivery (via realtime/, driven by domain events)
```

The `application/` layer should remain independent from transport-specific implementations (Express, Discord.js, Firestore) - it depends on `ports/` interfaces, and `infrastructure/` supplies the concrete adapters. This is what lets e.g. `NotificationManager` add a new delivery channel without any module needing to know about Express or Firestore.

Repository methods should preserve existing user/streamer data unless intentionally replacing it. Important rule that still holds:

```txt
Partial user updates must not reset streamer subscriptions.
```

There used to be a separate `subscriptions` module; it's been folded into `users`, since a `Subscription` only ever exists embedded in `User.subscriptions` rather than as its own aggregate - `FirestoreUserRepository` now owns `subscribe`/`unsubscribe`/`getSubscription`/`updateSubscription` directly (this closed a real bidirectional infrastructure coupling the two modules previously had: each imported the other's Firestore-specific schema/mapper).

**Known, accepted debt:** deciding *when* a streamer/subscriber change is domain-event-worthy (`streamerAdded` when a streamer's first subscriber shows up, `streamerEmpty` when its last one leaves) is still done inline inside Firestore transaction bodies - in `FirestoreUserRepository.subscribe()`/`unsubscribe()` and separately in `FirestoreStreamerRepository.createStreamer()` - rather than in a dedicated application-layer service that owns "what makes a streamer newly-added/newly-empty" as its own testable concern. This has already caused one real bug (the two emission sites drifted out of sync on the `streamerAdded` guard; fixed and now covered by a regression test). The larger relayering - moving that decision out of the Firestore adapters entirely - was deliberately deferred rather than rushed alongside the `subscriptions`/`users` merge above: it's real design work (what should that service's interface look like, how does it compose with the existing transactional read-modify-write) that deserves its own focused pass rather than being squeezed into an already-large change. Revisit if a similar event-emission decision needs to be added elsewhere in this area - that's the signal this debt is starting to cost more than it saves.

---

## shared/

Cross-cutting code with no ownership by a single module.

Responsibilities:
- environment loading and validation (`shared/config/env.ts`, `envSchema.ts`, `envParsers.ts`)
- Docker secret loading (`shared/utils/secrets.ts`)
- Firebase/Firestore initialization (`shared/config/firebase.ts`)
- structured logging with field redaction (`shared/logger/logger.ts`)
- the in-process domain event bus used to decouple repositories from application services (`shared/events/DomainEventBus.ts`)
- small reusable helpers: token encryption at rest, assertions, Firestore query helpers, validators (`shared/utils/`)

Important files:

```txt
server/src/shared/config/env.ts
server/src/shared/config/envSchema.ts
server/src/shared/config/firebase.ts
server/src/shared/logger/logger.ts
server/src/shared/events/DomainEventBus.ts
server/src/shared/utils/crypto.ts
server/src/shared/utils/secrets.ts
```

Configuration should support:
- local `.env`/`.env.development` files for development
- Docker secrets (`/run/secrets/<name>`) for production and staging, with env vars taking precedence when both are present
- service account JSON (`GOOGLE_APPLICATION_CREDENTIALS`) or discrete `FIREBASE_*` env vars for Firebase, depending on deployment

---

## realtime/

Socket.IO realtime communication.

Responsibilities:
- authenticated websocket sessions
- user-targeted events
- frontend realtime updates

Socket.IO should be treated as a realtime UI channel, not the primary persistence layer.

**Multi-instance behavior.** Each backend instance holds its own in-process map of `userId -> live sockets`, so `notifyUser()` only needs to reach sockets connected to *this* instance - that's still correct under horizontal scaling, because the realtime push paths that call it (e.g. `UserChangeBroadcaster`) are themselves driven by a Firestore `onSnapshot` listener that every instance runs independently, so every instance learns of the change and notifies its own locally-connected sockets. `disconnectUser()` (forcibly closing a user's sockets on logout) is different: it's an imperative, one-off call triggered by a single HTTP request landing on a single instance, with nothing else prompting the other instances to act on it. To reach a socket connected to a *different* instance, it publishes on a Redis pub/sub channel (`SOCKET_DISCONNECT_CHANNEL` in `realtime/socketServer.ts`) that every instance's dedicated subscriber connection listens on. When `redis` isn't configured (a bare `npm run dev`, or a test harness), this degrades to disconnecting only this instance's own sockets - correct for a single-instance deployment, and the same behavior this file had before the pub/sub fanout existed.

---

## infrastructure/

Cross-cutting operational concerns that aren't tied to a single bounded module.

Responsibilities:
- Prometheus metrics registry and collectors (`infrastructure/metrics/prometheus.ts`)
- development/staging tunnel providers - ngrok and SSH - used to expose a stable EventSub callback URL (`infrastructure/tunneling/`)

---

## docs/

OpenAPI spec generation, built from the same Zod schemas used to validate requests (`http/schemas/`, plus each module's `schemas/`) via `@asteasolutions/zod-to-openapi`. Served through `swagger-ui-express`.

---

## commands/

Discord slash command handlers (`/subscribe`, `/unsubscribe`, `/list`, `/dashboard`, `/set-message`, `/get-subscriptions`, `/help`), registered by `server/src/deploy-commands.ts` and dispatched by `modules/discord/infrastructure/DiscordBot.ts`.

---

## test/

Test suites and shared test infrastructure, mirroring `src/`'s layout:

```txt
server/src/test/unit/           unit tests, one subtree per top-level src/ directory
server/src/test/integration/    supertest-driven HTTP integration tests
server/src/test/builders/       test data builders
server/src/test/fixtures/       static test fixtures
server/src/test/helpers/        shared test app/setup helpers
server/src/test/repositories/   in-memory port implementations used in tests, plus shared
                                 repository contract tests run against both the in-memory and
                                 Firestore implementations
```

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
