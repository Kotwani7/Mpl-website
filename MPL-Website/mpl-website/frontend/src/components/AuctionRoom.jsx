import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Award, CheckCircle2, CircleDollarSign, Clock3, Coins, Gavel,
  LockKeyhole, RefreshCw, Search, Settings2, ShieldCheck, ShoppingBag,
  UserRound, Users, XCircle
} from 'lucide-react';
import SectionHeading from './SectionHeading';
import { api } from '../lib/api';

const number = (value) => Number(value || 0).toLocaleString('en-IN');

function StatusPill({ status }) {
  const label = status === 'sold' ? 'SOLD' : status === 'nominated' ? 'ON THE BLOCK' : status === 'pending' ? 'TO BE AUCTIONED' : 'UNSOLD';
  return <span className={`auction-status auction-status--${status}`}>{label}</span>;
}

export default function AuctionRoom() {
  const [summary, setSummary] = useState(null);
  const [players, setPlayers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('pending');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [soldPrice, setSoldPrice] = useState(20);
  const [basePrice, setBasePrice] = useState(20);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ pursePerTeam: 1000, basePrice: 20, bidIncrement: 10, maxSquadSize: 15, status: 'open' });

  const load = async () => {
    setError('');
    try {
      const [nextSummary, nextPlayers, nextEvents] = await Promise.all([
        api.auctionSummary(), api.auctionPlayers(), api.auctionEvents()
      ]);
      setSummary(nextSummary);
      setPlayers(nextPlayers);
      setEvents(nextEvents);
      setSettingsForm(nextSummary.settings);
      setBasePrice(nextSummary.settings.basePrice);
      if (!selectedTeamId && nextSummary.teams.length) setSelectedTeamId(nextSummary.teams[0].teamId);
      if (nextSummary.currentPlayer) setSoldPrice(Math.max(nextSummary.currentPlayer.basePrice, nextSummary.settings.basePrice));
    } catch (e) {
      setError(e.message || 'Unable to load auction data. Start the backend and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Refresh shared auction state so the public display follows organiser actions.
    const timer = window.setInterval(async () => {
      try {
        const [nextSummary, nextPlayers, nextEvents] = await Promise.all([
          api.auctionSummary(), api.auctionPlayers(), api.auctionEvents()
        ]);
        setSummary(nextSummary);
        setPlayers(nextPlayers);
        setEvents(nextEvents);
      } catch {
        // Keep the last good auction state visible during a temporary connection issue.
      }
    }, 10000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredPlayers = useMemo(() => players.filter((player) => {
    const statusMatch = filter === 'all' || player.status === filter;
    const searchMatch = !search || `${player.name} ${player.previousTeam || ''} ${player.soldToTeam || ''}`.toLowerCase().includes(search.toLowerCase());
    return statusMatch && searchMatch;
  }), [players, filter, search]);

  const nominated = summary?.currentPlayer;
  const selectedTeam = summary?.teams.find((team) => team.teamId === selectedTeamId);
  const isAdminReady = adminKey.trim().length > 0;

  const runAction = async (fn, successMessage) => {
    if (!isAdminReady) { setError('Enter the organiser key from backend/.env to perform auction actions.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await fn();
      setNotice(successMessage);
      await load();
    } catch (e) {
      setError(e.message || 'Auction action failed.');
    } finally { setBusy(false); }
  };

  const nominatePlayer = (player) => runAction(
    () => api.nominatePlayer({ playerId: player.playerId, basePrice: player.basePrice || basePrice }, adminKey),
    `${player.name} is now nominated.`
  );

  const sellPlayer = () => {
    if (!nominated) return;
    return runAction(
      () => api.sellPlayer({ playerId: nominated.playerId, teamId: selectedTeamId, soldPrice: Number(soldPrice) }, adminKey),
      `${nominated.name} sold to ${selectedTeam?.name || 'the selected team'} for ${number(soldPrice)} points.`
    );
  };

  const markUnsold = () => nominated && runAction(
    () => api.markPlayerUnsold({ playerId: nominated.playerId }, adminKey),
    `${nominated.name} has been marked unsold.`
  );

  const saveSettings = () => runAction(
    () => api.updateAuctionSettings(settingsForm, adminKey),
    'Auction settings updated.'
  );

  const totalPlayers = summary?.totals?.totalPlayers || 0;
  const totalSold = summary?.totals?.totalPlayersSold || 0;
  const totalSpent = summary?.totals?.totalPointsSpent || 0;
  const totalUnsold = summary?.totals?.playersUnsold || 0;
  const totalPending = summary?.totals?.playersPending || 0;
  const currentSettings = summary?.settings;

  return <section className="auction-section section-shell" id="auction">
    <div className="auction-intro">
      <SectionHeading as="h1" eyebrow="THE PLAYER MARKET · SEASON 2" title={<>THE MPL <em>AUCTION ROOM.</em></>} description="A live player auction centre for organisers and teams. Track every nomination, sale, remaining purse and player status in one place." />
      <div className="auction-intro__side"><span className="auction-live-indicator"><i /> {currentSettings?.status?.toUpperCase() || 'CONNECTING'}</span><span className="auction-intro__season">{currentSettings?.season || 'SEASON 2 / 2027'}</span></div>
    </div>

    <div className="auction-console">
      <div className="auction-console__top">
        <div className="auction-console__identity"><div className="auction-console__crest"><Gavel size={24} /></div><div><span className="eyebrow">MAHAKAL PREMIER LEAGUE</span><h3>PLAYER <em>AUCTION.</em></h3></div></div>
        <div className="auction-console__actions">
          <button className="auction-utility-button" onClick={load} disabled={busy}><RefreshCw size={15} /> REFRESH</button>
          <button className={`auction-utility-button ${settingsOpen ? 'is-active' : ''}`} onClick={() => setSettingsOpen((v) => !v)}><Settings2 size={15} /> SETTINGS</button>
        </div>
      </div>

      <div className="auction-admin-bar">
        <div className="auction-admin-copy"><LockKeyhole size={16} /><span><strong>ORGANISER ACCESS</strong><small>Required to nominate, sell and update auction rules.</small></span></div>
        <label className="auction-key-field"><span>ADMIN KEY</span><input type="password" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="Enter key from backend/.env" autoComplete="off" /></label>
      </div>

      {error && <div className="auction-message auction-message--error"><XCircle size={16} /> {error}</div>}
      {notice && <div className="auction-message auction-message--success"><CheckCircle2 size={16} /> {notice}</div>}

      {settingsOpen && <div className="auction-settings-panel">
        <div className="auction-subhead"><div><span className="eyebrow">ORGANISER CONFIGURATION</span><h4>AUCTION <em>RULES.</em></h4></div><button onClick={() => setSettingsOpen(false)} aria-label="Close settings"><XCircle size={18} /></button></div>
        <div className="auction-settings-grid">
          <label>TEAM PURSE (POINTS)<input type="number" min="1" value={settingsForm.pursePerTeam || ''} onChange={(e) => setSettingsForm((v) => ({ ...v, pursePerTeam: Number(e.target.value) }))} /></label>
          <label>BASE PRICE<input type="number" min="1" value={settingsForm.basePrice || ''} onChange={(e) => setSettingsForm((v) => ({ ...v, basePrice: Number(e.target.value) }))} /></label>
          <label>BID INCREMENT<input type="number" min="1" value={settingsForm.bidIncrement || ''} onChange={(e) => setSettingsForm((v) => ({ ...v, bidIncrement: Number(e.target.value) }))} /></label>
          <label>MAX SQUAD SIZE<input type="number" min="1" value={settingsForm.maxSquadSize || ''} onChange={(e) => setSettingsForm((v) => ({ ...v, maxSquadSize: Number(e.target.value) }))} /></label>
          <label>AUCTION STATUS<select value={settingsForm.status || 'open'} onChange={(e) => setSettingsForm((v) => ({ ...v, status: e.target.value }))}><option value="draft">Draft</option><option value="open">Open</option><option value="paused">Paused</option><option value="closed">Closed</option></select></label>
        </div>
        <div className="auction-settings-foot"><p>Changing the purse adjusts every team's remaining points by the same amount. Sold players and recorded sales are retained.</p><button className="button button--gold" disabled={busy || !isAdminReady} onClick={saveSettings}>SAVE AUCTION RULES <CheckCircle2 size={15} /></button></div>
      </div>}

      <div className="auction-kpis">
        <article><span><Users size={15} /> PLAYER POOL</span><strong>{loading ? '—' : number(totalPlayers)}</strong><small>Unique player records in this auction</small></article>
        <article><span><Clock3 size={15} /> TO BE AUCTIONED</span><strong>{loading ? '—' : number(totalPending)}</strong><small>Players not yet called to the auction</small></article>
        <article><span><ShoppingBag size={15} /> PLAYERS SOLD</span><strong>{loading ? '—' : number(totalSold)}</strong><small>{number(totalPlayers ? totalSold / totalPlayers * 100 : 0)}% of the auction pool</small></article>
        <article><span><Coins size={15} /> TOTAL POINTS SPENT</span><strong>{loading ? '—' : number(totalSpent)}</strong><small>Combined team expenditure</small></article>
        <article><span><Activity size={15} /> PLAYERS UNSOLD</span><strong>{loading ? '—' : number(totalUnsold)}</strong><small>{number(summary?.totals?.playersNominated || 0)} currently on the block</small></article>
      </div>

      <div className="auction-main-grid">
        <section className="auction-feature-panel">
          <div className="auction-panel-heading"><div><span className="eyebrow">LIVE NOMINATION</span><h4>PLAYER <em>ON THE BLOCK.</em></h4></div><span className="auction-lot-number">{nominated ? `LOT ${String(players.find((p) => p.playerId === nominated.playerId)?.nominationNumber || '').padStart(3,'0')}` : 'NO ACTIVE LOT'}</span></div>
          {nominated ? <div className="auction-current-player">
            <div className="auction-player-avatar"><UserRound size={30} /></div>
            <div className="auction-player-heading"><StatusPill status="nominated" /><h3>{nominated.name}</h3><p>Season 1 · {nominated.matches} match squad appearances</p></div>
            <div className="auction-player-stats"><div><strong>{number(nominated.runs)}</strong><span>RUNS</span></div><div><strong>{number(nominated.wickets)}</strong><span>WICKETS</span></div><div><strong>{number(nominated.dotBalls)}</strong><span>DOT BALLS</span></div><div><strong>{Number(nominated.strikeRate || 0).toFixed(1)}</strong><span>STRIKE RATE</span></div></div>
            <div className="auction-bid-controls">
              <label>SELECT WINNING TEAM<select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)}><option value="">Choose team</option>{summary?.teams.map((team) => <option key={team.teamId} value={team.teamId}>{team.name} · {number(team.purseRemaining)} pts left</option>)}</select></label>
              <label>FINAL BID (POINTS)<input type="number" min={nominated.basePrice} step={currentSettings?.bidIncrement || 10} value={soldPrice} onChange={(e) => setSoldPrice(Number(e.target.value))} /></label>
              <div className="auction-bid-hint"><span>BASE PRICE <b>{number(nominated.basePrice)} PTS</b></span><span>TEAM PURSE <b>{number(selectedTeam?.purseRemaining)} PTS</b></span></div>
              <div className="auction-action-row"><button className="button button--gold" disabled={busy || !isAdminReady || currentSettings?.status !== 'open' || !selectedTeamId || !soldPrice || Number(soldPrice) < (nominated.basePrice ?? 0) || Number(soldPrice) > (selectedTeam?.purseRemaining ?? 0)} onClick={sellPlayer}><Gavel size={15} /> CONFIRM SALE</button><button className="auction-unsold-button" disabled={busy || !isAdminReady || currentSettings?.status !== 'open'} onClick={markUnsold}>MARK UNSOLD</button></div>
            </div>
          </div> : <div className="auction-no-player"><Gavel size={34} /><h4>NO PLAYER CURRENTLY NOMINATED</h4><p>Select a player from the unsold pool below and nominate them to begin bidding.</p></div>}
        </section>

        <section className="auction-purse-panel">
          <div className="auction-panel-heading"><div><span className="eyebrow">TEAM WALLETS</span><h4>PURSE <em>TRACKER.</em></h4></div><span className="auction-team-count">{summary?.teams.length || 0} TEAMS</span></div>
          <div className="auction-wallet-list">
            {summary?.teams.map((team) => {
              const spentPercent=team.purseTotal ? Math.min(100,team.pointsSpent/team.purseTotal*100) : 0;
              return <article className={`auction-wallet ${selectedTeamId===team.teamId?'is-selected':''}`} key={team.teamId} onClick={() => setSelectedTeamId(team.teamId)} role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelectedTeamId(team.teamId);}}}>
                <div className="auction-wallet__top"><i style={{background:team.color}} /><strong>{team.name}</strong><b>{number(team.purseRemaining)} <small>PTS</small></b></div>
                <div className="auction-wallet__bar"><span style={{width:`${spentPercent}%`}} /></div>
                <div className="auction-wallet__meta"><span>{team.playersSold} PLAYERS BOUGHT</span><span>{number(team.pointsSpent)} / {number(team.purseTotal)} SPENT</span></div>
              </article>;
            })}
            {!summary?.teams.length && <div className="empty-state">No auction teams configured.</div>}
          </div>
        </section>
      </div>

      <section className="auction-pool-panel">
        <div className="auction-panel-heading auction-pool-heading"><div><span className="eyebrow">{number(players.length)} UNIQUE PLAYER RECORDS · SEASON 1 HISTORY</span><h4>THE PLAYER <em>POOL.</em></h4></div><div className="auction-pool-filters">
          <label className="auction-search"><Search size={15} /><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search player or team" /></label>
          <select value={filter} onChange={(e)=>setFilter(e.target.value)}><option value="pending">To be auctioned</option><option value="nominated">On the block</option><option value="unsold">Unsold</option><option value="sold">Sold</option><option value="all">All players</option></select>
        </div></div>
        <div className="auction-table-wrap"><table className="auction-table"><thead><tr><th>PLAYER</th><th>PREVIOUS TEAM</th><th>MATCHES</th><th>RUNS</th><th>WKTS</th><th>STATUS</th><th>PRICE</th><th>ACTION</th></tr></thead><tbody>
          {filteredPlayers.map((player) => <tr key={player.playerId}>
            <td><strong>{player.name}</strong><small>{player.role || 'Player'}</small></td>
            <td>{player.previousTeam || 'New registration'}</td><td>{player.matches}</td><td>{player.runs}</td><td>{player.wickets}</td>
            <td><StatusPill status={player.status} /></td>
            <td>{player.status==='sold'?`${number(player.soldPrice)} pts`: `${number(player.basePrice)} pts`}</td>
            <td>{['pending','unsold'].includes(player.status) ? <button className="auction-row-action" onClick={()=>nominatePlayer(player)} disabled={busy || !isAdminReady || Boolean(nominated) || currentSettings?.status!=='open'}>NOMINATE</button> : player.status==='sold' ? <span className="auction-row-team">{player.soldToTeam || '—'}</span> : <span className="auction-row-team">CURRENT LOT</span>}</td>
          </tr>)}
          {!loading && filteredPlayers.length===0 && <tr><td colSpan="8" className="auction-empty-cell">No players match this filter.</td></tr>}
        </tbody></table></div>
        <div className="auction-pool-foot"><span>Player identity is unique by normalized name. Historical aliases are merged into one player profile.</span><span>SHOWING {filteredPlayers.length} / {players.length}</span></div>
      </section>

      <section className="auction-history-panel">
        <div className="auction-panel-heading"><div><span className="eyebrow">TRANSACTION RECORD</span><h4>AUCTION <em>HISTORY.</em></h4></div><span className="auction-team-count">LATEST 100 EVENTS</span></div>
        <div className="auction-history-list">
          {events.slice(0,12).map((event) => <article className="auction-history-row" key={event.id}><span className={`auction-history-icon auction-history-icon--${event.eventType}`}><Activity size={15}/></span><div><strong>{event.playerName}</strong><small>{event.eventType.toUpperCase()} {event.teamName ? `· ${event.teamName}` : ''}</small></div><b>{event.amount ? `${number(event.amount)} PTS` : '—'}</b><time>{new Date(event.createdAt.replace(' ','T')+'Z').toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</time></article>)}
          {!events.length && <div className="empty-state">Auction transactions will appear here as players are nominated, sold or marked unsold.</div>}
        </div>
      </section>

      <div className="auction-policy-note"><ShieldCheck size={17}/><p><strong>Organizer note:</strong> The initial purse (1,000 points per team), base price (20 points), bid increment (10 points) and squad limit (15) are editable starter settings, not rules stated in the Season 1 scorecards. Confirm the official auction rules before running a live auction.</p></div>
    </div>
  </section>;
}
