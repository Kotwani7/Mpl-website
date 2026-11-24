import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  Archive, ArrowRight, ArrowUpRight, Award, CalendarDays, ChevronDown, ChevronLeft,
  ChevronRight, CircleDot, Instagram, Menu, Shield, Trophy, Users, Youtube, X,
  Zap, Target, Activity, MapPin, Clock3, Medal, BarChart3, Sparkles, Shirt, Gavel, UserPlus
} from 'lucide-react';
import SectionHeading from './components/SectionHeading';
import SponsorCarousel from './components/SponsorCarousel';
import RegistrationForm from './components/RegistrationForm';
import AuctionRoom from './components/AuctionRoom';
import { api } from './lib/api';

const metrics = [
  { id: 'mostRuns', label: 'Most Runs', short: 'RUNS', icon: Target, unit: 'runs' },
  { id: 'mostWickets', label: 'Most Wickets', short: 'WICKETS', icon: Zap, unit: 'wkts' },
  { id: 'mostDotBalls', label: 'Most Dot Balls', short: 'DOT BALLS', icon: CircleDot, unit: 'dots' },
  { id: 'mostSixes', label: 'Most Sixes', short: 'SIXES', icon: Zap, unit: 'sixes' },
  { id: 'mostFours', label: 'Most Fours', short: 'FOURS', icon: Target, unit: 'fours' },
  { id: 'highestIndividualScore', label: 'Highest Score', short: 'HIGH SCORE', icon: Award, unit: 'runs' },
  { id: 'bestBowlingFigures', label: 'Best Bowling', short: 'BEST BOWLING', icon: Shield, unit: 'wickets' },
  { id: 'mvp', label: 'MVP', short: 'MVP', icon: Award, unit: 'awards' }
];
const navItems = [
  { id: 'home', path: '/', label: 'Home' },
  { id: 'tournaments', path: '/tournaments', label: 'Tournaments' },
  { id: 'ground', path: '/ground', label: 'Open Ground' },
  { id: 'turf', path: '/turf', label: 'Turf' },
  { id: 'leaderboards', path: '/leaderboards', label: 'Leaderboards' },
  { id: 'teams', path: '/teams', label: 'Teams / Players' },
  { id: 'jerseys', path: '/jerseys', label: '3D Jerseys' },
  { id: 'auction', path: '/auction', label: 'Auction' },
  { id: 'register', path: '/register', label: 'Register' }
];
const JerseyViewer = lazy(() => import('./components/JerseyViewer'));

function pageFromPath(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return navItems.find((item) => item.path === path)?.id || 'home';
}

function useLeagueData() {
  const [data, setData] = useState({ site: null, sponsors: [], tournaments: [], teams: [], players: [], matches: [], standings: [], jerseys: [] });
  const [health, setHealth] = useState(null);
  const [connection, setConnection] = useState('checking');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer = null;
    const load = async () => {
      let nextDelay = 30000;
      setError('');
      setConnection((current) => current === 'connected' ? current : 'checking');
      try {
        const [healthData, siteData, teams, players, matches, standings, jerseys] = await Promise.all([
          api.health(), api.site(), api.teams(), api.players(), api.matches(), api.standings(), api.jerseys()
        ]);
        if (healthData?.status !== 'ok' || healthData?.database !== 'connected') {
          throw new Error('The MPL API responded, but the SQLite database did not pass its connection check.');
        }
        if (alive) {
          setHealth(healthData);
          setData({ site: siteData.site, sponsors: siteData.sponsors, tournaments: siteData.tournaments, teams, players, matches, standings, jerseys });
          setConnection('connected');
        }
      } catch (e) {
        nextDelay = 5000;
        if (alive) {
          setConnection('error');
          setError(e.message || 'Unable to connect to the MPL database.');
        }
      } finally {
        if (alive) {
          setLoading(false);
          timer = window.setTimeout(load, nextDelay);
        }
      }
    };
    load();
    return () => { alive = false; if (timer) window.clearTimeout(timer); };
  }, [retryCount]);

  const saveJersey = (jersey) => setData((current) => ({ ...current, jerseys: [...current.jerseys.filter((item) => item.teamId !== jersey.teamId), jersey] }));
  return { data, error, loading, health, connection, retry: () => setRetryCount((value) => value + 1), saveJersey };
}

function DatabaseConnectionStatus({ connection, health, onRetry }) {
  const connected = connection === 'connected';
  const label = connected
    ? `DATABASE CONNECTED · ${health?.counts?.players ?? 0} PLAYERS · ${health?.counts?.teams ?? 0} TEAMS · ${health?.counts?.matches ?? 0} MATCHES`
    : connection === 'checking' ? 'CONNECTING TO MPL DATABASE…' : 'DATABASE DISCONNECTED';
  return <div className={`database-status database-status--${connection}`} role="status" aria-live="polite">
    <span className="database-status__dot" />
    <span>{label}</span>
    {!connected && connection === 'error' && <button type="button" onClick={onRetry}>RETRY CONNECTION</button>}
  </div>;
}

function Header({ page, onNavigate }) {
  const [open, setOpen] = useState(false);
  const goTo = (path) => { onNavigate(path); setOpen(false); };
  return <header className="site-header">
    <div className="header-inner">
      <button className="brand-lockup" onClick={() => goTo('/')} aria-label="MPL home">
        <span className="brand-emblem"><span>M</span></span><span className="brand-word">MAHAKAL <b>PREMIER LEAGUE</b></span>
      </button>
      <nav id="primary-navigation" aria-label="Primary navigation" className={`main-nav ${open ? 'main-nav--open' : ''}`}>
        {navItems.map((item) => <button key={item.id} aria-current={page === item.id ? 'page' : undefined} className={page === item.id ? 'nav-link is-active' : 'nav-link'} onClick={() => goTo(item.path)}>{item.label}</button>)}
      </nav>
      <button className="header-cta" onClick={() => goTo('/register')}>JOIN THE LEAGUE <ArrowUpRight size={15} /></button>
      <button className="mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen((v) => !v)}>{open ? <X /> : <Menu />}</button>
    </div>
  </header>;
}

function TournamentCards({ tournaments = [], onNavigate, registrationOpen = true }) {
  const ground = tournaments.find((t) => t.type === 'ground');
  const turf = tournaments.find((t) => t.type === 'turf');
  const cards = [
    { type: 'ground', number: '01', title: 'OPEN GROUND', subtitle: 'THE CLASSIC FORMAT', desc: ground?.description || 'Full-ground cricket. Big boundaries. Bigger moments. Build your squad and compete for the title.', overs: ground?.overs, teamSize: ground?.teamSize || 'Squad size to be announced', venue: 'Outdoor grounds', style: 'ground' },
    { type: 'turf', number: '02', title: 'TURF LEAGUE', subtitle: 'THE FAST FORMAT', desc: turf?.description || 'Quick, intense and made for the turf. Short-format cricket where every delivery can change the game.', overs: turf?.overs, teamSize: turf?.teamSize || 'Squad size to be announced', venue: 'Turf arenas', style: 'turf' }
  ];
  return <div className="tournament-grid">{cards.map((card) => <article className={`tournament-card tournament-card--${card.style}`} key={card.type}>
    <div className="tournament-card__top"><span>FORMAT {card.number}</span><span className="status-pill"><i /> REGISTRATION {registrationOpen ? 'OPEN' : 'CLOSED'}</span></div>
    <div className="format-illustration"><div className="format-circle"><span>{card.overs ? `${card.overs}` : 'TBA'}</span><small>{card.overs ? 'OVERS' : 'FORMAT'}</small></div><div className="format-graphic"><span /><span /><span /></div></div>
    <span className="eyebrow">{card.subtitle}</span><h3>{card.title}</h3><p>{card.desc}</p>
    <div className="tournament-facts"><span><Clock3 size={15} /> {card.overs ? `${card.overs} overs` : 'Overs TBA'}</span><span><Users size={15} /> {card.teamSize}</span><span><MapPin size={15} /> {card.venue}</span></div>
    <button className="text-link" type="button" onClick={() => onNavigate(card.type === 'ground' ? '/ground' : '/turf')}>Explore this format <ArrowRight size={16} /></button>
  </article>)}</div>;
}

const homeDestinations = [
  { path: '/tournaments', number: '01', title: 'Tournament Information', description: 'Find the format, schedule and entry details for the next MPL season.', label: 'THE SEASON GUIDE', icon: Trophy, art: 'tournament' },
  { path: '/ground', number: '02', title: 'Open Ground', description: 'Fixtures, results, teams and season standings from the open-ground series.', label: 'OPEN GROUND SERIES', icon: MapPin, art: 'ground' },
  { path: '/turf', number: '03', title: 'Turf', description: 'Follow the turf tournament with its own fixtures, results and table.', label: 'TURF SERIES', icon: Activity, art: 'turf' },
  { path: '/leaderboards', number: '04', title: 'Leaderboards', description: 'Compare verified batting, bowling and MVP performances.', label: 'PLAYER RECORDS', icon: BarChart3, art: 'leaderboards' },
  { path: '/teams', number: '05', title: 'Teams and Players', description: 'Explore team lineups and player profiles across the league.', label: 'THE MPL ROSTER', icon: Users, art: 'teams' },
  { path: '/jerseys', number: '06', title: '3D Jerseys', description: 'Inspect the official kits in an interactive 3D product viewer.', label: 'THE KIT ROOM', icon: Shirt, art: 'jerseys' },
  { path: '/auction', number: '07', title: 'Player Auction', description: 'View the player pool, team purses and auction results.', label: 'THE AUCTION ROOM', icon: Gavel, art: 'auction' },
  { path: '/register', number: '08', title: 'Player Registration', description: 'Choose a format and send your player registration to MPL.', label: 'JOIN THE LEAGUE', icon: UserPlus, art: 'register' }
];

function HomePage({ data, health, onNavigate }) {
  const archiveMatch = useMemo(() => [...data.matches].filter((match) => match.status === 'completed').sort((a, b) => {
    const timeA = new Date(`${a.date || '2000-01-01'}T${a.time || '00:00'}:00`).getTime() || 0;
    const timeB = new Date(`${b.date || '2000-01-01'}T${b.time || '00:00'}:00`).getTime() || 0;
    return timeB - timeA || Number(b.matchNo || 0) - Number(a.matchNo || 0);
  })[0] || null, [data.matches]);
  const followLink = (event, path) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(path);
  };
  const counts = health?.counts || {};
  const featured = archiveMatch;
  return <div className="scoreboard-home">
    <section className="frontpage-lead section-shell" aria-labelledby="home-title">
      <div className="frontpage-lead__copy">
        <span className="eyebrow"><i /> MAHAKAL PREMIER LEAGUE · SEASON 02</span>
        <h1 id="home-title">CRICKET HAS<br /><em>A HOME HERE.</em></h1>
        <p>{data.site?.tagline || 'Two formats. One city. Your turn to play.'} Follow the league, revisit the archive, and find your way into the next season.</p>
        <div className="frontpage-lead__actions">
          <button className="button button--gold" type="button" onClick={() => onNavigate('/register')}>Join the league <UserPlus size={16} /></button>
          <button className="frontpage-text-link" type="button" onClick={() => onNavigate('/tournaments')}>Explore formats <ArrowRight size={16} /></button>
        </div>
        <div className="frontpage-ledger" aria-label="League archive totals">
          <div><strong>{counts.matches ?? '—'}</strong><span>ARCHIVE MATCHES</span></div>
          <div><strong>{counts.teams ?? '—'}</strong><span>TEAMS</span></div>
          <div><strong>{counts.players ?? '—'}</strong><span>PLAYER RECORDS</span></div>
        </div>
      </div>
      <aside className="home-result-card" aria-label="Latest archived match result">
        <div className="home-result-card__top"><span><Archive size={14} /> FROM THE ARCHIVE</span><b>SEASON 1 · TURF</b></div>
        {featured ? <>
          <div className="home-result-card__teams">
            <div><span>{featured.teamA?.shortName || 'A'}</span><strong>{featured.teamA?.name || 'Team A'}</strong><b>{featured.scoreA || '—'}</b></div>
            <span className="home-result-card__versus">VS</span>
            <div><span>{featured.teamB?.shortName || 'B'}</span><strong>{featured.teamB?.name || 'Team B'}</strong><b>{featured.scoreB || '—'}</b></div>
          </div>
          <p>{featured.result || 'Completed match'}</p>
          <small>{featured.date || 'Season 1'} · {featured.venue || 'Venue on scorecard'}</small>
        </> : <div className="home-result-card__empty"><strong>Season 2 fixtures are to be announced.</strong><span>Season 1 records are available in the Turf archive.</span></div>}
        <button type="button" onClick={() => onNavigate('/turf')}>OPEN TURF RESULTS <ArrowUpRight size={14} /></button>
      </aside>
    </section>
    <section className="home-shortcuts section-shell" aria-labelledby="home-shortcuts-title">
      <div className="home-shortcuts__heading"><span className="eyebrow">THE LEAGUE, AT A GLANCE</span><h2 id="home-shortcuts-title">Pick your <em>next stop.</em></h2></div>
      <nav className="home-shortcuts__grid" aria-label="Explore MPL pages">{homeDestinations.map(({ path, number, title, description, label, icon: Icon, art }) => <a key={path} className={`home-shortcut home-shortcut--${art}`} href={path} onClick={(event) => followLink(event, path)}>
        <span className="home-shortcut__index">{number}</span><span className="home-shortcut__icon"><Icon size={20} strokeWidth={1.8} aria-hidden="true" /></span>
        <span className="home-shortcut__copy"><strong>{title}</strong><small>{description}</small></span><ArrowUpRight className="home-shortcut__arrow" size={16} aria-hidden="true" />
      </a>)}</nav>
    </section>
    <div className="home-partners"><SponsorCarousel sponsors={data.sponsors} /></div>
  </div>;
}

function MatchCard({ match }) {
  const date = new Date(`${match.date}T${match.time || '00:00'}:00`);
  const dateText = Number.isNaN(date.getTime()) ? match.date : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const timeText = Number.isNaN(date.getTime()) ? match.time : date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return <article className="match-card">
    <div className="match-meta"><span>MATCH {String(match.matchNo).padStart(2, '0')}</span><span className={`match-state match-state--${match.status}`}>{match.status === 'completed' ? 'RESULT' : 'UPCOMING'}</span></div>
    <div className="match-teams">
      <div className="match-team"><span className="team-mini-mark" style={{ '--team-color': match.teamA?.color }}>{match.teamA?.shortName || 'TBD'}</span><strong>{match.teamA?.name || 'Team TBA'}</strong><small>{match.scoreA || 'READY TO PLAY'}</small></div>
      <span className="versus">VS</span>
      <div className="match-team match-team--right"><span className="team-mini-mark" style={{ '--team-color': match.teamB?.color }}>{match.teamB?.shortName || 'TBD'}</span><strong>{match.teamB?.name || 'Team TBA'}</strong><small>{match.scoreB || 'READY TO PLAY'}</small></div>
    </div>
    <div className="match-bottom"><span><CalendarDays size={14} /> {dateText} · {timeText}</span><span><MapPin size={14} /> {match.venue}</span></div>
    {match.result && <div className="match-result">{match.result}</div>}
  </article>;
}

function TeamCards({ teams = [] }) {
  return <div className="team-grid">{teams.map((team) => <article className="team-card" key={team.id}>
    <div className="team-card__top" style={{ '--team-color': team.color, '--team-secondary': team.secondaryColor }}><span className="team-crest">{team.shortName}</span><span className="team-year">EST. {team.founded || 2026}</span></div>
    <div className="team-card__body"><div><h4>{team.name}</h4><span className="team-city"><MapPin size={12} /> {team.city || 'Season 1 squad'}</span></div><div className="team-captain"><small>CAPTAIN</small><strong>{team.captain || 'To be announced'}</strong><small className="team-record">{team.won || 0}W · {team.lost || 0}L · {team.points || 0} PTS</small></div></div>
  </article>)}</div>;
}

function PlayerCards({ players = [], teams = [], onSelect }) {
  const teamMap = new Map(teams.map((team) => [team.id, team]));
  return <div className="player-grid">{players.map((player, index) => {
    const team = teamMap.get(player.teamId);
    return <button className="player-card" key={player.id} onClick={() => onSelect(player)} aria-label={`View ${player.name} player profile`}><div className="player-card__number">{String(player.jerseyNumber || index + 1).padStart(2, '0')}</div><div className="player-avatar" style={{ '--team-color': team?.color || '#d9a21b' }}>{player.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</div><div className="player-card__info"><strong>{player.name}</strong><span>{team?.name || 'MPL Player'}</span><small>{player.role} · VIEW PROFILE</small></div><div className="player-mini-stats"><span><b>{player.runs}</b><small>RUNS</small></span><span><b>{player.wickets}</b><small>WKTS</small></span></div></button>;
  })}</div>;
}

function PlayerProfile({ player, teams, onClose }) {
  if (!player) return null;
  const team = teams.find((item) => item.id === player.teamId);
  const stats = [['MATCHES', player.matches], ['RUNS', player.runs], ['WICKETS', player.wickets], ['DOT BALLS', player.dotBalls], ['STRIKE RATE', player.strikeRate], ['AVERAGE', player.average], ['ECONOMY', player.economy], ['MVP AWARDS', player.mvp]];
  return <div className="profile-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title"><button className="profile-close" onClick={onClose} aria-label="Close player profile"><X size={18} /></button><span className="eyebrow">MPL PLAYER CARD</span><div className="profile-identity"><div className="profile-avatar" style={{ '--team-color': team?.color || '#d9a21b' }}>{player.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</div><div><h3 id="profile-title">{player.name}</h3><p>{team?.name || 'MPL Player'} · {player.role}</p></div></div><div className="profile-meta"><span>JERSEY <b>#{player.jerseyNumber || '—'}</b></span><span>AGE <b>{player.age || '—'}</b></span><span>FORMAT <b>{player.type === 'both' ? 'BOTH' : player.type === 'turf' ? 'TURF' : 'GROUND'}</b></span></div><div className="profile-stats">{stats.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value ?? 0}</strong></div>)}</div><p className="profile-footnote">Season 1 figures are aggregated from the uploaded CricHeroes scorecards. MVP awards were not included in the source scorecards.</p></section></div>;
}

function TeamsDirectory({ data, loading }) {
  const [format, setFormat] = useState('turf');
  const [teamFilter, setTeamFilter] = useState('all');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const teams = data.teams.filter((team) => format === 'overall' || team.type === format || team.type === 'both');
  const players = data.players.filter((player) => (format === 'overall' || player.type === format || player.type === 'both') && (teamFilter === 'all' || player.teamId === teamFilter));
  const formats = [{ id: 'overall', label: 'All formats' }, { id: 'ground', label: 'Open Ground' }, { id: 'turf', label: 'Turf' }];
  return <section className="roster-page section-shell" aria-labelledby="roster-title">
    <header className="roster-page__masthead"><div><span className="eyebrow">THE MPL CLUBHOUSE · PLAYER INDEX</span><h1 id="roster-title">Meet the <em>league.</em></h1><p>Browse team lineups and player cards, then open a profile for career figures.</p></div><div className="roster-count"><strong>{loading ? '—' : players.length}</strong><span>PLAYER RECORDS<br />IN THIS VIEW</span></div></header>
    <div className="roster-toolbar"><div className="roster-format-tabs" role="group" aria-label="Filter teams and players by format">{formats.map((item) => <button type="button" key={item.id} className={format === item.id ? 'is-active' : ''} aria-pressed={format === item.id} onClick={() => { setFormat(item.id); setTeamFilter('all'); }}>{item.label}</button>)}</div><label className="roster-team-filter">TEAM<select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}><option value="all">All teams</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label></div>
    <section className="roster-teams" aria-labelledby="roster-teams-title"><div className="roster-section-heading"><div><span className="eyebrow">FRANCHISE FILES</span><h2 id="roster-teams-title">Teams</h2></div><span>{teams.length} {teams.length === 1 ? 'TEAM' : 'TEAMS'}</span></div>{loading ? <div className="empty-state">Loading team records…</div> : <TeamCards teams={teams} />}</section>
    <section className="roster-players" aria-labelledby="roster-players-title"><div className="roster-section-heading"><div><span className="eyebrow">SQUAD DIRECTORY</span><h2 id="roster-players-title">Players</h2></div><span>{players.length} {players.length === 1 ? 'PLAYER' : 'PLAYERS'}</span></div>{loading ? <div className="empty-state">Loading player records…</div> : players.length ? <PlayerCards players={players} teams={teams} onSelect={setSelectedPlayer} /> : <div className="empty-state">No player records are available for this filter.</div>}</section>
    <PlayerProfile player={selectedPlayer} teams={data.teams} onClose={() => setSelectedPlayer(null)} />
  </section>;
}

function StandingsTable({ standings = [] }) {
  return <div className="table-wrap"><table className="standings-table"><thead><tr><th>POS</th><th>TEAM</th><th>PLAYED</th><th>W</th><th>L</th><th>PTS</th><th>NRR</th></tr></thead><tbody>{standings.map((team, index) => <tr key={team.id}><td><span className={`rank-number ${index === 0 ? 'rank-number--gold' : ''}`}>{String(team.rank || index + 1).padStart(2, '0')}</span></td><td><span className="table-team"><i style={{ background: team.color }} />{team.name}</span></td><td>{team.played}</td><td>{team.won}</td><td>{team.lost}</td><td className="points-cell">{team.points}</td><td>{team.nrr == null ? '—' : Number(team.nrr).toFixed(2)}</td></tr>)}</tbody></table>{standings.length === 0 && <div className="empty-state">Standings will appear when teams and results are added.</div>}</div>;
}

function LeagueHub({ data, loading, initialFormat = 'turf', lockedFormat = '', initialView = 'matches' }) {
  const [format, setFormat] = useState(lockedFormat || initialFormat);
  const [view, setView] = useState(initialView);
  const [showAll, setShowAll] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [seasonOverride, setSeasonOverride] = useState('');
  const [standings, setStandings] = useState([]);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const seasons = useMemo(() => [...new Map(data.tournaments.filter((t) => t.type === format).map((t) => [t.season, { season: t.season, year: t.year }])).values()].sort((a, b) => b.year - a.year), [data.tournaments, format]);
  const populatedSeason = seasons.find((item) => data.matches.some((match) => match.type === format && match.season === item.season));
  const season = seasons.some((item) => item.season === seasonOverride) ? seasonOverride : (populatedSeason?.season || seasons[0]?.season || '');
  const teams = data.teams.filter((team) => team.type === format || team.type === 'both');
  const players = data.players.filter((player) => (player.type === format || player.type === 'both') && (!season || !player.sourceSeason || player.sourceSeason === season));
  const matches = data.matches.filter((match) => match.type === format && (!season || match.season === season));
  const tabs = [{ id: 'matches', label: 'Matches', icon: CalendarDays }, { id: 'players', label: 'Players', icon: Users }, { id: 'teams', label: 'Teams', icon: Shield }, { id: 'table', label: 'Season table', icon: BarChart3 }];

  useEffect(() => { if (lockedFormat) setFormat(lockedFormat); }, [lockedFormat]);
  useEffect(() => {
    if (seasonOverride && !seasons.some((item) => item.season === seasonOverride)) setSeasonOverride('');
  }, [seasons, seasonOverride]);
  useEffect(() => {
    let active = true;
    setStandingsLoading(true);
    api.standings(format, season).then((rows) => { if (active) setStandings(rows); })
      .catch(() => { if (active) setStandings([]); })
      .finally(() => { if (active) setStandingsLoading(false); });
    return () => { active = false; };
  }, [format, season]);

  const FormatIcon = format === 'ground' ? MapPin : Activity;
  return <section className={`league-section section-shell format-page format-page--${format}`} id="league">
    <header className="format-masthead"><div className="format-masthead__mark"><span>FORMAT</span><strong>{format === 'ground' ? '01' : '02'}</strong><FormatIcon size={21} /></div><div className="format-masthead__copy"><span className="eyebrow">{format === 'ground' ? 'OPEN GROUND SERIES' : 'TURF SERIES'} · {season || 'SEASON TO BE ANNOUNCED'}</span><h1>{format === 'ground' ? 'The open ground.' : 'Turf, under lights.'}</h1><p>{format === 'ground' ? 'Longer boundaries, full-size grounds and a season built around the big moments.' : 'Short-format cricket and quick decisions. Season 1 scorecards are filed here as requested.'}</p></div><div className="format-masthead__numbers"><div><strong>{matches.length}</strong><span>MATCHES</span></div><div><strong>{teams.length}</strong><span>TEAMS</span></div></div></header>
    <div className="league-console">
      <div className="league-console__head">
        {!lockedFormat ? <div className="format-switch"><button className={format === 'ground' ? 'is-selected' : ''} onClick={() => { setFormat('ground'); setSeasonOverride(''); }}><span className="switch-icon">OG</span> OPEN GROUND</button><button className={format === 'turf' ? 'is-selected' : ''} onClick={() => { setFormat('turf'); setSeasonOverride(''); }}><span className="switch-icon">TF</span> TURF</button></div> : <div className="format-switch format-switch--locked"><span className="is-selected"><span className="switch-icon">{format === 'ground' ? 'OG' : 'TF'}</span> {format === 'ground' ? 'OPEN GROUND' : 'TURF'}</span></div>}
        <label className="season-select-label">SEASON<select value={season} onChange={(event) => setSeasonOverride(event.target.value)}>{seasons.map((item) => <option key={item.season} value={item.season}>{item.season} · {item.year}</option>)}</select></label>
      </div>
      <div className="league-console__body">
        <div className="console-sidebar"><span className="console-sidebar__label">LEAGUE CENTRE</span>{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'console-tab is-selected' : 'console-tab'} onClick={() => { setView(id); setShowAll(false); }}><Icon size={17} /> {label}<ChevronRight size={15} /></button>)}<div className="console-sidebar__note"><Trophy size={22} /><strong>CHASE THE<br />MPL TITLE.</strong><span>Every run counts.<br />Every player matters.</span></div></div>
        <div className="console-content">
          <div className="console-content__head"><div><span className="eyebrow">{format === 'ground' ? 'OPEN GROUND SERIES' : 'TURF SERIES'} · {season || 'SEASON TO BE ANNOUNCED'}</span><h3>{tabs.find((tab) => tab.id === view)?.label}</h3></div><span className="count-tag">{view === 'matches' ? `${matches.length} FIXTURES` : view === 'players' ? `${players.length} PLAYERS` : view === 'teams' ? `${teams.length} TEAMS` : `${standings.length} TEAMS`}</span></div>
          {loading ? <div className="empty-state">Loading league data...</div> : <>
            {view === 'matches' && <div className="match-list">{(showAll ? matches : matches.slice(0, 4)).map((match) => <MatchCard key={match.id} match={match} />)}{matches.length === 0 && <div className="empty-state">No verified {format === 'ground' ? 'open-ground' : 'turf'} fixtures are published for {season || 'this season'} yet.</div>}</div>}
            {view === 'players' && <PlayerCards players={players} teams={teams} onSelect={setSelectedPlayer} />}
            {view === 'teams' && <TeamCards teams={teams} />}
            {view === 'table' && (standingsLoading ? <div className="empty-state">Loading season standings...</div> : <StandingsTable standings={standings} />)}
            {view === 'matches' && matches.length > 4 && <button className="view-more" onClick={() => setShowAll((value) => !value)}>{showAll ? 'SHOW LESS' : 'VIEW ALL FIXTURES'} <ChevronDown size={15} className={showAll ? 'rotate-up' : ''} /></button>}
          </>}
        </div>
      </div>
    </div>
    <PlayerProfile player={selectedPlayer} teams={data.teams} onClose={() => setSelectedPlayer(null)} />
  </section>;
}

function Leaderboards({ teams, tournaments = [] }) {
  const [format, setFormat] = useState('overall');
  const [season, setSeason] = useState('overall');
  const [metric, setMetric] = useState('mostRuns');
  const [ranked, setRanked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const seasonOptions = [...new Map(tournaments.map((tournament) => [tournament.season, tournament])).values()].sort((a, b) => b.year - a.year);
  const selectedMetric = metrics.find((item) => item.id === metric);
  const teamMap = new Map(teams.map((team) => [team.id, team]));

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setShowAll(false);
    api.leaderboard(format, metric, season === 'overall' ? '' : season)
      .then((rows) => { if (active) setRanked(rows); })
      .catch((cause) => { if (active) { setRanked([]); setError(cause.message || 'Could not load leaderboard records.'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [format, metric, season]);

  const visible = showAll ? ranked : ranked.slice(0, 10);
  const metricValue = (player) => metric === 'bestBowlingFigures'
    ? <>{player.value}/{player.runsConceded}<small> · {player.overs} ov</small></>
    : <>{player.value}<small>{metric === 'mvp' ? 'MVP' : selectedMetric?.unit}</small></>;

  return <section className="leaderboard-section section-shell" id="leaderboards">
    <SectionHeading as="h1" eyebrow="NUMBERS NEVER LIE" title={<>BUILT ON <em>PERFORMANCE.</em></>} description="Verified individual records, calculated from match-by-match batting and bowling performances." />
    <div className="leaderboard-panel">
      <div className="leaderboard-panel__head"><div className="leaderboard-selects"><div className="format-pills"><button className={format === 'overall' ? 'is-selected' : ''} onClick={() => setFormat('overall')}>OVERALL</button><button className={format === 'ground' ? 'is-selected' : ''} onClick={() => setFormat('ground')}>OPEN GROUND</button><button className={format === 'turf' ? 'is-selected' : ''} onClick={() => setFormat('turf')}>TURF</button></div><label className="leaderboard-season">SEASON<select value={season} onChange={(event) => setSeason(event.target.value)}><option value="overall">ALL SEASONS</option>{seasonOptions.map((item) => <option value={item.season} key={item.season}>{item.season}</option>)}</select></label></div><span className="leaderboard-updated"><Activity size={14} /> MATCH-DERIVED RECORDS</span></div>
      <div className="metric-tabs">{metrics.map(({ id, label, icon: Icon }) => <button key={id} className={metric === id ? 'metric-tab is-selected' : 'metric-tab'} onClick={() => setMetric(id)}><Icon size={17} /><span>{label}</span></button>)}</div>
      {!loading && !error && ranked[0] && <article className="leaderboard-feature"><span className="leaderboard-feature__badge"><Award size={16} /> NUMBER ONE · {selectedMetric?.short}</span><span className="leaderboard-feature__value">{metricValue(ranked[0])}</span><h3>{ranked[0].name}</h3><p>{teamMap.get(ranked[0].teamId)?.name || 'MPL player'} · {ranked[0].role || 'Player'} · {ranked[0].matches || 0} matches</p></article>}
      <div className="leaderboard-table-head"><span>RANK / PLAYER</span><span>TEAM</span><span>{selectedMetric?.short || 'STAT'}</span></div>
      <div className="leaderboard-rows">{loading ? <div className="empty-state">Loading verified records…</div> : error ? <div className="empty-state" role="alert">{error}</div> : <>
        {visible.slice(1).map((player, index) => {
          const rank = index + 2;
          const team = player.team || teamMap.get(player.teamId);
          const initials = String(player.name || '').trim().split(/\s+/).map((name) => name[0]).join('').slice(0, 2);
          return <div className={`leaderboard-row leaderboard-row--rank-${rank} ${rank < 4 ? 'leaderboard-row--podium' : ''}`} key={player.id}>
            <div className="leader-player"><span className="leader-rank">{String(rank).padStart(2, '0')}</span><span className="leader-avatar" style={{ '--team-color': team?.color || '#d9a21b' }}>{initials}</span><span><strong>{player.name}</strong><small>{player.role || 'Player'} · {player.matches || 0} matches</small></span></div>
            <div className="leader-team"><i style={{ background: team?.color || '#d9a21b' }} />{team?.name || 'MPL'}</div>
            <strong className="leader-value">{metricValue(player)}</strong>
          </div>;
        })}
        {ranked.length === 0 && <div className="empty-state">{metric === 'mvp' ? 'No verified MVP awards have been recorded for this filter.' : `No verified ${selectedMetric?.label.toLowerCase() || 'performance'} records are available for this filter.`}</div>}
      </>}</div>
      {ranked.length > 10 && !loading && !error && <button className="view-more leaderboard-more" type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? 'SHOW LESS' : `SHOW MORE · ${ranked.length - 10} PLAYERS`} <ChevronDown size={15} className={showAll ? 'rotate-up' : ''} /></button>}
      <div className="leaderboard-foot"><span><Medal size={16} /> {showAll ? `ALL ${ranked.length} VALID RECORDS` : `TOP ${Math.min(10, ranked.length)} PERFORMERS`}</span><span>MVP results appear only after awards are verified by an organiser.</span></div>
    </div>
  </section>;
}

function Jerseys({ teams, jerseys = [], onJerseySaved, onNavigate }) {
  const [selectedId, setSelectedId] = useState('s1-dbxi');
  const [sampleName, setSampleName] = useState('VASITA');
  const [jerseyNumber, setJerseyNumber] = useState('22');
  const [showIcon, setShowIcon] = useState(true);
  const [adminKey, setAdminKey] = useState('');
  const [frontFile, setFrontFile] = useState(null);
  const [backFile, setBackFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadError, setUploadError] = useState('');
  const selected = teams.find((team) => team.id === selectedId) || teams.find((team) => team.name.toLowerCase() === 'db xi') || teams[0];
  const selectedJersey = jerseys.find((jersey) => jersey.teamId === selected?.id);
  const isReferenceKit = selected?.name?.toLowerCase() === 'db xi';
  useEffect(() => { if (teams.length && !teams.some((team) => team.id === selectedId)) setSelectedId(teams.find((team) => team.name.toLowerCase() === 'db xi')?.id || teams[0].id); }, [teams, selectedId]);

  const selectArtwork = (side, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setUploadMessage(''); setUploadError('');
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setUploadError('Choose a PNG, JPG or WebP image.'); return; }
    if (file.size > 4 * 1024 * 1024) { setUploadError('Each jersey side must be 4 MB or smaller.'); return; }
    (side === 'front' ? setFrontFile : setBackFile)(file);
  };
  const readArtwork = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`${file.name} could not be read.`));
    reader.onload = () => resolve({ fileName: file.name, mimeType: file.type, dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  });
  const uploadArtwork = async () => {
    setUploadMessage(''); setUploadError('');
    if (!selected) { setUploadError('Choose a team first.'); return; }
    if (!adminKey.trim()) { setUploadError('Enter the organiser key before uploading.'); return; }
    if (!frontFile && !backFile) { setUploadError('Choose at least one jersey side to upload.'); return; }
    setUploading(true);
    try {
      const [front, back] = await Promise.all([frontFile ? readArtwork(frontFile) : null, backFile ? readArtwork(backFile) : null]);
      const result = await api.uploadTeamJersey(selected.id, { front, back }, adminKey.trim());
      onJerseySaved?.(result.jersey);
      setFrontFile(null); setBackFile(null);
      setUploadMessage(`Artwork saved for ${selected.name}.`);
    } catch (error) { setUploadError(error.message || 'Jersey artwork upload failed.'); }
    finally { setUploading(false); }
  };

  return <section className="jersey-section section-shell" id="jerseys">
    <div className="jersey-heading"><SectionHeading as="h1" eyebrow="WEAR YOUR COLOURS" title={<>THE MPL <em>KIT ROOM.</em></>} description="Explore a tailored 3D cricket shirt with separate curved torso and sleeve panels. Drag or touch to orbit, then use the view buttons to inspect each side." /><span className="edition-tag">2027 / OFFICIAL COLLECTION</span></div>
    <div className="jersey-layout">
      <div className="jersey-stage-wrap"><Suspense fallback={<div className="jersey-model-loading">BUILDING THE 3D KIT…</div>}><JerseyViewer team={selected} jersey={selectedJersey} playerName={sampleName} playerNumber={jerseyNumber || '22'} showIcon={showIcon} /></Suspense><div className="jersey-stage-footer"><span><Sparkles size={15} /> INTERACTIVE 3D PREVIEW</span><span>360° MODEL · TOUCH READY</span></div></div>
      <div className="jersey-detail"><span className="eyebrow">SELECT A TEAM KIT</span><h3>{selected?.name || 'MPL TEAM'}</h3><p className="jersey-detail__desc">{isReferenceKit && !selectedJersey?.frontImageUrl ? 'The supplied DB XI front and back design is the only reference kit currently available.' : selectedJersey ? 'Uploaded artwork is mapped to this team’s separate front and back garment panels.' : 'This team has no official jersey art yet. The viewer shows a clearly marked placeholder until the organiser uploads the real design.'}</p>
        <div className="jersey-colour"><span>TEAM COLOURS</span><span className="colour-swatches"><i style={{ background: selected?.color }} /><i style={{ background: selected?.secondaryColor }} /></span></div>
        <label className="kit-select-label">CHOOSE TEAM<select value={selected?.id || ''} onChange={(event) => { setSelectedId(event.target.value); setFrontFile(null); setBackFile(null); }}><option value="" disabled>Select a team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name} · {team.type === 'ground' ? 'Open Ground' : team.type === 'turf' ? 'Turf' : 'Both formats'}</option>)}</select></label>
        {isReferenceKit && <div className="jersey-customizer">
          <div className="jersey-customizer__heading"><span className="eyebrow">BACK PRINT PREVIEW</span><small>DB XI REFERENCE KIT</small></div>
          <label className="kit-select-label">BACK NAME PREVIEW<input value={sampleName} maxLength="18" onChange={(event) => setSampleName(event.target.value || 'VASITA')} /></label>
          <label className="kit-select-label">JERSEY NUMBER<input type="text" inputMode="numeric" pattern="[0-9]{1,2}" aria-label="Back jersey number, zero to ninety-nine" value={jerseyNumber} onChange={(event) => setJerseyNumber(event.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
          <label className="jersey-customizer__check"><input type="checkbox" checked={showIcon} onChange={(event) => setShowIcon(event.target.checked)} /><span>Show the “ICON” wordmark</span></label>
          <p>These controls update the 3D preview immediately. The source artwork file stays unchanged.</p>
        </div>}
        <div className="jersey-upload-panel">
          <span className="eyebrow">OFFICIAL FRONT / BACK ARTWORK</span>
          <label className="kit-select-label">ORGANISER ACCESS KEY<input type="password" autoComplete="off" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="Enter organiser key" /></label>
          <label className="jersey-file-field"><span>FRONT PANEL</span><small>{frontFile?.name || selectedJersey?.front?.originalName || (isReferenceKit ? 'Sultan Khan reference front' : 'No official front art')}</small><input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading || !adminKey.trim()} onChange={(event) => selectArtwork('front', event)} /></label>
          <label className="jersey-file-field"><span>BACK PANEL</span><small>{backFile?.name || selectedJersey?.back?.originalName || (isReferenceKit ? 'Sultan Khan reference back' : 'No official back art')}</small><input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading || !adminKey.trim()} onChange={(event) => selectArtwork('back', event)} /></label>
          <button type="button" className={`jersey-upload-button ${uploading || !adminKey.trim() ? 'is-disabled' : ''}`} disabled={uploading || !adminKey.trim()} onClick={uploadArtwork}>{uploading ? 'SAVING ARTWORK…' : 'SAVE SELECTED SIDES'}</button>
          <p className="jersey-upload-note">PNG, JPG or WebP · maximum 4 MB per side. Use separate front and back artwork; each side is stored and mapped independently.</p>
          {(selectedJersey?.front || selectedJersey?.back) && <span className="jersey-upload-status">SAVED SIDES: {selectedJersey?.front ? 'FRONT' : ''}{selectedJersey?.front && selectedJersey?.back ? ' + ' : ''}{selectedJersey?.back ? 'BACK' : ''}</span>}
          {uploadMessage && <span className="jersey-upload-success">{uploadMessage}</span>}
          {uploadError && <span className="jersey-upload-error" role="alert">{uploadError}</span>}
        </div>
        <div className="jersey-specs"><div><span>LEAGUE</span><strong>MAHAKAL PREMIER LEAGUE</strong></div><div><span>EDITION</span><strong>SEASON 2 / 2027</strong></div><div><span>FORMAT</span><strong>{selected?.type === 'turf' ? 'TURF' : selected?.type === 'both' ? 'BOTH FORMATS' : 'OPEN GROUND'}</strong></div></div>
        <button type="button" className="button button--gold jersey-register" onClick={() => onNavigate('/register')}>Register for your team <ArrowUpRight size={16} /></button>
      </div>
    </div>
  </section>;
}

function Registration({ site }) {
  return <section className="registration-section section-shell" id="register">
    <div className="registration-top"><div><span className="eyebrow"><i /> YOUR TURN TO PLAY</span><h1>STEP ONTO<br /><em>THE FIELD.</em></h1><p>Open to passionate players. Tell us how you play, choose your format and submit your interest. The MPL team will take it from there.</p><div className="registration-points"><span><CheckMark /> Open to all</span><span><CheckMark /> Ground + Turf</span><span><CheckMark /> Individual entries welcome</span></div></div>
      <div className="registration-seal"><img src="/assets/mpl-season-1.png" alt="MPL Season 1 logo" /><span>THE LEAGUE<br />CALLS YOU</span></div>
    </div>
    <div className="registration-main"><div className="registration-form-title"><span className="eyebrow">PLAYER ENTRY</span><h3>REGISTRATION <em>{site?.registrationOpen ? 'FORM.' : 'CLOSED.'}</em></h3><p>{site?.registrationOpen ? 'Fields marked required must be completed.' : 'Entry dates and details will be announced here when registration opens.'}</p></div><RegistrationForm open={site?.registrationOpen} /></div>
    <div className="contact-row"><div><span className="eyebrow">STAY IN THE LOOP</span><h3>FOLLOW THE <em>LEAGUE.</em></h3></div><div className="social-links">
      {site?.socials?.instagram && <a href={site.socials.instagram} target="_blank" rel="noreferrer"><Instagram size={17} /> Instagram <ArrowUpRight size={14} /></a>}
      {site?.socials?.youtube && <a href={site.socials.youtube} target="_blank" rel="noreferrer"><Youtube size={18} /> YouTube <ArrowUpRight size={14} /></a>}
      {site?.socials?.whatsapp && <a href={site.socials.whatsapp} target="_blank" rel="noreferrer"><Users size={17} /> WhatsApp <ArrowUpRight size={14} /></a>}
      {!site?.socials?.instagram && !site?.socials?.youtube && !site?.socials?.whatsapp && <span className="social-pending">Official social links will be announced here.</span>}
    </div></div>
  </section>;
}
function CheckMark() { return <span className="check-mark">✓</span>; }

function Footer({ site, onNavigate }) {
  const navigate = (event, path) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onNavigate(path); };
  return <footer className="site-footer"><div className="footer-main"><div className="footer-brand"><div className="brand-lockup brand-lockup--footer"><span className="brand-emblem"><span>M</span></span><span className="brand-word">MAHAKAL <b>PREMIER LEAGUE</b></span></div><p>{site?.tagline || 'One league. Two formats. Unlimited passion.'}</p></div><div className="footer-nav"><span>EXPLORE</span><a href="/tournaments" onClick={(event) => navigate(event, '/tournaments')}>Tournaments</a><a href="/ground" onClick={(event) => navigate(event, '/ground')}>Open Ground</a><a href="/turf" onClick={(event) => navigate(event, '/turf')}>Turf</a><a href="/leaderboards" onClick={(event) => navigate(event, '/leaderboards')}>Leaderboards</a><a href="/auction" onClick={(event) => navigate(event, '/auction')}>Player auction</a><a href="/jerseys" onClick={(event) => navigate(event, '/jerseys')}>3D jerseys</a></div><div className="footer-nav"><span>CONTACT</span>{site?.contactEmail ? <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a> : <span>Contact email to be announced</span>}{site?.contactPhone ? <a href={`tel:${site.contactPhone}`}>{site.contactPhone}</a> : <span>Contact number to be announced</span>}</div><div className="footer-mark"><img src="/assets/mpl-season-2.png" alt="MPL season 2 crest" /></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} MAHAKAL PREMIER LEAGUE. ALL RIGHTS RESERVED.</span><span>BUILT FOR THE LOVE OF THE GAME.</span></div></footer>;
}

export default function App() {
  const { data, error, loading, health, connection, retry, saveJersey } = useLeagueData();
  const [page, setPage] = useState(() => pageFromPath(window.location.pathname));
  const [showTop, setShowTop] = useState(false);
  const navigate = (path) => {
    const nextPage = pageFromPath(path);
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 700);
    window.addEventListener('scroll', onScroll, { passive: true }); return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    const onPopState = () => { setPage(pageFromPath(window.location.pathname)); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  return <>
    <Header page={page} onNavigate={navigate} />
    <DatabaseConnectionStatus connection={connection} health={health} onRetry={retry} />
    <main className={`site-page site-page--${page}`}>
      {page === 'home' ? <HomePage data={data} health={health} onNavigate={navigate} /> : <>
        {page === 'tournaments' && <section className="tournament-page section-shell"><header className="tournament-page__masthead"><div><span className="eyebrow">THE SEASON GUIDE · TWO FORMATS</span><h1>Choose your <em>ground.</em></h1><p>Pick the kind of cricket you want to play. Each format keeps its own fixtures, records and season table.</p></div><div className="tournament-page__seal"><Trophy size={28} /><strong>01<br /><small>LEAGUE</small></strong><span>·</span><strong>02<br /><small>FORMATS</small></strong></div></header><TournamentCards tournaments={data.tournaments} registrationOpen={data.site?.registrationOpen} onNavigate={navigate} /></section>}
        {page === 'ground' && <LeagueHub data={data} loading={loading} initialFormat="ground" lockedFormat="ground" />}
        {page === 'turf' && <LeagueHub data={data} loading={loading} initialFormat="turf" lockedFormat="turf" />}
        {page === 'teams' && <TeamsDirectory data={data} loading={loading} />}
        {page === 'leaderboards' && <Leaderboards teams={data.teams} tournaments={data.tournaments} />}
        {page === 'jerseys' && <Jerseys teams={data.teams} jerseys={data.jerseys} onJerseySaved={saveJersey} onNavigate={navigate} />}
        {page === 'auction' && <AuctionRoom />}
        {page === 'register' && <Registration site={data.site} />}
        <Footer site={data.site} onNavigate={navigate} />
      </>}
    </main>
    {error && <div className="api-notice" role="status"><span className="api-notice__dot" /> API connection issue: {error} <small>Start the backend to load live league data.</small></div>}
    {showTop && <button className="back-to-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top"><ChevronLeft size={18} /></button>}
  </>;
}
