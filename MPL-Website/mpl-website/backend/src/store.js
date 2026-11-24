import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedDataDir = path.resolve(__dirname, '../data');
const dataDir = path.resolve(process.env.MPL_DATA_DIR || seedDataDir);
const databaseFile = path.join(dataDir, 'mpl.sqlite');
const schemaFile = path.join(__dirname, 'schema.sql');
const importFile = path.join(seedDataDir, 'season1-import.json');
const demoSponsorsFile = path.join(seedDataDir, 'demo-sponsors.json');
const legacyJsonFile = path.join(dataDir, 'db.json');
let database;

function normalizeName(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(\s*(?:RHB|LHB|C|WK|C\s*&\s*WK)\s*\)/gi, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function getDb() {
  if (!database) throw new Error('SQLite database has not been initialized.');
  return database;
}

export function all(sql, params = []) {
  return getDb().prepare(sql).all(...params).map((row) => ({ ...row }));
}

export function one(sql, params = []) {
  const row = getDb().prepare(sql).get(...params);
  return row ? { ...row } : null;
}

export function run(sql, params = []) {
  return getDb().prepare(sql).run(...params);
}

export function transaction(callback) {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* transaction already closed */ }
    throw error;
  }
}

function seedDatabase() {
  const db = getDb();
  const imported = JSON.parse(fs.readFileSync(importFile, 'utf8'));
  const site = {
    name: 'Mahakal Premier League',
    shortName: 'MPL',
    season: 'Season 2',
    year: 2027,
    tagline: 'One league. Two formats. Unlimited passion.',
    about: 'An open-for-all cricket league with tournaments hosted at open grounds and turfs at scheduled intervals.',
    // Keep public signups closed until the league has published its privacy and contact details.
    registrationOpen: process.env.NODE_ENV !== 'production',
    socials: { instagram: '', youtube: '', whatsapp: '' },
    contactEmail: '',
    contactPhone: ''
  };

  transaction(() => {
    const insertSetting = db.prepare('INSERT OR REPLACE INTO site_settings(key, value) VALUES (?, ?)');
    insertSetting.run('site', JSON.stringify(site));

    const insertTournament = db.prepare(`INSERT INTO tournaments
      (id,type,name,season,year,format,description,overs,team_size,registration_status,start_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    insertTournament.run('s1-turf-2026', 'turf', 'MPL Season 1 Turf Championship', 'Season 1', 2026,
      'Turf', 'Historical Season 1 results imported from CricHeroes scorecards and classified as Turf per organiser confirmation.', 8,
      'Squads as listed in the official scorecards', 'Completed', '2026-10-24');
    insertTournament.run('s2-ground-2027', 'ground', 'MPL Season 2 Open Ground Tournament', 'Season 2', 2027,
      'Open Ground', 'Open-for-all cricket tournaments hosted at open grounds at scheduled intervals.', null,
      'To be announced', 'Open', null);
    insertTournament.run('s2-turf-2027', 'turf', 'MPL Season 2 Turf Tournament', 'Season 2', 2027,
      'Turf', 'Fast-paced turf cricket tournaments hosted at scheduled intervals. Open to all eligible players.', null,
      'To be announced', 'Open', null);

    const insertTeam = db.prepare(`INSERT INTO teams
      (id,name,short_name,type,city,color,secondary_color,captain,played,won,lost,tied,points,nrr,founded)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const team of imported.teams) {
      insertTeam.run(team.id, team.name, team.shortName, team.type, team.city, team.color,
        team.secondaryColor, team.captain, team.played, team.won, team.lost, team.tied,
        team.points, team.nrr, team.founded);
    }

    const insertPlayer = db.prepare(`INSERT INTO players
      (id,name,normalized_name,primary_team_id,role,age,type,matches,runs,balls_faced,fours,sixes,
       batting_innings,not_outs,dismissals,wickets,dot_balls,bowling_balls,runs_conceded,maidens,
       strike_rate,average,economy,mvp,mvp_recorded,jersey_number,source_season)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insertAlias = db.prepare('INSERT OR IGNORE INTO player_aliases(player_id,alias) VALUES (?,?)');
    for (const player of imported.players) {
      insertPlayer.run(player.id, player.name, player.normalizedName, player.teamId, player.role,
        player.age, player.type, player.matches, player.runs, player.ballsFaced, player.fours,
        player.sixes, player.battingInnings, player.notOuts, player.dismissals, player.wickets,
        player.dotBalls, player.bowlingBalls, player.runsConceded, player.maidens,
        player.strikeRate, player.average, player.economy, player.mvp, player.mvpRecorded ? 1 : 0,
        player.jerseyNumber, 'Season 1');
      for (const alias of player.aliases || []) insertAlias.run(player.id, alias);
    }

    const insertMembership = db.prepare(`INSERT INTO player_teams
      (player_id,team_id,season,appearances,is_primary) VALUES (?,?,?,?,?)`);
    const playerByKey = new Map(imported.players.map((player) => [player.normalizedName, player]));
    for (const membership of imported.playerTeams) {
      const player = playerByKey.get(membership.playerKey);
      if (player) insertMembership.run(player.id, membership.teamId, membership.season,
        membership.appearances, player.teamId === membership.teamId ? 1 : 0);
    }

    const insertMatch = db.prepare(`INSERT INTO matches
      (id,type,season,tournament,match_no,stage,team_a_id,team_b_id,match_date,match_time,venue,
       status,result,score_a,score_b,source_file,source_scorecard_id,source_datetime_zone)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const match of imported.matches) {
      insertMatch.run(match.id, match.type, match.season, match.tournament, match.matchNo, match.stage,
        match.teamAId, match.teamBId, match.date, match.time, match.venue, match.status, match.result,
        match.scoreA, match.scoreB, match.sourceFile, match.sourceScorecardId, match.sourceDateTimeUtc);
    }

    const insertInnings = db.prepare(`INSERT INTO innings
      (id,match_id,team_id,innings_number,sequence,runs,wickets,overs) VALUES (?,?,?,?,?,?,?,?)`);
    for (const item of imported.innings) {
      insertInnings.run(item.id, item.matchId, item.teamId, item.inningsNumber, item.sequence,
        item.runs, item.wickets, item.overs);
    }

    const insertBatting = db.prepare(`INSERT INTO batting_performances
      (id,match_id,innings_id,player_id,team_id,runs,balls,minutes,fours,sixes,strike_rate,dismissal_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const item of imported.batting) {
      insertBatting.run(item.id, item.matchId, item.inningsId, item.playerId, item.teamId,
        item.runs, item.balls, item.minutes, item.fours, item.sixes, item.strikeRate, item.status);
    }

    const insertBowling = db.prepare(`INSERT INTO bowling_performances
      (id,match_id,innings_id,player_id,team_id,overs,legal_balls,maidens,runs_conceded,wickets,
       dot_balls,fours_conceded,sixes_conceded,wides,no_balls,economy)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const item of imported.bowling) {
      insertBowling.run(item.id, item.matchId, item.inningsId, item.playerId, item.teamId,
        item.overs, item.legalBalls, item.maidens, item.runsConceded, item.wickets,
        item.dotBalls, item.foursConceded, item.sixesConceded, item.wides, item.noBalls, item.economy);
    }

    const info = imported.importInfo;
    db.prepare(`INSERT INTO source_imports
      (id,season,format,source_name,source_unique_files,duplicate_files_skipped,teams_imported,
       players_imported,matches_imported,batting_rows_imported,bowling_rows_imported,imported_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        'import-season-1-scorecards','Season 1',info.format || 'turf',info.source,info.sourceUniquePdfCount,
        info.duplicatePdfCount,info.teamCount,info.uniquePlayerCount,info.matchCount,
        info.battingRows,info.bowlingRows,info.importedAt
      );

    // The purse and base price are editable organiser defaults, not historic rules.
    const auctionSeason = 'Season 2 / 2027';
    db.prepare(`INSERT INTO auction_settings
      (id,season,status,purse_per_team,base_price,bid_increment,max_squad_size,currency_label)
      VALUES (1,?,'open',1000,20,10,15,'POINTS')`).run(auctionSeason);

    const insertWallet = db.prepare(`INSERT INTO auction_team_wallets
      (season,team_id,starting_purse,purse_remaining,points_spent,players_sold)
      VALUES (?,?,?,?,0,0)`);
    for (const team of imported.teams) insertWallet.run(auctionSeason, team.id, 1000, 1000);

    const insertAuctionPlayer = db.prepare(`INSERT INTO auction_players
      (season,player_id,base_price,status) VALUES (?,?,20,'pending')`);
    for (const player of imported.players) insertAuctionPlayer.run(auctionSeason, player.id);
  });
}

function migrateLegacyRegistrations() {
  if (!fs.existsSync(legacyJsonFile)) return;
  let legacy;
  try { legacy = JSON.parse(fs.readFileSync(legacyJsonFile, 'utf8')); } catch { return; }
  const site = legacy.site || {};
  if (site.socials || site.contactEmail || site.contactPhone) {
    const current = one("SELECT value FROM site_settings WHERE key='site'");
    if (current) {
      const saved = JSON.parse(current.value);
      for (const [key, value] of Object.entries(site.socials || {})) {
        if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) continue;
        try {
          const parsed = new URL(value);
          if (parsed.hostname && parsed.pathname && parsed.pathname !== '/' && !/example\.com$/i.test(parsed.hostname)) {
            saved.socials[key] = value;
          }
        } catch { /* Ignore legacy placeholder or malformed social links. */ }
      }
      for (const key of ['contactEmail','contactPhone']) {
        if (site[key] && !String(site[key]).includes('example.com') && !String(site[key]).includes('90000')) saved[key] = site[key];
      }
      run("UPDATE site_settings SET value=? WHERE key='site'", [JSON.stringify(saved)]);
    }
  }
  const registrations = Array.isArray(legacy.registrations) ? legacy.registrations : [];
  for (const registration of registrations) {
    if (!registration.fullName || !registration.email || !registration.tournamentType) continue;
    const key = normalizeName(registration.fullName);
    let player = one('SELECT id FROM players WHERE normalized_name=?', [key]);
    if (!player) {
      const playerId = `reg-${randomUUID()}`;
      run(`INSERT INTO players (id,name,normalized_name,role,type,source_season)
        VALUES (?,?,?,?,?,'Registration')`, [playerId, registration.fullName.trim(), key,
        registration.role || 'Player', registration.tournamentType]);
      player = { id: playerId };
      const season = 'Season 2 / 2027';
      run(`INSERT OR IGNORE INTO auction_players(season,player_id,base_price,status)
        VALUES (?,?,20,'pending')`, [season, player.id]);
    }
    run(`INSERT OR IGNORE INTO registrations
      (id,player_id,full_name,email,phone,age,city,tournament_type,role,team_preference,
       experience,batting_style,bowling_style,message,consent,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      registration.id || randomUUID(), player.id, registration.fullName, registration.email.toLowerCase(),
      registration.phone || '', Number(registration.age) || 18, registration.city || '',
      registration.tournamentType, registration.role || 'Player', registration.teamPreference || 'No preference',
      registration.experience || 'Beginner', registration.battingStyle || 'Not applicable',
      registration.bowlingStyle || 'Not applicable', registration.message || '',
      registration.consent ? 1 : 0, registration.status || 'Pending', registration.createdAt || new Date().toISOString()
    ]);
  }
}

function migrateSchema() {
  const db = getDb();
  const version = one('PRAGMA user_version')?.user_version || 0;
  if (version >= 2) return;

  const hasColumn = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column);
  transaction(() => {
    const columns = [
      ['sponsors', 'image_url', "ALTER TABLE sponsors ADD COLUMN image_url TEXT NOT NULL DEFAULT ''"],
      ['sponsors', 'link_url', "ALTER TABLE sponsors ADD COLUMN link_url TEXT NOT NULL DEFAULT ''"],
      ['sponsors', 'slide_kind', "ALTER TABLE sponsors ADD COLUMN slide_kind TEXT NOT NULL DEFAULT 'logo' CHECK (slide_kind IN ('logo','banner'))"],
      ['teams', 'logo_url', "ALTER TABLE teams ADD COLUMN logo_url TEXT NOT NULL DEFAULT ''"],
      ['players', 'profile_image', "ALTER TABLE players ADD COLUMN profile_image TEXT NOT NULL DEFAULT ''"],
      ['tournaments', 'end_date', 'ALTER TABLE tournaments ADD COLUMN end_date TEXT'],
      ['source_imports', 'format', "ALTER TABLE source_imports ADD COLUMN format TEXT NOT NULL DEFAULT 'ground' CHECK (format IN ('ground','turf'))"]
    ];
    for (const [table, column, statement] of columns) if (!hasColumn(table, column)) db.exec(statement);

    db.exec(`INSERT OR IGNORE INTO team_jersey_assets
      (team_id,side,image_url,file_name,original_name,mime_type,uploaded_at)
      SELECT team_id,'front',image_url,file_name,original_name,mime_type,uploaded_at FROM team_jerseys`);

    const sourceMatches = one(`SELECT COUNT(*) AS total FROM matches
      WHERE source_scorecard_id IS NOT NULL AND season='Season 1' AND type='ground'`)?.total || 0;
    if (sourceMatches) {
      run(`UPDATE matches SET type='turf',tournament='MPL Season 1 Turf Championship'
        WHERE source_scorecard_id IS NOT NULL AND season='Season 1' AND type='ground'`);
      run(`UPDATE tournaments SET type='turf',name='MPL Season 1 Turf Championship',format='Turf',
        description='Historical Season 1 results imported from CricHeroes scorecards and classified as Turf per organiser confirmation.'
        WHERE id='s1-ground-2026'`);
      if (!one("SELECT id FROM tournaments WHERE id='s1-turf-2026'")) {
        run("UPDATE tournaments SET id='s1-turf-2026' WHERE id='s1-ground-2026'");
      } else {
        run("DELETE FROM tournaments WHERE id='s1-ground-2026'");
      }
      run(`UPDATE teams SET type=CASE WHEN EXISTS (
        SELECT 1 FROM matches m WHERE m.type='ground' AND (m.team_a_id=teams.id OR m.team_b_id=teams.id)
      ) THEN 'both' ELSE 'turf' END WHERE id IN (
        SELECT team_a_id FROM matches WHERE type='turf' AND source_scorecard_id IS NOT NULL
        UNION SELECT team_b_id FROM matches WHERE type='turf' AND source_scorecard_id IS NOT NULL
      )`);
      run(`UPDATE source_imports SET format='turf',source_name='User-confirmed Turf Season 1 · uploaded CricHeroes scorecards'
        WHERE season='Season 1' AND source_name LIKE '%scorecard%'`);
    }
    run(`UPDATE players SET type=CASE
      WHEN type='both' OR EXISTS (
        SELECT 1 FROM batting_performances bp JOIN matches m ON m.id=bp.match_id
        WHERE bp.player_id=players.id AND m.type='ground'
        UNION ALL
        SELECT 1 FROM bowling_performances bp JOIN matches m ON m.id=bp.match_id
        WHERE bp.player_id=players.id AND m.type='ground'
      ) THEN 'both' ELSE 'turf' END
      WHERE source_season='Season 1' OR EXISTS (
        SELECT 1 FROM batting_performances bp JOIN matches m ON m.id=bp.match_id
        WHERE bp.player_id=players.id AND m.type='turf' AND m.source_scorecard_id IS NOT NULL
        UNION ALL
        SELECT 1 FROM bowling_performances bp JOIN matches m ON m.id=bp.match_id
        WHERE bp.player_id=players.id AND m.type='turf' AND m.source_scorecard_id IS NOT NULL
      )`);
    db.exec('PRAGMA user_version = 2');
  });
}

function seedDemoSponsors() {
  if (one("SELECT value FROM site_settings WHERE key='demo_sponsors_seeded'")) return;
  const sponsors = JSON.parse(fs.readFileSync(demoSponsorsFile, 'utf8'));
  transaction(() => {
    if (!one('SELECT id FROM sponsors LIMIT 1')) {
      const insert = getDb().prepare(`INSERT INTO sponsors
        (id,name,tag,tier,initials,color,image_url,link_url,slide_kind,active)
        VALUES (?,?,?,?,?,?,?,?,?,?)`);
      for (const sponsor of sponsors) insert.run(sponsor.id,sponsor.name,sponsor.tag,sponsor.tier,
        sponsor.initials,sponsor.color,sponsor.imageUrl,sponsor.linkUrl,sponsor.slideKind,sponsor.active?1:0);
    }
    run("INSERT OR REPLACE INTO site_settings(key,value) VALUES ('demo_sponsors_seeded','true')");
  });
}

export async function initStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  database = new DatabaseSync(databaseFile);
  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
  database.exec(fs.readFileSync(schemaFile, 'utf8'));
  migrateSchema();
  const count = one('SELECT COUNT(*) AS total FROM teams')?.total || 0;
  if (!count) seedDatabase();
  if (fs.existsSync(legacyJsonFile) && !one("SELECT value FROM site_settings WHERE key='legacy_migrated'")) {
    migrateLegacyRegistrations();
    run("INSERT OR REPLACE INTO site_settings(key,value) VALUES ('legacy_migrated','true')");
  }
  seedDemoSponsors();
  const integrity = one('PRAGMA quick_check');
  if (integrity?.quick_check !== 'ok') {
    throw new Error(`SQLite integrity check failed: ${integrity?.quick_check || 'unknown result'}`);
  }
  const foreignKeyErrors = all('PRAGMA foreign_key_check');
  if (foreignKeyErrors.length) throw new Error(`SQLite foreign key check failed with ${foreignKeyErrors.length} error(s).`);
  const counts = one(`SELECT
    (SELECT COUNT(*) FROM teams) AS teams,
    (SELECT COUNT(*) FROM players) AS players,
    (SELECT COUNT(*) FROM matches) AS matches,
    (SELECT COUNT(*) FROM registrations) AS registrations`);
  return { databaseFile, seeded: count === 0, counts, sqliteVersion: one('SELECT sqlite_version() AS version')?.version };
}

export function getDatabaseStatus() {
  const counts = one(`SELECT
    (SELECT COUNT(*) FROM teams) AS teams,
    (SELECT COUNT(*) FROM players) AS players,
    (SELECT COUNT(*) FROM matches) AS matches,
    (SELECT COUNT(*) FROM registrations) AS registrations`);
  return { counts, sqliteVersion: one('SELECT sqlite_version() AS version')?.version,
    integrity: one('PRAGMA quick_check')?.quick_check, foreignKeyErrors: all('PRAGMA foreign_key_check').length };
}

export function closeStore() {
  if (database) {
    database.close();
    database = null;
  }
}
