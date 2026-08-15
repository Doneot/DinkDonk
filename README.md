<div align="center">
  <img src="client/public/DinkDonk.png" width="120" alt="DinkDonk mascot" />

# DinkDonk

### Know the second a streamer you follow goes live.

[![Live App](https://img.shields.io/badge/live%20app-dinkdonk.donuts.ovh-22c55e?style=for-the-badge&logo=vercel&logoColor=white)](https://dinkdonk.donuts.ovh)
[![License](https://img.shields.io/badge/license-private-lightgrey?style=for-the-badge)](#license)

![Node.js](https://img.shields.io/badge/node-22.x-339933?style=flat-square&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![Express](https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express&logoColor=white)
![Firestore](https://img.shields.io/badge/Firestore-FFCA28?style=flat-square&logo=firebase&logoColor=black)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?style=flat-square&logo=socket.io&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![Swift](https://img.shields.io/badge/Swift-iOS%20companion-F05138?style=flat-square&logo=swift&logoColor=white)

**[🚀 Try it live](https://dinkdonk.donuts.ovh)** · [Discord commands](#-discord-commands) · [Architecture](ARCHITECTURE.md) · [Deployment](DEPLOYMENT.md)

</div>

<br />

DinkDonk tells you the moment a Twitch streamer you follow goes live — without you having to check Twitch.

Sign in, pick the streamers you care about, and choose how you want to hear about it: a Discord DM, a browser push notification, a genuine phone alarm, or just watching your dashboard update in real time. No more missing a stream because you weren't scrolling Twitch at the right moment.

## Contents

- [DinkDonk](#dinkdonk)
  - [Know the second a streamer you follow goes live.](#know-the-second-a-streamer-you-follow-goes-live)
  - [Contents](#contents)
  - [Screenshots](#screenshots)
  - [What you can do](#what-you-can-do)
  - [Signing in](#signing-in)
  - [💬 Discord commands](#-discord-commands)
  - [Notification channels](#notification-channels)
  - [⏰ iOS alarm companion](#-ios-alarm-companion)
  - [🛠️ For developers](#️-for-developers)
    - [Quick local setup](#quick-local-setup)
    - [Discord slash commands (deployment)](#discord-slash-commands-deployment)
  - [Secrets](#secrets)
  - [License](#license)

---

## Screenshots

<p align="center">
  <img src="docs/screenshots/dashboard.png" width="100%" alt="DinkDonk dashboard — signal status, notification channels, and streamer subscriptions" />
  <br />
  <sub>The dashboard — live status, notification toggles, and your subscriptions.</sub>
</p>

<p align="center">
  <img src="docs/screenshots/discord.png" height="380" alt="DinkDonk Discord slash commands" />
  &nbsp;&nbsp;
  <img src="docs/screenshots/pwa.webp" height="380" alt="DinkDonk installed as a PWA on mobile" />
  <br />
  <sub>Discord slash commands &nbsp;·&nbsp; installed as a PWA on mobile</sub>
</p>

## What you can do

- 🔔 **Track streamers.** Search Twitch and subscribe to up to 200 streamers.
- 📡 **Get notified your way.** Turn on Discord DMs, browser push notifications, or both — independently, per channel.
- ✍️ **Custom messages.** Set your own notification text per streamer (e.g. "don't forget the raffle!").
- ⚡ **Watch it happen live.** The dashboard updates the instant a streamer goes live, no refresh needed.
- 💬 **Use it from Discord.** Everything the dashboard does is also available as slash commands, if you'd rather not leave Discord.
- ⏰ **Wake up for it.** The [iOS companion app](#-ios-alarm-companion) turns a live event into a real alarm that bypasses the Ring/Silent switch.
- 📲 **Install it.** DinkDonk is installable as an app on desktop and mobile (Add to Home Screen / Install App) — no app store needed.

## Signing in

DinkDonk uses Twitch's own EventSub system to know the instant a streamer goes live, so no polling and no delay. Sign in with your Discord account (always available); a given deployment may also offer Google or Twitch sign-in.

## 💬 Discord commands

If you'd rather manage things without opening the dashboard:

| Command              | What it does                                                                 |
| -------------------- | ---------------------------------------------------------------------------- |
| `/subscribe`         | Subscribe to a Twitch streamer, with an optional custom notification message |
| `/unsubscribe`       | Stop getting notified about a streamer                                       |
| `/list`              | See who you're subscribed to                                                 |
| `/set-message`       | Change the custom message for a streamer you're already subscribed to        |
| `/dashboard`         | Get a link straight to your dashboard                                        |
| `/get-subscriptions` | Same as `/list`, phrased for scripting/automation use                        |
| `/help`              | List available commands                                                      |

## Notification channels

| Channel               | Notes                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 💬 **Discord DMs**    | The bot needs to share a server with you and be able to DM you. If DMs aren't working, the dashboard's notification settings can tell you why and let you re-check. |
| 🔔 **Browser push**   | Works even when DinkDonk isn't open in a tab. Supported on desktop Chrome/Firefox/Edge and, on iOS/iPadOS, after adding DinkDonk to your Home Screen.               |
| 📺 **Live dashboard** | No notification setup required; just have the dashboard open and it updates itself.                                                                                 |
| ⏰ **iOS alarm**      | A real, ringer-bypassing alarm via the native companion app — see below.                                                                                            |

---

## ⏰ iOS alarm companion

<p align="center">
  <img src="ios/DinkDonkAlarm/screenshots/alarm-status.png" height="420" alt="iOS alarm companion — connection status" />
  &nbsp;&nbsp;
  <img src="ios/DinkDonkAlarm/screenshots/alarm-subscriptions.png" height="420" alt="iOS alarm companion — per-streamer alarm toggles" />
  <br />
  <sub>Connection status &nbsp;·&nbsp; per-streamer alarm subscriptions</sub>
</p>

A tiny native iOS app (`ios/DinkDonkAlarm/`) turns a live event into a genuine alarm — one that plays through the phone's Ring/Silent switch, which no web push or Discord notification can do. It connects to your DinkDonk deployment over the same realtime Socket.IO channel the dashboard uses, so no backend changes are required.

Build it yourself with Xcode and a free Apple ID — see **[ios/DinkDonkAlarm/README.md](ios/DinkDonkAlarm/README.md)** for setup, signing, and known limitations.

---

## 🛠️ For developers

DinkDonk is a React + TypeScript frontend, a Node.js + Express + TypeScript backend, Firestore for persistence, and Socket.IO for realtime updates, deployed behind Caddy with Docker Compose. A native Swift companion app lives alongside it for iOS alarms.

```txt
client/     React + Vite frontend
server/     Node.js + Express backend
deploy/     Docker Compose, Caddy, environment/secrets layout
ios/        Native iOS alarm companion app (Swift/SwiftUI)
```

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — how the codebase is organized, module by module.
- **[DEPLOYMENT.md](DEPLOYMENT.md)** — running your own instance (dev, staging, production).
- **[client/README.md](client/README.md)** — frontend-specific commands and structure.
- **[ios/DinkDonkAlarm/README.md](ios/DinkDonkAlarm/README.md)** — building and running the iOS companion app.

### Quick local setup

```bash
cd server && npm install
cd ../client && npm install
```

Create `server/.env.development` (backend credentials, Firebase dev credentials) and `client/.env` (public `VITE_*` values only).

Recommended — Docker Compose, which also gives you Redis and the Prometheus/Grafana monitoring stack:

```bash
docker compose -f deploy/compose.dev.yml up --build   # first run / after dependency changes
docker compose -f deploy/compose.dev.yml up            # normal development
```

Without Docker: `REDIS_URL` is optional (every Redis-backed feature falls back to an in-process equivalent when it's unset), so `cd server && npm run dev` works standalone.

In another terminal:

```bash
cd client
npm run dev
```

Open [http://localhost:5000](http://localhost:5000).

Full production/staging setup lives in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

### Discord slash commands (deployment)

Slash command registration is manual and deliberately not run on every backend startup:

```bash
cd server
npm run deploy:commands
```

---

## Secrets

Never commit:

- Discord bot token
- Discord client secret
- Twitch client secret
- Twitch webhook secret
- Firebase service account JSON
- Session secret
- Token encryption key
- Metrics token

Production secrets live in `deploy/secrets/` (staging: `deploy/secrets-staging/`) — only `.gitkeep` should ever be committed from those directories. See `deploy/.env.example` for the full list of what each deployment needs.

---

## License

Private project.

<div align="center">
  <sub>Built with 💛 and a mascot that's always ready to raise the alarm.</sub>
</div>
