import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { all, one, run, transaction, initStore, closeStore, getDatabaseStatus } from './store.js';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(backendDir, '.env') });
const uploadsDir = path.resolve(process.env.MPL_UPLOADS_DIR || path.join(backendDir, 'uploads'));
const jerseyUploadsDir = path.join(uploadsDir, 'jerseys');
const frontendDistDir = path.resolve(backendDir, '../frontend/dist');
fs.mkdirSync(jerseyUploadsDir, { recursive: true });

const app = express();
const port = Number(process.env.PORT || 4000);
app.set('trust proxy', 1);
const renderOrigin = process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : '';
const allowedOrigins = new Set([...(process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((s) => s.trim()), 'http://localhost:5173', 'http://127.0.0.1:5173', renderOrigin].filter(Boolean));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: (origin, callback) => { if (!origin || allowedOrigins.has(origin)) return callback(null, true); return callback(new Error(`Origin ${origin} is not allowed by MPL API CORS settings.`)); }, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }));
app.use(express.json({ limit: '12mb' }));
app.use('/uploads', express.static(uploadsDir, { maxAge: '1d', immutable: true }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 500, standardHeaders: 'draft-7', legacyHeaders: false }));

const registrationSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  phone: z.string().trim().min(8).max(18),
  age: z.coerce.number().int().min(14).max(60),
  city: z.string().trim().min(2).max(80),
  tournamentType: z.enum(['ground', 'turf']),
  role: z.enum(['Batter', 'Bowler', 'All-rounder', 'Wicketkeeper']),
  teamPreference: z.string().max(80).optional().default('No preference'),
  experience: z.enum(['Beginner', 'Intermediate', 'Advanced']),
  battingStyle: z.enum(['Right-hand', 'Left-hand', 'Not applicable']).optional().default('Not applicable'),
  bowlingStyle: z.string().max(60).optional().default('Not applicable'),
  message: z.string().max(500).optional().default(''),
  consent: z.literal(true)
});

const auctionActionSchema = z.object({ playerId: z.string().min(1), teamId: z.string().min(1).optional(), soldPrice: z.coerce.number().int().positive().optional(), basePrice: z.coerce.number().int().positive().optional(), notes: z.string().max(300).optional().default('') });
const settingsSchema = z.object({
  pursePerTeam: z.coerce.number().int().positive().max(1000000).optional(),
  basePrice: z.coerce.number().int().positive().max(100000).optional(),
  bidIncrement: z.coerce.number().int().positive().max(100000).optional(),
  maxSquadSize: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(['draft','open','paused','closed']).optional()
});
const siteSchema = z.object({
  tagline: z.string().trim().max(140).optional(),
  about: z.string().trim().max(1000).optional(),
  registrationOpen: z.boolean().optional(),
  contactEmail: z.union([z.string().trim().email().max(120), z.literal('')]).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  socials: z.object({
    instagram: z.union([z.string().url().max(300), z.literal('')]).optional(),
    youtube: z.union([z.string().url().max(300), z.literal('')]).optional(),
    whatsapp: z.union([z.string().url().max(300), z.literal('')]).optional()
  }).partial().optional()
}).partial();
const sponsorSchema = z.object({
  name: z.string().trim().min(2).max(90),
  tag: z.string().trim().max(100).optional().default(''),
  tier: z.string().trim().max(60).optional().default('Partner'),
  initials: z.string().trim().max(5).optional().default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#d9a21b'),
  imageUrl: z.string().trim().max(500).optional().default('').refine((value) => !value || value.startsWith('/assets/') || value.startsWith('/uploads/') || /^https:\/\//i.test(value)),
  linkUrl: z.string().trim().max(500).optional().default('').refine((value) => !value || /^https:\/\//i.test(value)),
  slideKind: z.enum(['logo','banner']).optional().default('logo'),
  active: z.boolean().optional().default(true)
});
const jerseySideSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  dataUrl: z.string().min(100).max(5_800_000)
});
const jerseyUploadSchema = z.object({
  front: jerseySideSchema.optional(),
  back: jerseySideSchema.optional()
}).refine((value) => value.front || value.back, { message: 'Upload at least one jersey side.' });
const teamSchema = z.object({
  name: z.string().trim().min(2).max(90),
  shortName: z.string().trim().min(1).max(8),
  logoUrl: z.string().trim().max(500).optional().default(''),
  type: z.enum(['ground','turf','both']).default('ground'),
  city: z.string().trim().max(80).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#d9a21b'),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#17130d'),
  captain: z.string().trim().max(80).optional().default(''),
  founded: z.coerce.number().int().min(1900).max(2100).optional().nullable()
});

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}
function normalizePlayerName(value = '') {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\(\s*(?:RHB|LHB|C|WK|C\s*&\s*WK)\s*\)/gi, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}
function adminOnly(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;
  const provided = req.header('x-admin-key');
  if (!expected || expected === 'change-this-to-a-long-random-secret') {
    return res.status(503).json({ error: 'Configure ADMIN_API_KEY in backend/.env before using organiser actions.' });
  }
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided || '');
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    return res.status(401).json({ error: 'Invalid organiser key.' });
  }
  next();
}
function parseSite() {
  const row = one("SELECT value FROM site_settings WHERE key='site'");
  return row ? JSON.parse(row.value) : {};
}
function mapTeam(row) {
  return row ? {
    id: row.id, name: row.name, shortName: row.short_name, logoUrl: row.logo_url || '', type: row.type, city: row.city,
    color: row.color, secondaryColor: row.secondary_color, captain: row.captain,
    played: row.played, won: row.won, lost: row.lost, tied: row.tied,
    points: row.points, nrr: row.nrr, founded: row.founded
  } : null;
}
function mapPlayer(row) {
  return {
    id: row.id, name: row.name, teamId: row.primary_team_id, role: row.role, age: row.age,
    profileImage: row.profile_image || '',
    type: row.type, matches: row.matches, runs: row.runs, ballsFaced: row.balls_faced,
    fours: row.fours, sixes: row.sixes, wickets: row.wickets, dotBalls: row.dot_balls,
    strikeRate: row.strike_rate, average: row.average, economy: row.economy, mvp: row.mvp,
    mvpRecorded: Boolean(row.mvp_recorded), jerseyNumber: row.jersey_number,
    sourceSeason: row.source_season
  };
}
function getTeams(type = '') {
  const rows = type
    ? all("SELECT * FROM teams WHERE type=? OR type='both' ORDER BY points DESC, won DESC, name COLLATE NOCASE", [type])
    : all('SELECT * FROM teams ORDER BY points DESC, won DESC, name COLLATE NOCASE');
  return rows.map(mapTeam);
}
function getPlayers({ type = '', teamId = '' } = {}) {
  const clauses=[]; const params=[];
  if (type) { clauses.push("(p.type=? OR p.type='both')"); params.push(type); }
  if (teamId) { clauses.push('(p.primary_team_id=? OR EXISTS (SELECT 1 FROM player_teams pt WHERE pt.player_id=p.id AND pt.team_id=?))'); params.push(teamId,teamId); }
  const rows=all(`SELECT p.* FROM players p ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY p.name COLLATE NOCASE`,params);
  return rows.map(mapPlayer);
}
function getStandings(type = '', season = '') {
  const format = ['ground','turf'].includes(type) ? type : '';
  const clauses=[]; const params=[];
  if(format){clauses.push('m.type=?');params.push(format);}
  if(season){clauses.push('m.season=?');params.push(season);}
  const matches=all(`SELECT m.id,m.result,m.team_a_id,m.team_b_id,m.match_date,m.type,m.season,
      COALESCE((SELECT MAX(t.overs) FROM tournaments t WHERE t.type=m.type AND t.season=m.season),8) AS allocated_overs
    FROM matches m ${clauses.length?`WHERE ${clauses.join(' AND ')}`:''}
    ORDER BY m.match_date,m.match_no`,params);
  const teams=getTeams(format);
  const table=new Map(teams.map((team)=>[team.id,{...team,played:0,won:0,lost:0,tied:0,points:0,runsFor:0,ballsFor:0,runsAgainst:0,ballsAgainst:0}]));
  const innings=all(`SELECT i.match_id,i.team_id,i.runs,i.wickets,i.overs,m.team_a_id,m.team_b_id,
      COALESCE((SELECT MAX(t.overs) FROM tournaments t WHERE t.type=m.type AND t.season=m.season),8) AS allocated_overs
    FROM innings i JOIN matches m ON m.id=i.match_id ${clauses.length?`WHERE ${clauses.join(' AND ')}`:''}
    ORDER BY i.match_id,i.sequence`,params);
  const inningsByMatch=new Map();
  for(const row of innings){const list=inningsByMatch.get(row.match_id)||[];list.push(row);inningsByMatch.set(row.match_id,list);}
  const toBalls=(overs)=>{const value=Number(overs)||0;const complete=Math.floor(value);const balls=Math.round((value-complete)*10);return complete*6+Math.min(5,Math.max(0,balls));};
  for(const match of matches){
    const teamA=table.get(match.team_a_id); const teamB=table.get(match.team_b_id);
    if(!teamA||!teamB)continue;
    teamA.played+=1;teamB.played+=1;
    const result=String(match.result||'').toLocaleLowerCase();
    let winner=null;
    if(result.includes(' won by ')){
      if(result.includes(teamA.name.toLocaleLowerCase()))winner=teamA;
      else if(result.includes(teamB.name.toLocaleLowerCase()))winner=teamB;
    }
    if(winner){winner.won+=1;winner.points+=2;(winner===teamA?teamB:teamA).lost+=1;}
    else if(/\b(tie|tied|draw)\b/.test(result)){teamA.tied+=1;teamB.tied+=1;teamA.points+=1;teamB.points+=1;}
    for(const inning of inningsByMatch.get(match.id)||[]){
      const batting=table.get(inning.team_id);
      const fielding=table.get(inning.team_id===match.team_a_id?match.team_b_id:match.team_a_id);
      if(!batting||!fielding)continue;
      const balls=inning.wickets>=10?Math.round(inning.allocated_overs*6):toBalls(inning.overs);
      batting.runsFor+=inning.runs;batting.ballsFor+=balls;
      fielding.runsAgainst+=inning.runs;fielding.ballsAgainst+=balls;
    }
  }
  return [...table.values()].map((team)=>{
    const oversFor=team.ballsFor/6;const oversAgainst=team.ballsAgainst/6;
    const nrr=oversFor>0&&oversAgainst>0?team.runsFor/oversFor-team.runsAgainst/oversAgainst:null;
    return {...team,nrr:nrr==null?null:Number(nrr.toFixed(3))};
  }).sort((a,b)=>b.points-a.points||(b.nrr??-Infinity)-(a.nrr??-Infinity)||a.name.localeCompare(b.name,'en'))
    .map((team,index)=>({rank:index+1,...team,runsFor:undefined,ballsFor:undefined,runsAgainst:undefined,ballsAgainst:undefined}));
}

const leaderboardMetrics = new Set(['mostRuns','mostWickets','mostDotBalls','mostSixes','mostFours','highestIndividualScore','bestBowlingFigures','mvp']);
function getLeaderboard({type='',season='',metric='mostRuns',limit=200}) {
  const format=['ground','turf'].includes(type)?type:'';
  const clauses=["p.normalized_name <> ''","trim(p.name) <> ''"];
  const params=[];
  if(format){clauses.push('m.type=?');params.push(format);}
  if(season){clauses.push('m.season=?');params.push(season);}
  const performanceWhere=clauses.join(' AND ');
  const maxRows=Math.max(1,Math.min(200,Number(limit)||200));
  let rows=[];

  if(['mostRuns','mostSixes','mostFours'].includes(metric)){
    const column=metric==='mostRuns'?'runs':metric==='mostSixes'?'sixes':'fours';
    rows=all(`SELECT p.id,p.name,COALESCE(p.primary_team_id,MAX(bp.team_id)) AS team_id,p.role,
        COUNT(DISTINCT m.id) AS matches,SUM(bp.runs) AS runs,SUM(bp.fours) AS fours,SUM(bp.sixes) AS sixes,
        SUM(bp.${column}) AS value
      FROM players p JOIN batting_performances bp ON bp.player_id=p.id
      JOIN matches m ON m.id=bp.match_id WHERE ${performanceWhere}
      GROUP BY p.id HAVING value>0 ORDER BY value DESC,runs DESC,p.name COLLATE NOCASE LIMIT ?`,[...params,maxRows]);
  } else if(['mostWickets','mostDotBalls'].includes(metric)){
    const column=metric==='mostWickets'?'wickets':'dot_balls';
    rows=all(`SELECT p.id,p.name,COALESCE(p.primary_team_id,MAX(bp.team_id)) AS team_id,p.role,
        COUNT(DISTINCT m.id) AS matches,SUM(bp.wickets) AS wickets,SUM(bp.dot_balls) AS dotBalls,
        SUM(bp.${column}) AS value
      FROM players p JOIN bowling_performances bp ON bp.player_id=p.id
      JOIN matches m ON m.id=bp.match_id WHERE ${performanceWhere}
      GROUP BY p.id HAVING value>0 ORDER BY value DESC,wickets DESC,p.name COLLATE NOCASE LIMIT ?`,[...params,maxRows]);
  } else if(metric==='highestIndividualScore'){
    rows=all(`SELECT p.id,p.name,COALESCE(p.primary_team_id,MAX(bp.team_id)) AS team_id,p.role,
        COUNT(DISTINCT m.id) AS matches,MAX(bp.runs) AS value,MAX(bp.fours) AS fours,MAX(bp.sixes) AS sixes
      FROM players p JOIN batting_performances bp ON bp.player_id=p.id
      JOIN matches m ON m.id=bp.match_id WHERE ${performanceWhere}
      GROUP BY p.id HAVING value>0 ORDER BY value DESC,p.name COLLATE NOCASE LIMIT ?`,[...params,maxRows]);
  } else if(metric==='bestBowlingFigures'){
    rows=all(`WITH ranked AS (
      SELECT p.id,p.name,COALESCE(p.primary_team_id,bp.team_id) AS team_id,p.role,bp.wickets AS value,
        bp.runs_conceded AS runsConceded,bp.overs,bp.dot_balls AS dotBalls,m.id AS match_id,
        ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY bp.wickets DESC,bp.runs_conceded ASC,bp.legal_balls DESC,m.match_date ASC) AS choice
      FROM players p JOIN bowling_performances bp ON bp.player_id=p.id
      JOIN matches m ON m.id=bp.match_id WHERE ${performanceWhere} AND bp.wickets>0
    ) SELECT ranked.id,ranked.name,ranked.team_id,ranked.role,
        (SELECT COUNT(DISTINCT m2.id) FROM bowling_performances bp2
          JOIN matches m2 ON m2.id=bp2.match_id WHERE bp2.player_id=ranked.id
          ${format?"AND m2.type=?":""} ${season?'AND m2.season=?':''}) AS matches,
        ranked.value,ranked.runsConceded,ranked.overs,ranked.dotBalls FROM ranked
      WHERE choice=1 ORDER BY value DESC,runsConceded ASC,name COLLATE NOCASE LIMIT ?`,
      [...params,...(format?[format]:[]),...(season?[season]:[]),maxRows]);
  } else if(metric==='mvp'){
    const awardClauses=["p.normalized_name <> ''","trim(p.name) <> ''",'p.mvp_recorded=1','p.mvp>0'];
    const awardParams=[];
    if(format){awardClauses.push("(p.type=? OR p.type='both')");awardParams.push(format);}
    if(season){awardClauses.push('p.source_season=?');awardParams.push(season);}
    rows=all(`SELECT p.id,p.name,p.primary_team_id AS team_id,p.role,p.matches,p.mvp AS value
      FROM players p WHERE ${awardClauses.join(' AND ')}
      ORDER BY value DESC,p.name COLLATE NOCASE LIMIT ?`,[...awardParams,maxRows]);
  }
  return rows.map((row,index)=>({id:row.id,name:row.name,teamId:row.team_id,team:getTeam(row.team_id),role:row.role,
    matches:row.matches,value:row.value,runs:row.runs||0,wickets:row.wickets||0,dotBalls:row.dotBalls||0,
    fours:row.fours||0,sixes:row.sixes||0,runsConceded:row.runsConceded??null,overs:row.overs??null,rank:index+1}));
}
function getTeam(teamId) { return mapTeam(one('SELECT * FROM teams WHERE id=?',[teamId])); }
function mapTournament(row) {
  return { id:row.id,type:row.type,name:row.name,season:row.season,year:row.year,format:row.format,
    description:row.description,overs:row.overs,teamSize:row.team_size,registrationStatus:row.registration_status,
    startDate:row.start_date,endDate:row.end_date || null };
}
function mapSponsor(row) {
  return { id:row.id,name:row.name,tag:row.tag,tier:row.tier,initials:row.initials,color:row.color,
    imageUrl:row.image_url || '',linkUrl:row.link_url || '',slideKind:row.slide_kind || 'logo',active:Boolean(row.active) };
}
function getJerseys(teamId = '') {
  const rows=all(`SELECT team_id,side,image_url,file_name,original_name,mime_type,uploaded_at
    FROM team_jersey_assets ${teamId?'WHERE team_id=?':''} ORDER BY team_id,side`,teamId?[teamId]:[]);
  const jerseys=new Map();
  for(const row of rows){
    const jersey=jerseys.get(row.team_id) || {teamId:row.team_id,front:null,back:null,frontImageUrl:'',backImageUrl:'',imageUrl:''};
    const asset={imageUrl:row.image_url,originalName:row.original_name,mimeType:row.mime_type,uploadedAt:row.uploaded_at};
    jersey[row.side]=asset;
    jersey[`${row.side}ImageUrl`]=row.image_url;
    if(row.side==='front') jersey.imageUrl=row.image_url;
    jerseys.set(row.team_id,jersey);
  }
  return [...jerseys.values()];
}
function getAuctionSettings() {
  const row=one('SELECT * FROM auction_settings WHERE id=1');
  return row ? { season:row.season,status:row.status,pursePerTeam:row.purse_per_team,
    basePrice:row.base_price,bidIncrement:row.bid_increment,maxSquadSize:row.max_squad_size,
    currencyLabel:row.currency_label } : null;
}
function addEvent({ season, playerId, teamId = null, eventType, amount = null, notes = '' }) {
  run('INSERT INTO auction_events(id,season,player_id,team_id,event_type,amount,notes) VALUES (?,?,?,?,?,?,?)',
    [randomUUID(),season,playerId,teamId,eventType,amount,notes]);
}
function findOrCreatePlayer({ fullName, tournamentType, role = 'Player', age = null }) {
  const normalized=normalizePlayerName(fullName);
  if (!normalized) throw new Error('Enter a valid player name.');
  let player=one('SELECT * FROM players WHERE normalized_name=?',[normalized]);
  if (player) {
    if (player.type !== tournamentType && player.type !== 'both') {
      run("UPDATE players SET type='both', age=COALESCE(age,?), role=CASE WHEN role='Player' THEN ? ELSE role END WHERE id=?",
        [age,role,player.id]);
      player=one('SELECT * FROM players WHERE id=?',[player.id]);
    } else if (player.age == null && age != null) {
      run('UPDATE players SET age=? WHERE id=?',[age,player.id]);
      player=one('SELECT * FROM players WHERE id=?',[player.id]);
    }
    return { player, created:false };
  }
  const id=`p-${randomUUID()}`;
  run(`INSERT INTO players(id,name,normalized_name,role,age,type,source_season)
    VALUES (?,?,?,?,?,?,'Registration')`,[id,fullName.trim(),normalized,role,age,tournamentType]);
  const settings=getAuctionSettings();
  run(`INSERT OR IGNORE INTO auction_players(season,player_id,base_price,status)
    VALUES (?,?,?,'pending')`,[settings.season,id,settings.basePrice]);
  return { player:one('SELECT * FROM players WHERE id=?',[id]), created:true };
}

function verifyImageSignature(buffer, mimeType) {
  if (mimeType === 'image/png') return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mimeType === 'image/jpeg') return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/webp') return buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
}
function jerseyExtension(mimeType) {
  return mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
}
function mapJersey(row) {
  return row ? { teamId: row.team_id, imageUrl: row.image_url, originalName: row.original_name, mimeType: row.mime_type, uploadedAt: row.uploaded_at } : null;
}

app.get('/api/health', (_req, res, next) => {
  try {
    const db = getDatabaseStatus();
    if (db.integrity !== 'ok') return res.status(503).json({ status:'error', service:'mpl-api', database:'disconnected', integrity:db.integrity });
    res.json({ status:'ok', service:'mpl-api', database:'connected', connected:true, engine:'sqlite', sqliteVersion:db.sqliteVersion,
      counts:db.counts, time:new Date().toISOString() });
  } catch (error) { next(error); }
});
app.get('/api/site', (_req,res) => {
  res.json({ site:parseSite(),sponsors:all('SELECT * FROM sponsors WHERE active=1 ORDER BY created_at DESC').map(mapSponsor),
    tournaments:all('SELECT * FROM tournaments ORDER BY year DESC, id').map(mapTournament) });
});
app.get('/api/sponsors', (_req,res) => res.json(all('SELECT * FROM sponsors WHERE active=1 ORDER BY created_at DESC').map(mapSponsor)));
app.get('/api/tournaments', (req,res) => {
  const {type}=req.query;
  if(type && !['ground','turf','overall'].includes(type))return res.status(400).json({error:'Type must be ground, turf, or overall.'});
  const params=type?[type]:[];
  const where=type&&type!=='overall';
  res.json(all(`SELECT * FROM tournaments ${where?'WHERE type=?':''} ORDER BY year DESC,id`,where?params:[]).map(mapTournament));
});
app.get('/api/teams', (req,res) => res.json(getTeams(req.query.type || '')));
app.get('/api/jerseys', (_req,res) => {
  res.json(getJerseys());
});
app.get('/api/jerseys/:teamId', (req,res) => {
  const jersey=getJerseys(req.params.teamId)[0];
  if(!jersey)return res.status(404).json({error:'No jersey artwork has been uploaded for this team yet.'});
  res.json(jersey);
});

app.get('/api/players', (req,res) => res.json(getPlayers({type:req.query.type || '',teamId:req.query.teamId || ''})));
app.get('/api/matches', (req,res) => {
  const {status,limit}=req.query; const clauses=[]; const params=[];
  const type=String(req.query.type||'');const season=String(req.query.season||'');
  if(type&&!['ground','turf','overall'].includes(type))return res.status(400).json({error:'Type must be ground, turf, or overall.'});
  if(season&&!/^Season \d{1,2}$/.test(season))return res.status(400).json({error:'Season must use the format “Season 1”.'});
  if(type&&type!=='overall'){clauses.push('m.type=?');params.push(type);} if(season){clauses.push('m.season=?');params.push(season);} if(status){clauses.push('m.status=?');params.push(status);}
  let rows=all(`SELECT m.* FROM matches m ${clauses.length?`WHERE ${clauses.join(' AND ')}`:''} ORDER BY m.match_date,m.match_time,m.match_no`,params);
  if(limit) rows=rows.slice(0,Math.max(1,Math.min(200,Number(limit)||20)));
  res.json(rows.map(m=>({...m,id:m.id,type:m.type,season:m.season,tournament:m.tournament,matchNo:m.match_no,stage:m.stage,
    teamAId:m.team_a_id,teamBId:m.team_b_id,date:m.match_date,time:m.match_time,venue:m.venue,status:m.status,
    scoreA:m.score_a,scoreB:m.score_b,teamA:getTeam(m.team_a_id),teamB:getTeam(m.team_b_id)})));
});
app.get('/api/standings', (req,res) => {
  const type=String(req.query.type||'');const season=String(req.query.season||'');
  if(type&&!['ground','turf','overall'].includes(type))return res.status(400).json({error:'Type must be ground, turf, or overall.'});
  if(season&&!/^Season \d{1,2}$/.test(season))return res.status(400).json({error:'Season must use the format “Season 1”.'});
  res.json(getStandings(type,season));
});
app.get('/api/leaderboards', (req,res) => {
  const metric=String(req.query.metric||'mostRuns');const type=String(req.query.type||'overall');const season=String(req.query.season||'');
  if(!leaderboardMetrics.has(metric))return res.status(400).json({error:'Choose a supported leaderboard metric.'});
  if(!['ground','turf','overall'].includes(type))return res.status(400).json({error:'Type must be ground, turf, or overall.'});
  if(season&&!/^Season \d{1,2}$/.test(season))return res.status(400).json({error:'Season must use the format “Season 1”.'});
  const rows=getLeaderboard({type,season,metric,limit:req.query.limit});
  res.json(rows);
});

app.post('/api/registrations', (req,res,next) => {
  try {
    const parsed=registrationSchema.safeParse(req.body);
    if(!parsed.success) return res.status(400).json({error:'Please check the form fields.',details:parsed.error.flatten().fieldErrors});
    const input=parsed.data; const site=parseSite();
    const tournament=one('SELECT id FROM tournaments WHERE season=? AND type=? ORDER BY year DESC LIMIT 1',['Season 2',input.tournamentType]);
    if(!tournament || !site.registrationOpen) return res.status(409).json({error:'Registrations are currently closed.'});
    if(one('SELECT id FROM registrations WHERE lower(email)=lower(?) AND tournament_type=?',[input.email,input.tournamentType])) return res.status(409).json({error:'This email is already registered for this tournament.'});
    let registrationId=randomUUID(); let playerResult;
    transaction(()=>{
      playerResult=findOrCreatePlayer({fullName:input.fullName,tournamentType:input.tournamentType,role:input.role,age:input.age});
      run(`INSERT INTO registrations(id,player_id,full_name,email,phone,age,city,tournament_type,role,
        team_preference,experience,batting_style,bowling_style,message,consent,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,'Pending')`,[
        registrationId,playerResult.player.id,input.fullName,input.email.toLowerCase(),input.phone,input.age,
        input.city,input.tournamentType,input.role,input.teamPreference,input.experience,input.battingStyle,
        input.bowlingStyle,input.message
      ]);
    });
    res.status(201).json({message:'Registration received. The MPL team will contact you with next steps.',registrationId,playerId:playerResult.player.id,playerCreated:playerResult.created});
  }catch(error){next(error);}
});

// Public auction board. Mutation endpoints below are organiser-key protected.
app.get('/api/auction/summary', (_req,res) => {
  const settings=getAuctionSettings(); const season=settings.season;
  const statusCounts=one(`SELECT COUNT(*) AS totalPlayers,
    SUM(CASE WHEN status='sold' THEN 1 ELSE 0 END) AS totalPlayersSold,
    SUM(CASE WHEN status='unsold' THEN 1 ELSE 0 END) AS playersUnsold,
    SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS playersPending,
    SUM(CASE WHEN status='nominated' THEN 1 ELSE 0 END) AS playersNominated
    FROM auction_players WHERE season=?`,[season]);
  const spend=one('SELECT COALESCE(SUM(points_spent),0) AS totalPointsSpent FROM auction_team_wallets WHERE season=?',[season]);
  const wallets=all(`SELECT w.*,t.name,t.short_name,t.color,t.secondary_color,t.captain
    FROM auction_team_wallets w JOIN teams t ON t.id=w.team_id WHERE w.season=?
    ORDER BY w.purse_remaining DESC,t.name COLLATE NOCASE`,[season]);
  const current=one(`SELECT ap.*,p.name,p.normalized_name,p.runs,p.wickets,p.dot_balls,p.matches,p.strike_rate,p.average,p.economy
    FROM auction_players ap JOIN players p ON p.id=ap.player_id WHERE ap.season=? AND ap.status='nominated' LIMIT 1`,[season]);
  res.json({settings,totals:{...statusCounts,totalPointsSpent:spend.totalPointsSpent||0},
    currentPlayer:current?{playerId:current.player_id,name:current.name,basePrice:current.base_price,status:current.status,
      runs:current.runs,wickets:current.wickets,dotBalls:current.dot_balls,matches:current.matches,
      strikeRate:current.strike_rate,average:current.average,economy:current.economy}:null,
    teams:wallets.map(w=>({teamId:w.team_id,name:w.name,shortName:w.short_name,color:w.color,captain:w.captain,
      purseTotal:w.starting_purse,purseRemaining:w.purse_remaining,pointsSpent:w.points_spent,playersSold:w.players_sold}))});
});
app.get('/api/auction/players', (req,res) => {
  const settings=getAuctionSettings(); const clauses=['ap.season=?']; const params=[settings.season];
  if(req.query.status && ['pending','unsold','nominated','sold'].includes(req.query.status)){clauses.push('ap.status=?');params.push(req.query.status);}
  if(req.query.search){clauses.push('(p.name LIKE ? OR pt.name LIKE ? OR sold_team.name LIKE ?)');params.push(`%${req.query.search}%`,`%${req.query.search}%`,`%${req.query.search}%`);}
  const rows=all(`SELECT ap.*,p.name,p.role,p.matches,p.runs,p.wickets,p.dot_balls,p.strike_rate,p.average,p.economy,
    p.primary_team_id,historical.team_id AS historical_team_id,pt.name AS previous_team_name,sold_team.name AS sold_team_name
    FROM auction_players ap JOIN players p ON p.id=ap.player_id
    LEFT JOIN player_teams historical ON historical.player_id=p.id AND historical.season='Season 1' AND historical.is_primary=1
    LEFT JOIN teams pt ON pt.id=historical.team_id LEFT JOIN teams sold_team ON sold_team.id=ap.sold_to_team_id
    WHERE ${clauses.join(' AND ')} ORDER BY CASE ap.status WHEN 'nominated' THEN 0 WHEN 'pending' THEN 1 WHEN 'unsold' THEN 2 ELSE 3 END,p.name COLLATE NOCASE`,params);
  res.json(rows.map(p=>({playerId:p.player_id,name:p.name,role:p.role,status:p.status,basePrice:p.base_price,
    soldPrice:p.sold_price,soldToTeamId:p.sold_to_team_id,soldToTeam:p.sold_team_name,
    previousTeamId:p.historical_team_id || p.primary_team_id,previousTeam:p.previous_team_name,matches:p.matches,runs:p.runs,
    wickets:p.wickets,dotBalls:p.dot_balls,strikeRate:p.strike_rate,average:p.average,economy:p.economy,
    nominationNumber:p.nomination_number})));
});
app.get('/api/auction/events', (req,res) => {
  const season=getAuctionSettings().season;
  const events=all(`SELECT e.*,p.name AS player_name,t.name AS team_name FROM auction_events e
    JOIN players p ON p.id=e.player_id LEFT JOIN teams t ON t.id=e.team_id
    WHERE e.season=? ORDER BY e.created_at DESC LIMIT 100`,[season]);
  res.json(events.map(e=>({id:e.id,playerId:e.player_id,playerName:e.player_name,teamId:e.team_id,
    teamName:e.team_name,eventType:e.event_type,amount:e.amount,notes:e.notes,createdAt:e.created_at})));
});

app.post('/api/auction/nominate', adminOnly, (req,res) => {
  const parsed=auctionActionSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid nomination request.'});
  const {playerId,basePrice,notes}=parsed.data; const settings=getAuctionSettings();
  if(settings.status!=='open')return res.status(409).json({error:'The auction is not open for nominations.'});
  const player=one('SELECT status,base_price FROM auction_players WHERE season=? AND player_id=?',[settings.season,playerId]);
  if(!player)return res.status(404).json({error:'Player is not in this season auction pool.'});
  if(!['pending','unsold'].includes(player.status))return res.status(409).json({error:'This player is not available to nominate.'});
  if(one("SELECT player_id FROM auction_players WHERE season=? AND status='nominated'",[settings.season]))return res.status(409).json({error:'Finish the current nomination before nominating another player.'});
  const price=basePrice ?? player.base_price;
  if(price<settings.basePrice || price%settings.bidIncrement!==settings.basePrice%settings.bidIncrement)return res.status(400).json({error:`Base price must be at least ${settings.basePrice} and follow ${settings.bidIncrement}-point increments.`});
  transaction(()=>{
    const number=(one('SELECT COUNT(*) AS n FROM auction_events WHERE season=? AND event_type=\'nominated\'',[settings.season])?.n||0)+1;
    const changed=run(`UPDATE auction_players SET status='nominated',base_price=?,nomination_number=?,nominated_at=CURRENT_TIMESTAMP
      WHERE season=? AND player_id=? AND status IN ('pending','unsold')`,[price,number,settings.season,playerId]);
    if(changed.changes!==1) throw conflict('This player is no longer available for nomination. Refresh the auction list.');
    addEvent({season:settings.season,playerId,eventType:'nominated',amount:price,notes});
  });
  res.json({message:'Player nominated.',playerId,basePrice:price});
});

app.post('/api/auction/sell', adminOnly, (req,res) => {
  const parsed=auctionActionSchema.safeParse(req.body);
  if(!parsed.success || !parsed.data.teamId || !parsed.data.soldPrice)return res.status(400).json({error:'Choose a team and enter a valid sold price.'});
  const {playerId,teamId,soldPrice,notes}=parsed.data; const settings=getAuctionSettings();
  if(settings.status!=='open')return res.status(409).json({error:'The auction is not open for sales.'});
  const player=one('SELECT * FROM auction_players WHERE season=? AND player_id=?',[settings.season,playerId]);
  if(!player)return res.status(404).json({error:'Player not found in the auction pool.'});
  if(player.status!=='nominated')return res.status(409).json({error:'Only the currently nominated player can be sold.'});
  if(soldPrice<player.base_price || (soldPrice-player.base_price)%settings.bidIncrement!==0)return res.status(400).json({error:`Sold price must be at least the base price and follow ${settings.bidIncrement}-point increments.`});
  const wallet=one('SELECT * FROM auction_team_wallets WHERE season=? AND team_id=?',[settings.season,teamId]);
  if(!wallet)return res.status(404).json({error:'Auction team not found.'});
  if(wallet.purse_remaining<soldPrice)return res.status(409).json({error:'This team does not have enough purse points.'});
  if(wallet.players_sold>=settings.maxSquadSize)return res.status(409).json({error:'This team has reached the squad size limit.'});
  transaction(()=>{
    const walletUpdate=run(`UPDATE auction_team_wallets SET purse_remaining=purse_remaining-?,points_spent=points_spent+?,
      players_sold=players_sold+1 WHERE season=? AND team_id=? AND purse_remaining>=? AND players_sold<?`,
      [soldPrice,soldPrice,settings.season,teamId,soldPrice,settings.maxSquadSize]);
    if(walletUpdate.changes!==1) throw conflict('The team purse or squad capacity changed. Refresh the auction and try again.');
    const playerUpdate=run(`UPDATE auction_players SET status='sold',sold_to_team_id=?,sold_price=?,sold_at=CURRENT_TIMESTAMP
      WHERE season=? AND player_id=? AND status='nominated'`,[teamId,soldPrice,settings.season,playerId]);
    if(playerUpdate.changes!==1) throw conflict('This player is no longer nominated. Refresh the auction and try again.');
    run(`INSERT OR IGNORE INTO player_teams(player_id,team_id,season,appearances,is_primary) VALUES (?,?,?,0,1)`,[playerId,teamId,'Season 2']);
    addEvent({season:settings.season,playerId,teamId,eventType:'sold',amount:soldPrice,notes});
  });
  res.json({message:'Player sold successfully.',playerId,teamId,soldPrice});
});

app.post('/api/auction/mark-unsold', adminOnly, (req,res) => {
  const parsed=auctionActionSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid player selection.'});
  const {playerId,notes}=parsed.data;const settings=getAuctionSettings();
  if(settings.status!=='open')return res.status(409).json({error:'The auction is not open for player actions.'});
  const player=one('SELECT status FROM auction_players WHERE season=? AND player_id=?',[settings.season,playerId]);
  if(!player)return res.status(404).json({error:'Player not found.'});
  if(player.status!=='nominated')return res.status(409).json({error:'Only a nominated player can be marked unsold.'});
  transaction(()=>{
    const changed=run(`UPDATE auction_players SET status='unsold',nominated_at=NULL WHERE season=? AND player_id=? AND status='nominated'`,[settings.season,playerId]);
    if(changed.changes!==1) throw conflict('This player is no longer nominated. Refresh the auction and try again.');
    addEvent({season:settings.season,playerId,eventType:'unsold',notes});
  });
  res.json({message:'Player marked unsold.',playerId});
});

app.patch('/api/auction/settings', adminOnly, (req,res) => {
  const parsed=settingsSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid auction settings.',details:parsed.error.flatten().fieldErrors});
  const current=getAuctionSettings();const next={...current,...parsed.data};
  const highestSquad=one('SELECT COALESCE(MAX(players_sold),0) AS value FROM auction_team_wallets WHERE season=?',[current.season]).value;
  if(next.maxSquadSize<highestSquad)return res.status(409).json({error:'The squad limit cannot be lower than a team already-sold player count.'});
  if(next.pursePerTeam<current.pursePerTeam){
    const highestSpent=one('SELECT COALESCE(MAX(points_spent),0) AS value FROM auction_team_wallets WHERE season=?',[current.season]).value;
    if(next.pursePerTeam<highestSpent)return res.status(409).json({error:'The new purse cannot be lower than points already spent by a team.'});
  }
  transaction(()=>{
    if(next.pursePerTeam!==current.pursePerTeam){
      const delta=next.pursePerTeam-current.pursePerTeam;
      run('UPDATE auction_team_wallets SET starting_purse=?,purse_remaining=purse_remaining+? WHERE season=?',
        [next.pursePerTeam,delta,current.season]);
    }
    run(`UPDATE auction_settings SET purse_per_team=?,base_price=?,bid_increment=?,max_squad_size=?,status=? WHERE id=1`,
      [next.pursePerTeam,next.basePrice,next.bidIncrement,next.maxSquadSize,next.status]);
    run(`UPDATE auction_players SET base_price=? WHERE season=? AND status IN ('pending','unsold')`,[next.basePrice,current.season]);
    addEvent({season:current.season,playerId:one('SELECT player_id FROM auction_players WHERE season=? LIMIT 1',[current.season]).player_id,
      eventType:'settings_updated',amount:next.pursePerTeam,notes:'Auction settings updated'});
  });
  res.json({message:'Auction settings saved.',settings:getAuctionSettings()});
});

// Organiser data endpoints. Duplicate players are rejected using normalized_name UNIQUE.
app.patch('/api/admin/site', adminOnly, (req,res) => {
  const parsed=siteSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid site settings.',details:parsed.error.flatten().fieldErrors});
  const current=parseSite();
  const next={...current,...parsed.data,socials:{...(current.socials||{}),...(parsed.data.socials||{})}};
  run("UPDATE site_settings SET value=? WHERE key='site'",[JSON.stringify(next)]);
  res.json(next);
});
app.get('/api/admin/registrations', adminOnly, (_req,res) => res.json(all('SELECT * FROM registrations ORDER BY created_at DESC')));
app.get('/api/admin/import-info', adminOnly, (_req,res) => res.json(one('SELECT * FROM source_imports ORDER BY imported_at DESC LIMIT 1')));
app.get('/api/admin/players', adminOnly, (_req,res) => res.json(getPlayers()));
app.post('/api/admin/players', adminOnly, (req,res) => {
  const name=String(req.body.name||'').trim();const normalized=normalizePlayerName(name);
  if(name.length<2 || !normalized)return res.status(400).json({error:'Enter a valid player name with at least two letters or numbers.'});
  const existing=one('SELECT id,name FROM players WHERE normalized_name=?',[normalized]);
  if(existing)return res.status(409).json({error:`${existing.name} is already in the database.`,existingPlayerId:existing.id});
  const id=`p-${randomUUID()}`;const type=['ground','turf','both'].includes(req.body.type)?req.body.type:'ground';
  const settings=getAuctionSettings();
  transaction(()=>{
    run(`INSERT INTO players(id,name,normalized_name,role,age,type,source_season) VALUES (?,?,?,?,?,?,?)`,
      [id,name,normalized,req.body.role||'Player',Number(req.body.age)||null,type,req.body.sourceSeason||'Manual']);
    run(`INSERT INTO auction_players(season,player_id,base_price,status) VALUES (?,?,?,'pending')`,[settings.season,id,settings.basePrice]);
  });
  res.status(201).json(mapPlayer(one('SELECT * FROM players WHERE id=?',[id])));
});
app.get('/api/admin/teams', adminOnly, (_req,res) => res.json(getTeams()));
app.post('/api/admin/teams', adminOnly, (req,res) => {
  const parsed=teamSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid team details.',details:parsed.error.flatten().fieldErrors});
  const input=parsed.data;const id=`team-${randomUUID()}`;const settings=getAuctionSettings();
  try {
    transaction(()=>{
      run(`INSERT INTO teams(id,name,short_name,logo_url,type,city,color,secondary_color,captain,played,won,lost,tied,points,nrr,founded)
        VALUES (?,?,?,?,?,?,?,?,?,0,0,0,0,0,NULL,?)`,[id,input.name,input.shortName,input.logoUrl,input.type,input.city||null,input.color,input.secondaryColor,input.captain,input.founded||null]);
      run(`INSERT INTO auction_team_wallets(season,team_id,starting_purse,purse_remaining,points_spent,players_sold)
        VALUES (?,?,?, ?,0,0)`,[settings.season,id,settings.pursePerTeam,settings.pursePerTeam]);
    });
  } catch(error) {
    if(String(error.code||'').includes('SQLITE_CONSTRAINT'))return res.status(409).json({error:'A team with this name already exists.'});
    throw error;
  }
  res.status(201).json(getTeam(id));
});
app.patch('/api/admin/teams/:id', adminOnly, (req,res) => {
  const parsed=teamSchema.partial().safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid team details.',details:parsed.error.flatten().fieldErrors});
  const fields={name:'name',shortName:'short_name',logoUrl:'logo_url',type:'type',city:'city',color:'color',secondaryColor:'secondary_color',captain:'captain',founded:'founded'};
  const entries=Object.entries(parsed.data).filter(([key])=>fields[key]);
  if(!entries.length)return res.status(400).json({error:'No team fields provided.'});
  if(!getTeam(req.params.id))return res.status(404).json({error:'Team not found.'});
  try {
    run(`UPDATE teams SET ${entries.map(([key])=>`${fields[key]}=?`).join(',')} WHERE id=?`,[...entries.map(([key,value])=>value),req.params.id]);
  } catch(error) {
    if(String(error.code||'').includes('SQLITE_CONSTRAINT'))return res.status(409).json({error:'A team with this name already exists.'});
    throw error;
  }
  res.json(getTeam(req.params.id));
});
app.post('/api/admin/teams/:id/jersey', adminOnly, (req,res,next) => {
  const savedPaths=[];
  try {
    const team=getTeam(req.params.id);
    if(!team)return res.status(404).json({error:'Team not found.'});
    const payload=req.body?.front || req.body?.back ? req.body : {front:req.body};
    const parsed=jerseyUploadSchema.safeParse(payload);
    if(!parsed.success)return res.status(400).json({error:'Choose a PNG, JPG or WebP image under 4 MB for at least one jersey side.'});
    const preparedAssets=[];
    for(const side of ['front','back']){
      const input=parsed.data[side];
      if(!input)continue;
      const match=input.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
      if(!match || match[1]!==input.mimeType)return res.status(400).json({error:`The ${side} image does not match its declared file type.`});
      const buffer=Buffer.from(match[2],'base64');
      if(buffer.length>4*1024*1024)return res.status(413).json({error:`The ${side} jersey image must be 4 MB or smaller.`});
      if(!verifyImageSignature(buffer,input.mimeType))return res.status(400).json({error:`The ${side} file is not a valid PNG, JPG or WebP image.`});
      preparedAssets.push({side,buffer,originalName:input.fileName.replace(/[\\/]/g,'_'),mimeType:input.mimeType});
    }
    const newAssets=[];
    try {
      for(const asset of preparedAssets){
        const fileName=`${randomUUID()}.${jerseyExtension(asset.mimeType)}`;
        const savedPath=path.join(jerseyUploadsDir,fileName);
        fs.writeFileSync(savedPath,asset.buffer,{flag:'wx'});
        savedPaths.push(savedPath);
        newAssets.push({...asset,fileName,imageUrl:`/uploads/jerseys/${fileName}`});
      }
    } catch(error) {
      for(const file of savedPaths)try { fs.unlinkSync(file); } catch { /* best effort cleanup */ }
      throw error;
    }
    const previous=all('SELECT side,file_name FROM team_jersey_assets WHERE team_id=?',[team.id]);
    try {
      transaction(()=>{
        for(const asset of newAssets)run(`INSERT INTO team_jersey_assets
          (team_id,side,image_url,file_name,original_name,mime_type,uploaded_at)
          VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
          ON CONFLICT(team_id,side) DO UPDATE SET image_url=excluded.image_url,file_name=excluded.file_name,
            original_name=excluded.original_name,mime_type=excluded.mime_type,uploaded_at=CURRENT_TIMESTAMP`,
          [team.id,asset.side,asset.imageUrl,asset.fileName,asset.originalName,asset.mimeType]);
      });
    } catch(error) {
      for(const file of savedPaths)try { fs.unlinkSync(file); } catch { /* best effort cleanup */ }
      throw error;
    }
    const replaced=new Set(newAssets.map((asset)=>asset.side));
    for(const old of previous.filter((asset)=>replaced.has(asset.side))){
      const oldPath=path.join(jerseyUploadsDir,path.basename(old.file_name));
      if(!savedPaths.includes(oldPath) && fs.existsSync(oldPath))try { fs.unlinkSync(oldPath); } catch { /* old upload cleanup best effort */ }
    }
    res.status(201).json({message:'Team jersey artwork saved.',jersey:getJerseys(team.id)[0]});
  } catch(error) { next(error); }
});
app.get('/api/admin/sponsors', adminOnly, (_req,res) => res.json(all('SELECT * FROM sponsors ORDER BY created_at DESC').map(mapSponsor)));
app.post('/api/admin/sponsors', adminOnly, (req,res) => {
  const parsed=sponsorSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid sponsor details.',details:parsed.error.flatten().fieldErrors});
  const input=parsed.data;const id=`s-${randomUUID()}`;
  run(`INSERT INTO sponsors(id,name,tag,tier,initials,color,image_url,link_url,slide_kind,active)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,[id,input.name,input.tag,input.tier,input.initials||input.name.slice(0,2).toUpperCase(),
    input.color,input.imageUrl,input.linkUrl,input.slideKind,input.active?1:0]);
  res.status(201).json(mapSponsor(one('SELECT * FROM sponsors WHERE id=?',[id])));
});
app.patch('/api/admin/sponsors/:id', adminOnly, (req,res) => {
  const parsed=sponsorSchema.partial().safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid sponsor details.',details:parsed.error.flatten().fieldErrors});
  const fields={name:'name',tag:'tag',tier:'tier',initials:'initials',color:'color',imageUrl:'image_url',linkUrl:'link_url',slideKind:'slide_kind',active:'active'};
  const entries=Object.entries(parsed.data).filter(([key])=>fields[key]);
  if(!entries.length)return res.status(400).json({error:'No sponsor fields provided.'});
  if(!one('SELECT id FROM sponsors WHERE id=?',[req.params.id]))return res.status(404).json({error:'Sponsor not found.'});
  run(`UPDATE sponsors SET ${entries.map(([key])=>`${fields[key]}=?`).join(',')} WHERE id=?`,[
    ...entries.map(([key,value])=>key==='active'?(value?1:0):value),req.params.id]);
  res.json(mapSponsor(one('SELECT * FROM sponsors WHERE id=?',[req.params.id])));
});
app.delete('/api/admin/sponsors/:id', adminOnly, (req,res) => {
  const result=run('DELETE FROM sponsors WHERE id=?',[req.params.id]);
  if(result.changes!==1)return res.status(404).json({error:'Sponsor not found.'});
  res.status(204).end();
});
app.get('/api/admin/auction-events', adminOnly, (_req,res) => res.json(all('SELECT * FROM auction_events ORDER BY created_at DESC LIMIT 500')));

if (fs.existsSync(frontendDistDir)) {
  app.use(express.static(frontendDistDir));
  app.get('*', (req, res, next) => {
    if (/^\/(api|uploads)(\/|$)/.test(req.path)) return next();
    res.sendFile(path.join(frontendDistDir, 'index.html'), (error) => { if (error) next(error); });
  });
}

app.use((err,_req,res,_next)=>{
  console.error(err);
  const isConstraint=String(err.code||'').includes('SQLITE_CONSTRAINT');
  const status=err.status || (isConstraint?409:500);
  res.status(status).json({error:isConstraint?'This record conflicts with an existing database record.':process.env.NODE_ENV==='production'?'An unexpected error occurred.':err.message});
});

let startup;
try {
  startup = await initStore();
} catch (error) {
  console.error('MPL database startup failed. The API was not started.');
  console.error(error);
  process.exit(1);
}
const server=app.listen(port,()=>{
  console.log(`MPL API listening on http://127.0.0.1:${port}`);
  console.log(`SQLite connected: ${startup.databaseFile}`);
  console.log(`Database records: ${startup.counts.players} players, ${startup.counts.teams} teams, ${startup.counts.matches} matches`);
});
function shutdown(){server.close(()=>{closeStore();process.exit(0);});}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
