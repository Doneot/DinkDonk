<div align="center">
  <img src="public/DinkDonk.png" width="72" alt="DinkDonk mascot" />

  # DinkDonk — client

  ![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
  ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
  ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
  ![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
  ![Vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)
</div>

<br />

The React + TypeScript frontend for DinkDonk, built with Vite.

See the root **[README](../README.md)** for what DinkDonk actually does (and to try the **[live app](https://dinkdonk.donuts.ovh)**), and **[ARCHITECTURE.md](../ARCHITECTURE.md)** for how this package is organized (`modules/`, `shared/`, `context/`, `pages/`, `router/`).

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
