# DinkDonk — client

The React + TypeScript frontend for DinkDonk, built with Vite.

See the root [README](../README.md) for what DinkDonk actually does, and [ARCHITECTURE.md](../ARCHITECTURE.md) for how this package is organized (`modules/`, `shared/`, `context/`, `pages/`, `router/`).

## Commands

```bash
npm run dev         # Vite dev server on :5000 - proxies /api, /eventsub, /socket.io to a backend on :3000 (see vite.config.ts)
npm test            # Vitest suite
npm run lint         # ESLint
npm run typecheck    # tsc -b
npm run build        # production build to dist/
npm run preview      # preview the production build locally
```

## Configuration

`client/.env` should contain only public `VITE_*` values — see `client/src/config/env.ts` for what's read (currently just `VITE_SOCKET_URL`, which defaults to same-origin if unset).
