# Mahakal Premier League (MPL) — Full-stack Website + Season 1 Database + Auction Room

A responsive React website and Node.js API for Mahakal Premier League. The project now includes a real SQLite database populated from the uploaded Season 1 CricHeroes scorecards, unique-player protection, historical match/player statistics, registration storage and a live organiser-controlled auction room.

## What was imported from the Season 1 archive

The source archive contained 20 PDF files. One PDF was an exact duplicate, so it was skipped. The database includes:

| Imported data | Count |
|---|---:|
| Unique scorecards / matches | 19 |
| Teams | 12 |
| Distinct player records | 143 |
| Innings | 40 |
| Batting performance rows | 264 |
| Bowling performance rows | 194 |
| Duplicate PDF files skipped | 1 |

The PDFs list Seva Sadan College, Ulhasnagar as the venue. Per the organiser's clarification that these matches were played on turf, the website and database classify all 19 matches, their teams and player records as **Turf Season 1**. Match results, scorecard values and venue text are preserved. The import includes squad-list players even when they did not record a batting or bowling entry in the uploaded scorecards.

**Source-data limitations:** The scorecards do not provide official NRR or MVP award records. The table derives NRR from the scorecard innings and displays it as a calculated statistic; confirm the league's official NRR rules before using it for tie-break decisions. MVP leaderboard records remain unavailable until official awards are entered. Team points use a display assumption of 2 points per win because a points rule was not confirmed in the PDFs. Match rules for Season 2 (overs, squad sizes, dates and venues) are not assumed; they remain “to be announced”.

## Technology

- **Frontend:** React 18, Vite, CSS, Lucide icons, Three.js + OrbitControls
- **Backend:** Node.js ES modules, Express, Zod, Helmet, CORS and rate limiting
- **Database:** SQLite using Node's built-in `node:sqlite` module; no Python, pip, virtual environment or extra SQLite driver is required
- **API:** REST endpoints under `/api`

## Requirements

- **Node.js 22.16 or later** (required for the built-in SQLite module used by this project)
- npm (included with Node.js; npm 10+ recommended)

Check your installed versions:

```bash
node --version
npm --version
```

## Run on Windows

1. Install Node.js 22.16 or later from [nodejs.org](https://nodejs.org/).
2. Extract `MPL-Website.zip`.
3. Open the `mpl-website` folder.
4. In PowerShell, run:

   ```powershell
   .\start-mpl.bat
   ```

   You can also double-click `start-mpl.bat` in File Explorer. **Do not run `chmod` or `start-mpl.command` in Windows PowerShell**; those are macOS/Linux commands.

The Windows launcher checks the Node version, creates `backend/.env` if needed, installs npm packages the first time and starts both services. Keep the terminal window open while using the site.

## Run on macOS

1. Install Node.js 22.16 or later from [nodejs.org](https://nodejs.org/) (or use Homebrew: `brew install node`).
2. Extract the ZIP and open the `mpl-website` folder in Terminal.
3. Run:

   ```bash
   ./start-mpl.command
   ```

The launcher checks Node.js, creates `backend/.env`, installs npm packages when needed and starts both services. No Python, `venv`, `virtualenv`, Conda or `pip` is used. If macOS blocks the launcher, run `chmod +x start-mpl.command` once, then run `./start-mpl.command` again.

## Run manually (Windows, macOS or Linux)

Open a terminal in the `mpl-website` directory and run:

```bash
npm install
```

Create the backend config if it does not exist:

**PowerShell:**

```powershell
Copy-Item backend/.env.example backend/.env
```

**macOS / Linux:**

```bash
cp backend/.env.example backend/.env
```

Check the SQLite file first, then run both services:

```bash
npm run db:check
npm run dev
```

Open the website at **http://localhost:5173**. The backend API is at **http://localhost:4000** and its health endpoint is **http://localhost:4000/api/health**.

To run one service separately:

```bash
npm run dev -w backend
npm run dev -w frontend
```

To build the frontend:

```bash
npm run build
```

## Database and duplicate-player protection

The local SQLite database is created at `backend/data/mpl.sqlite` from `backend/data/season1-import.json` the first time the backend starts. Database files, backups, registrations and other mutable local records are excluded from Git. The seed import runs only when the database has no teams; restarting the server does not re-import the same season or duplicate the players.

Important database files:

```text
backend/
├── data/
│   ├── mpl.sqlite             # Live SQLite database
│   └── season1-import.json    # Reproducible Season 1 import seed
├── src/
│   ├── schema.sql             # Relational tables, keys and constraints
│   ├── store.js               # SQLite connection, initial import and transactions
│   └── server.js              # REST API and organiser-protected auction actions
└── .env.example
```

The `players.normalized_name` column has a **UNIQUE** database constraint. Names are normalized by removing case, spaces, punctuation, accents and scorecard role annotations before insert. Registrations, manual player additions and imports therefore link to an existing player record when the normalized name already exists. The database also stores source aliases and a season-wise `player_teams` history table.

This prevents duplicate rows caused by common spelling/format variations, but two different real people with exactly the same normalized name would be treated as one player. Before a large public rollout, use a verified player registration number or mobile-number identity workflow to distinguish genuine namesakes.

The database persists after restarting the server. Create a consistent backup with `npm run db:backup`; it writes a timestamped SQLite backup in `backend/data/backups/`. Do not delete the live database unless you intentionally want to rebuild it from the import seed.

## Auction Room

Open the **Auction** item in the main navigation. The page includes:

- Total unique player pool, players still to be auctioned, sold players, total points spent and players marked unsold.
- A nominated-player card with Season 1 statistics.
- A team purse tracker showing starting purse, remaining points, points spent and squad count.
- Player pool filters for pending, on-the-block, unsold, sold and all players.
- A searchable player list with previous Season 1 team, runs, wickets and auction status.
- Sale confirmation and unsold actions.
- Auction transaction history / event log.
- Shared auction state refreshes every 10 seconds so a second display follows organiser actions.
- Editable purse, base price, bid increment, maximum squad size and auction status (draft/open/paused/closed).

Auction states are kept separately:

- **To be auctioned / pending:** Not yet called to the auction.
- **On the block / nominated:** Currently being auctioned; only one active nomination is allowed.
- **Unsold:** Was called but no team purchased the player; the player can be nominated again.
- **Sold:** Sold to a team and cannot be sold again in the same auction.

All nomination, sale, unsold and wallet changes are protected by the organiser key and committed as SQLite transactions. The backend prevents a player from being sold twice, blocks sales above a team's remaining purse and enforces the configured squad limit and bid increments.

### Initial auction settings (editable)

The Season 2 auction starts with **1,000 points per team**, **20 points base price**, **10 points bid increment** and **15 players maximum per squad**. These are starter values for configuration, not official rules found in the Season 1 scorecards. Confirm the league's actual auction rules before using the auction in a live event.

The initial team wallets use the 12 teams found in the Season 1 archive. Update the team/franchise list through the database/admin workflow if Season 2 will use different franchises. The existing Season 1 teams and scorecard player records are classified as Turf per organiser confirmation; auction wallets remain the separately configured Season 2 pool.

### Organiser key

The launchers create `backend/.env` from the example file. Set a private random value for `ADMIN_API_KEY` in `backend/.env` and enter that value in the **Organiser Access → Admin Key** field on the Auction page to nominate players, confirm sales, mark players unsold or change auction settings. Never put this key in a `VITE_` frontend variable. The checked-in environment example leaves it blank.


## Database connection check

The website does not connect directly from the browser to the `.sqlite` file. The Express API opens `backend/data/mpl.sqlite`; Vite forwards browser requests from `/api` to `http://127.0.0.1:4000`. The top-of-page database indicator checks the live `/api/health` endpoint and confirms SQLite integrity before showing **DATABASE CONNECTED**.

The Windows/macOS launchers run `npm run db:check` before starting the site. To test manually from the project root:

```bash
npm run db:check
```

A successful check prints the database file, SQLite version and record counts. In another terminal, start both services with `npm run dev`. Open the exact URL `http://localhost:5173` (not the HTML file directly and not a different port). Confirm the API responds at `http://localhost:4000/api/health`. It should return `status: "ok"`, `database: "connected"`, and counts for teams, players and matches.

If the website shows disconnected, check that the backend terminal prints `SQLite connected`, Node is version 22.16 or later, port 4000 is free, and the API health URL works. If using `127.0.0.1` for the frontend instead of `localhost`, both are allowed by the default CORS settings.

## 3D team jerseys

Open **3D Jerseys** on the website and select a team. The Three.js / React Three Fiber viewer builds a shaped shirt model with torso panels, sleeves, collar, cuffs and hem. Drag to rotate, zoom, or choose the front and back views. For DB XI, the source design in `frontend/public/assets/jersey/` supplies the front and back textures. Other teams display a clearly marked artwork-needed preview until their real design is uploaded.

An organiser can enter the admin key and upload separate front and back PNG, JPG or WebP artwork (up to 4 MB per side). Both textures and their file references are persisted in SQLite and `backend/uploads/jerseys/`. Replacing either side updates that team's existing artwork record for that side. Use straight-on, centered artwork so the print maps cleanly to the model.

## REST API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Service and database status/counts |
| GET | `/api/site` | Site configuration, active sponsors and tournament formats |
| GET | `/api/sponsors` | Active sponsor slides |
| GET | `/api/tournaments?type=ground\|turf` | Tournament formats |
| GET | `/api/teams?type=ground\|turf` | Teams and season summary |
| GET | `/api/jerseys` | Uploaded team jersey artwork |
| GET | `/api/jerseys/:teamId` | One team jersey artwork record |
| POST | `/api/admin/teams/:id/jersey` | Upload or replace a jersey (organiser key required) |
| GET | `/api/players?type=ground\|turf` | Unique player profiles and aggregated statistics |
| GET | `/api/matches?type=ground\|turf&season=Season%201` | Match results and team details |
| GET | `/api/standings?type=ground\|turf&season=Season%201` | Computed team standings and NRR |
| GET | `/api/leaderboards?type=ground\|turf&season=Season%201&metric=...` | Ranked player statistics: runs, wickets, dots, fours, sixes, high score, bowling figures or MVP |
| POST | `/api/registrations` | Register a player; existing normalized player is reused |
| GET | `/api/auction/summary` | Auction KPIs, current nomination and wallets |
| GET | `/api/auction/players` | Auction player pool; supports `status` and `search` query parameters |
| GET | `/api/auction/events` | Latest auction event log |
| POST | `/api/auction/nominate` | Nominate a pending or previously unsold player (organiser key required) |
| POST | `/api/auction/sell` | Sell the active nomination to a team (organiser key required) |
| POST | `/api/auction/mark-unsold` | Mark the active nomination unsold (organiser key required) |
| PATCH | `/api/auction/settings` | Update auction purse/rules/status (organiser key required) |
| PATCH | `/api/admin/site` | Update social links, contact details, registration status and site text (organiser key required) |
| GET | `/api/admin/import-info` | Imported source summary (organiser key required) |
| GET | `/api/admin/players` | List player records (organiser key required) |
| POST | `/api/admin/players` | Add a player; duplicate normalized names are rejected (organiser key required) |
| GET / POST | `/api/admin/teams` | List or add teams; new teams automatically receive an auction purse (organiser key required) |
| PATCH | `/api/admin/teams/:id` | Update team details (organiser key required) |
| GET / POST | `/api/admin/sponsors` | List or add sponsors for the 3-second sponsor carousel (organiser key required) |
| PATCH / DELETE | `/api/admin/sponsors/:id` | Update, activate/deactivate or remove a sponsor (organiser key required) |
| GET | `/api/admin/registrations` | List player registrations (organiser key required) |
| GET | `/api/admin/auction-events` | Full organiser auction event history (organiser key required) |

Example health check:

```bash
curl http://localhost:4000/api/health
```

Example protected import summary (replace the key):

```bash
curl http://localhost:4000/api/admin/import-info \
  -H "x-admin-key: YOUR_PRIVATE_ADMIN_KEY"
```

### Configure official social links (PowerShell example)

The scorecard archive did not contain official social handles or contact details, so these are left blank rather than guessed. Set the actual links and contact details like this:

```powershell
$headers = @{ 'x-admin-key' = 'YOUR_PRIVATE_ADMIN_KEY' }
$site = @{
  socials = @{
    instagram = 'https://www.instagram.com/YOUR_OFFICIAL_HANDLE/'
    youtube = 'https://www.youtube.com/@YOUR_OFFICIAL_CHANNEL'
    whatsapp = 'https://chat.whatsapp.com/YOUR_OFFICIAL_INVITE'
  }
  contactEmail = 'official@example.org'
  contactPhone = '+91XXXXXXXXXX'
} | ConvertTo-Json -Depth 4
Invoke-RestMethod -Method Patch -Uri 'http://localhost:4000/api/admin/site' -Headers $headers -ContentType 'application/json' -Body $site
```

### Add sponsors and teams (PowerShell examples)

Sponsor names and partner tags were not present in the Season 1 scorecards. The project includes three explicitly labelled demo slides to show the carousel and layout; replace them with approved sponsor artwork and details using the protected API. Active sponsors automatically appear in the home-page carousel and rotate every 3 seconds.

```powershell
$headers = @{ 'x-admin-key' = 'YOUR_PRIVATE_ADMIN_KEY' }
$sponsor = @{
  name = 'Sponsor Name'
  tag = 'Official Title Sponsor'
  tier = 'TITLE PARTNER'
  initials = 'SN'
  color = '#d9a21b'
  active = $true
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:4000/api/admin/sponsors' -Headers $headers -ContentType 'application/json' -Body $sponsor
```

Add a new franchise/team (the API also creates its Season 2 auction wallet using the current team purse):

```powershell
$team = @{
  name = 'New Team Name'
  shortName = 'NTN'
  type = 'ground' # use 'turf' or 'both' when appropriate
  city = 'Mumbai'
  color = '#d9a21b'
  secondaryColor = '#17130d'
  captain = 'Captain Name'
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:4000/api/admin/teams' -Headers $headers -ContentType 'application/json' -Body $team
```

Add a player manually (a player with the same normalized name returns a duplicate conflict instead of creating a second record):

```powershell
$player = @{ name = 'Player Full Name'; role = 'All-rounder'; type = 'ground' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:4000/api/admin/players' -Headers $headers -ContentType 'application/json' -Body $player
```

## Before going live

- Confirm Season 2 team/franchise list, team purse, base price, increment and squad size.
- Add official sponsors, social links, phone/email, venue/date/overs and tournament rules.
- Verify the league's official points and net-run-rate rules before using standings for tie-break decisions. The current table uses a 2-points-per-win display assumption and derives NRR from imported innings.
- Set a strong organiser key, use HTTPS, add authenticated administrator accounts and take regular database backups.
- Add a privacy notice and data retention policy before collecting player contact details.

The Season 1 scorecards and import JSON are represented in the delivered SQLite database. Their format is Turf Season 1 per organiser confirmation; the original ZIP/PDF source archive is not needed for normal website operation.
