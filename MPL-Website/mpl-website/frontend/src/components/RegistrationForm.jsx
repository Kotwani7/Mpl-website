import { useState } from 'react';
import { CheckCircle2, LoaderCircle, Send } from 'lucide-react';
import { api } from '../lib/api';

const initialForm = { fullName: '', email: '', phone: '', age: '', city: '', tournamentType: 'ground', role: 'All-rounder', teamPreference: 'No preference', experience: 'Intermediate', battingStyle: 'Right-hand', bowlingStyle: 'Not applicable', message: '', consent: false };

export default function RegistrationForm({ open = true }) {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  async function handleSubmit(event) {
    event.preventDefault(); setBusy(true); setStatus({ type: '', message: '' });
    try {
      const result = await api.register({ ...form, age: Number(form.age) });
      setStatus({ type: 'success', message: `${result.message} Your reference: ${result.registrationId.slice(0, 8).toUpperCase()}` });
      setForm(initialForm);
    } catch (error) { setStatus({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  }
  if (!open) return <div className="registration-form"><p className="form-note">Player registration is currently closed. The MPL team will announce entry dates and details here when registration opens.</p></div>;
  return <form className="registration-form" onSubmit={handleSubmit}>
    <div className="form-grid">
      <label>Full name<input required minLength="2" maxLength="80" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="Your full name" /></label>
      <label>Email address<input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" /></label>
      <label>Mobile number<input required type="tel" minLength="8" maxLength="18" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98765 43210" /></label>
      <label>Age<input required type="number" min="14" max="60" value={form.age} onChange={(e) => set('age', e.target.value)} placeholder="Your age" /></label>
      <label>City / Area<input required value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="e.g. Ambarnath" /></label>
      <label>Tournament format<select id="registration-format" value={form.tournamentType} onChange={(e) => set('tournamentType', e.target.value)}><option value="ground">Open Ground</option><option value="turf">Turf</option></select></label>
      <label>Playing role<select value={form.role} onChange={(e) => set('role', e.target.value)}>{['Batter', 'Bowler', 'All-rounder', 'Wicketkeeper'].map((v) => <option key={v}>{v}</option>)}</select></label>
      <label>Experience level<select value={form.experience} onChange={(e) => set('experience', e.target.value)}>{['Beginner', 'Intermediate', 'Advanced'].map((v) => <option key={v}>{v}</option>)}</select></label>
      <label>Batting style<select value={form.battingStyle} onChange={(e) => set('battingStyle', e.target.value)}><option>Right-hand</option><option>Left-hand</option><option>Not applicable</option></select></label>
      <label>Bowling style<input value={form.bowlingStyle} onChange={(e) => set('bowlingStyle', e.target.value)} placeholder="e.g. Right-arm medium" /></label>
      <label className="form-grid__wide">Preferred team (optional)<input value={form.teamPreference} onChange={(e) => set('teamPreference', e.target.value)} placeholder="No preference" /></label>
      <label className="form-grid__wide">Anything else we should know?<textarea rows="3" maxLength="500" value={form.message} onChange={(e) => set('message', e.target.value)} placeholder="Previous teams, availability, questions..." /></label>
    </div>
    <label className="consent-line"><input type="checkbox" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} required /> I agree to be contacted by the MPL organisers about registration and tournament updates.</label>
    {status.message && <div className={`form-status form-status--${status.type}`} role="status">{status.type === 'success' ? <CheckCircle2 size={18} /> : null}{status.message}</div>}
    <button className="button button--gold form-submit" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} /> Submitting...</> : <>Submit registration <Send size={16} /></>}</button>
    <p className="form-note">Submitting this form sends your details to the MPL organisers. A submission is not confirmation of a team slot.</p>
  </form>;
}
