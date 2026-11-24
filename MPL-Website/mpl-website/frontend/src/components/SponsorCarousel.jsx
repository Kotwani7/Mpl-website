import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Handshake } from 'lucide-react';

export default function SponsorCarousel({ sponsors = [] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (sponsors.length < 2 || paused) return undefined;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % sponsors.length), 3000);
    return () => window.clearInterval(timer);
  }, [sponsors.length, active, paused]);

  if (!sponsors.length) return <section className="sponsor-strip sponsor-strip--empty" aria-label="MPL sponsors">
    <div className="sponsor-strip__label"><Handshake size={15} /> MPL PARTNERS</div>
    <div className="sponsor-carousel"><div className="sponsor-mark">MPL</div><div className="sponsor-copy"><strong>SPONSORS ANNOUNCED SOON</strong><span>Official sponsor artwork will appear here.</span></div></div>
  </section>;

  const sponsor = sponsors[active % sponsors.length];
  const slide = <div className={`sponsor-slide sponsor-slide--${sponsor.slideKind === 'banner' ? 'banner' : 'logo'}`} key={sponsor.id}>
    {sponsor.imageUrl ? <img className="sponsor-slide__image" src={sponsor.imageUrl} alt={`${sponsor.name}${sponsor.slideKind === 'banner' ? ' promotional banner' : ' logo'}`} /> :
      <div className="sponsor-mark" style={{ '--sponsor-color': sponsor.color || '#d9a21b' }}>{sponsor.initials || sponsor.name.slice(0, 2).toUpperCase()}</div>}
    <div className="sponsor-slide__copy"><span className="eyebrow">{sponsor.tier || 'MPL PARTNER'}</span><strong>{sponsor.name}</strong><span>{sponsor.tag || 'Proud to support Mahakal Premier League'}</span></div>
  </div>;

  return <section className="sponsor-strip sponsor-strip--gallery" aria-label="MPL sponsors"
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
    <div className="sponsor-strip__label"><Handshake size={15} /> OFFICIAL PARTNERS</div>
    <div className="sponsor-carousel" aria-live="polite">
      <button type="button" className="sponsor-control" onClick={() => setActive((current) => (current - 1 + sponsors.length) % sponsors.length)} aria-label="Previous sponsor"><ChevronLeft size={19} /></button>
      {sponsor.linkUrl ? <a className="sponsor-slide__anchor" href={sponsor.linkUrl} target="_blank" rel="noreferrer">{slide}</a> : slide}
      <button type="button" className="sponsor-control" onClick={() => setActive((current) => (current + 1) % sponsors.length)} aria-label="Next sponsor"><ChevronRight size={19} /></button>
    </div>
    <div className="sponsor-dots" aria-label={`Sponsor ${active + 1} of ${sponsors.length}`}>
      {sponsors.map((item, index) => <button key={item.id} type="button" className={active === index ? 'is-active' : ''} onClick={() => setActive(index)} aria-label={`Show ${item.name}`} aria-pressed={active === index} />)}
    </div>
  </section>;
}
