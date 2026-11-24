# Mahakal Premier League

A mobile-responsive league website with historical scorecards, teams, player leaderboards, 3D jerseys, an auction board, and a player registration page.

## Stack

- React and Vite frontend
- Node.js and Express API
- SQLite database seeded from the included Season 1 import

The application source is in [`MPL-Website/mpl-website`](MPL-Website/mpl-website). This source commit excludes the local scorecard PDFs, SQLite databases, backups, registration records, and redesign ZIPs from the workspace. The GitHub repository already contained `MPL-Website.zip`; the merge preserves that existing archive. A new deployment creates its database from the checked-in seed JSON.

## Run locally

Requirements: Node.js 22.16 or newer and npm.

```powershell
cd MPL-Website/mpl-website
npm install
Copy-Item backend/.env.example backend/.env
npm run dev
```

Open `http://localhost:5173`. The Vite development server proxies API calls to the local Express backend.

## Deploy

The repository includes [`render.yaml`](render.yaml) for a single Render web service. It builds the frontend, serves it and the API from one HTTPS address, and stores SQLite data and uploaded jersey artwork on a persistent disk in Singapore. The database is seeded on first launch. The Blueprint uses Render's Starter web service and a 1 GB persistent disk; Render's current pricing lists these at $7/month plus $0.25/month for the disk, before any usage-based charges or taxes. Persistent disks require a paid web service.

The initial production database keeps player registration closed. This avoids collecting contact details until the league is ready to publish its privacy and contact information. The organiser key is generated and stored by Render; it is never committed to this repository. Configure any additional service secrets in Render's dashboard.

## Project documentation

See [`MPL-Website/mpl-website/README.md`](MPL-Website/mpl-website/README.md) for API details, local development, data notes, and app features.
