PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sponsors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT '',
  tier TEXT NOT NULL DEFAULT '',
  initials TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#d9a21b',
  image_url TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  slide_kind TEXT NOT NULL DEFAULT 'logo' CHECK (slide_kind IN ('logo','banner')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('ground','turf')),
  name TEXT NOT NULL,
  season TEXT NOT NULL,
  year INTEGER NOT NULL,
  format TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  overs INTEGER,
  team_size TEXT NOT NULL DEFAULT 'To be announced',
  registration_status TEXT NOT NULL DEFAULT 'To be announced',
  start_date TEXT,
  end_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  short_name TEXT NOT NULL,
  logo_url TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'ground' CHECK (type IN ('ground','turf','both')),
  city TEXT,
  color TEXT NOT NULL DEFAULT '#d9a21b',
  secondary_color TEXT NOT NULL DEFAULT '#17130d',
  captain TEXT,
  played INTEGER NOT NULL DEFAULT 0,
  won INTEGER NOT NULL DEFAULT 0,
  lost INTEGER NOT NULL DEFAULT 0,
  tied INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  nrr REAL,
  founded INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  profile_image TEXT NOT NULL DEFAULT '',
  primary_team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'Player',
  age INTEGER,
  type TEXT NOT NULL DEFAULT 'ground' CHECK (type IN ('ground','turf','both')),
  matches INTEGER NOT NULL DEFAULT 0,
  runs INTEGER NOT NULL DEFAULT 0,
  balls_faced INTEGER NOT NULL DEFAULT 0,
  fours INTEGER NOT NULL DEFAULT 0,
  sixes INTEGER NOT NULL DEFAULT 0,
  batting_innings INTEGER NOT NULL DEFAULT 0,
  not_outs INTEGER NOT NULL DEFAULT 0,
  dismissals INTEGER NOT NULL DEFAULT 0,
  wickets INTEGER NOT NULL DEFAULT 0,
  dot_balls INTEGER NOT NULL DEFAULT 0,
  bowling_balls INTEGER NOT NULL DEFAULT 0,
  runs_conceded INTEGER NOT NULL DEFAULT 0,
  maidens INTEGER NOT NULL DEFAULT 0,
  strike_rate REAL NOT NULL DEFAULT 0,
  average REAL,
  economy REAL NOT NULL DEFAULT 0,
  mvp INTEGER NOT NULL DEFAULT 0,
  mvp_recorded INTEGER NOT NULL DEFAULT 0 CHECK (mvp_recorded IN (0,1)),
  jersey_number INTEGER,
  source_season TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS team_jerseys (
  team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  file_name TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_jersey_assets (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('front','back')),
  image_url TEXT NOT NULL,
  file_name TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, side)
);

CREATE INDEX IF NOT EXISTS idx_players_name ON players(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_players_primary_team ON players(primary_team_id);
CREATE INDEX IF NOT EXISTS idx_players_type ON players(type);

CREATE TABLE IF NOT EXISTS player_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  UNIQUE(player_id, alias)
);

CREATE TABLE IF NOT EXISTS player_teams (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  appearances INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  PRIMARY KEY (player_id, team_id, season)
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('ground','turf')),
  season TEXT NOT NULL,
  tournament TEXT NOT NULL,
  match_no INTEGER NOT NULL,
  stage TEXT NOT NULL DEFAULT 'League Match',
  team_a_id TEXT NOT NULL REFERENCES teams(id),
  team_b_id TEXT NOT NULL REFERENCES teams(id),
  match_date TEXT NOT NULL,
  match_time TEXT NOT NULL,
  venue TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  result TEXT NOT NULL DEFAULT '',
  score_a TEXT NOT NULL DEFAULT '',
  score_b TEXT NOT NULL DEFAULT '',
  source_file TEXT,
  source_scorecard_id TEXT UNIQUE,
  source_datetime_zone TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_matches_type_date ON matches(type, match_date, match_time);
CREATE INDEX IF NOT EXISTS idx_matches_season_type ON matches(season,type,match_date);

CREATE TABLE IF NOT EXISTS innings (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  innings_number INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  runs INTEGER NOT NULL,
  wickets INTEGER NOT NULL,
  overs REAL NOT NULL,
  UNIQUE(match_id, sequence)
);

CREATE TABLE IF NOT EXISTS batting_performances (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  innings_id TEXT NOT NULL REFERENCES innings(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  runs INTEGER NOT NULL DEFAULT 0,
  balls INTEGER NOT NULL DEFAULT 0,
  minutes INTEGER NOT NULL DEFAULT 0,
  fours INTEGER NOT NULL DEFAULT 0,
  sixes INTEGER NOT NULL DEFAULT 0,
  strike_rate REAL NOT NULL DEFAULT 0,
  dismissal_status TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_batting_player ON batting_performances(player_id);

CREATE TABLE IF NOT EXISTS bowling_performances (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  innings_id TEXT NOT NULL REFERENCES innings(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  overs REAL NOT NULL DEFAULT 0,
  legal_balls INTEGER NOT NULL DEFAULT 0,
  maidens INTEGER NOT NULL DEFAULT 0,
  runs_conceded INTEGER NOT NULL DEFAULT 0,
  wickets INTEGER NOT NULL DEFAULT 0,
  dot_balls INTEGER NOT NULL DEFAULT 0,
  fours_conceded INTEGER NOT NULL DEFAULT 0,
  sixes_conceded INTEGER NOT NULL DEFAULT 0,
  wides INTEGER NOT NULL DEFAULT 0,
  no_balls INTEGER NOT NULL DEFAULT 0,
  economy REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_bowling_player ON bowling_performances(player_id);

CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  age INTEGER NOT NULL,
  city TEXT NOT NULL,
  tournament_type TEXT NOT NULL CHECK (tournament_type IN ('ground','turf')),
  role TEXT NOT NULL,
  team_preference TEXT NOT NULL DEFAULT 'No preference',
  experience TEXT NOT NULL,
  batting_style TEXT NOT NULL DEFAULT 'Not applicable',
  bowling_style TEXT NOT NULL DEFAULT 'Not applicable',
  message TEXT NOT NULL DEFAULT '',
  consent INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(email, tournament_type)
);
CREATE INDEX IF NOT EXISTS idx_registrations_created ON registrations(created_at DESC);

CREATE TABLE IF NOT EXISTS auction_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  season TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft','open','paused','closed')),
  purse_per_team INTEGER NOT NULL DEFAULT 1000,
  base_price INTEGER NOT NULL DEFAULT 20,
  bid_increment INTEGER NOT NULL DEFAULT 10,
  max_squad_size INTEGER NOT NULL DEFAULT 15,
  currency_label TEXT NOT NULL DEFAULT 'POINTS'
);

CREATE TABLE IF NOT EXISTS auction_team_wallets (
  season TEXT NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  starting_purse INTEGER NOT NULL,
  purse_remaining INTEGER NOT NULL,
  points_spent INTEGER NOT NULL DEFAULT 0,
  players_sold INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (season, team_id),
  CHECK (purse_remaining >= 0),
  CHECK (points_spent >= 0),
  CHECK (players_sold >= 0)
);

CREATE TABLE IF NOT EXISTS auction_players (
  season TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  base_price INTEGER NOT NULL DEFAULT 20,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','unsold','nominated','sold')),
  sold_to_team_id TEXT REFERENCES teams(id),
  sold_price INTEGER,
  nomination_number INTEGER,
  nominated_at TEXT,
  sold_at TEXT,
  PRIMARY KEY (season, player_id),
  CHECK ((status = 'sold' AND sold_to_team_id IS NOT NULL AND sold_price IS NOT NULL) OR status != 'sold')
);
CREATE INDEX IF NOT EXISTS idx_auction_players_status ON auction_players(season,status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_auction_one_nominated_per_season
  ON auction_players(season) WHERE status='nominated';

CREATE TABLE IF NOT EXISTS auction_events (
  id TEXT PRIMARY KEY,
  season TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id),
  team_id TEXT REFERENCES teams(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('nominated','sold','unsold','settings_updated')),
  amount INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auction_events_created ON auction_events(season,created_at DESC);

CREATE TABLE IF NOT EXISTS source_imports (
  id TEXT PRIMARY KEY,
  season TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'ground' CHECK (format IN ('ground','turf')),
  source_name TEXT NOT NULL,
  source_unique_files INTEGER NOT NULL,
  duplicate_files_skipped INTEGER NOT NULL,
  teams_imported INTEGER NOT NULL,
  players_imported INTEGER NOT NULL,
  matches_imported INTEGER NOT NULL,
  batting_rows_imported INTEGER NOT NULL,
  bowling_rows_imported INTEGER NOT NULL,
  imported_at TEXT NOT NULL
);
