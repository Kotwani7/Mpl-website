// Use the same-origin /api path in development; Vite proxies it to the backend.
// A deployed environment can override this with VITE_API_BASE_URL.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
  } catch (cause) {
    const error = new Error(`Cannot reach the MPL backend (${API_BASE}). Start the backend with start-mpl.bat (Windows) or ./start-mpl.command (macOS), and check that port 4000 is available.`);
    error.cause = cause;
    throw error;
  }
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    error.details = data?.details;
    throw error;
  }
  return data;
}

const adminHeaders = (key) => ({ 'x-admin-key': key });
const jsonBody = (payload) => JSON.stringify(payload);

export const api = {
  health: () => request('/health'),
  site: () => request('/site'),
  sponsors: () => request('/sponsors'),
  tournaments: (type = '') => request(`/tournaments${type && type !== 'overall' ? `?type=${encodeURIComponent(type)}` : ''}`),
  teams: (type = '') => request(`/teams${type && type !== 'overall' ? `?type=${encodeURIComponent(type)}` : ''}`),
  jerseys: () => request('/jerseys'),
  uploadTeamJersey: (teamId, payload, key) => request(`/admin/teams/${encodeURIComponent(teamId)}/jersey`, { method: 'POST', headers: adminHeaders(key), body: jsonBody(payload) }),
  players: (type = '') => request(`/players${type && type !== 'overall' ? `?type=${encodeURIComponent(type)}` : ''}`),
  matches: (type = '', season = '') => { const query = new URLSearchParams(); if (type) query.set('type', type); if (season) query.set('season', season); const queryString = query.toString(); return request(`/matches${queryString ? `?${queryString}` : ''}`); },
  standings: (type = '', season = '') => { const query = new URLSearchParams(); if (type) query.set('type', type); if (season) query.set('season', season); const queryString = query.toString(); return request(`/standings${queryString ? `?${queryString}` : ''}`); },
  leaderboard: (type = 'overall', metric = 'mostRuns', season = '') => { const query = new URLSearchParams({ type, metric, limit: '200' }); if (season) query.set('season', season); return request(`/leaderboards?${query}`); },
  register: (payload) => request('/registrations', { method: 'POST', body: jsonBody(payload) }),

  auctionSummary: () => request('/auction/summary'),
  auctionPlayers: (status = '', search = '') => {
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (search) query.set('search', search);
    const queryString = query.toString();
    return request(`/auction/players${queryString ? `?${queryString}` : ''}`);
  },
  auctionEvents: () => request('/auction/events'),
  nominatePlayer: (payload, key) => request('/auction/nominate', { method: 'POST', headers: adminHeaders(key), body: jsonBody(payload) }),
  sellPlayer: (payload, key) => request('/auction/sell', { method: 'POST', headers: adminHeaders(key), body: jsonBody(payload) }),
  markPlayerUnsold: (payload, key) => request('/auction/mark-unsold', { method: 'POST', headers: adminHeaders(key), body: jsonBody(payload) }),
  updateAuctionSettings: (payload, key) => request('/auction/settings', { method: 'PATCH', headers: adminHeaders(key), body: jsonBody(payload) })
};
