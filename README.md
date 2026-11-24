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

The repository includes [`render.yaml`](render.yaml) for one free Render web service in Singapore. It builds the frontend and serves it with the API from one HTTPS address. The Free service sleeps after 15 minutes without traffic; the next request can take about a minute to load. It has no persistent disk, so SQLite records and uploaded jersey images reset after a restart, spin-down, or deploy. Use this setup as a public preview, not for keeping live registrations, auction changes, or uploaded artwork. Render also limits free web services to 750 instance hours per workspace per month.

The initial production database keeps player registration closed. This avoids collecting contact details until the league is ready to publish its privacy and contact information. Organiser actions stay disabled until you add a private `ADMIN_API_KEY` in Render's dashboard; never commit that key to GitHub. For durable records and uploads, switch to paid hosting with persistent storage.

## Project documentation

See [`MPL-Website/mpl-website/README.md`](MPL-Website/mpl-website/README.md) for API details, local development, data notes, and app features.
