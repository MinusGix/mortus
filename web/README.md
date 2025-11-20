# Mortus Web

React + TypeScript + Vite front-end for the online MTG tabletop. This is the starting point for the UI that will connect to the game/websocket layer.

## Prerequisites
- Node.js 20+
- npm 10+

## Setup
```bash
npm install # front-end deps
npm run dev
```

Run the websocket server locally (separate terminal):
```bash
cd ../server
npm install
npm run start
```

## Scripts
- `npm run dev` — local dev server with HMR.
- `npm run build` — type-check and production build to `dist/`.
- `npm run preview` — serve the production build locally.
- `npm run lint` — ESLint across the project.

## Usage
- Go to `/` for the lobby join page.
- Joining or creating a room navigates to `/room/{code}` for the full table view.
- Configure websocket endpoint with `VITE_WS_URL` (default `ws://localhost:4000`).

## Notes
- Vite environment variables must be prefixed with `VITE_` to be exposed to the client.
- Update `src` with UI/layout work; `public/` is served statically at the root.
