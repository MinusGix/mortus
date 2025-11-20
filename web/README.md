# Mortus Web

React + TypeScript + Vite front-end for the online MTG tabletop. This is the starting point for the UI that will connect to the game/websocket layer.

## Prerequisites
- Node.js 20+
- npm 10+

## Setup
```bash
npm install
npm run dev
```

## Scripts
- `npm run dev` — local dev server with HMR.
- `npm run build` — type-check and production build to `dist/`.
- `npm run preview` — serve the production build locally.
- `npm run lint` — ESLint across the project.

## Notes
- Vite environment variables must be prefixed with `VITE_` to be exposed to the client.
- Update `src` with UI/layout work; `public/` is served statically at the root.
