import React from 'react';
import { getProductById } from '../../config/products';
import '../../styles/LandingPage.css';
import '../../styles/MarketingPage.css';

const HOW_IT_WORKS = [
  'Open Daily Logs from your phone on site — no separate app, same POMAR login your team already uses.',
  'Log the date, weather, crew count, and what got done today in a couple of taps.',
  'Note any delays and tag the cause — weather, material, labor, or other — so patterns show up later instead of getting lost in a notebook.',
  'Snap and attach site photos on the spot. Everything lands in one live, per-project record the whole office can see.',
];

export default function DailyLogsMarketing() {
  const product = getProductById('daily_logs');

  return (
    <div className="marketing-page">
      <section className="hero marketing-hero">
        <video className="page-hero-video" autoPlay muted loop playsInline
          poster="/videos/hero-daily-logs-poster.jpg">
          <source src="/videos/hero-daily-logs.mp4" type="video/mp4" />
        </video>
        <div className="page-hero-overlay"></div>
        <div className="hero-eyebrow">Field Intelligence</div>
        <h1 className="hero-title">{product.name}</h1>
        <p className="hero-sub">Replace the paper logbook. Log crew, weather, delays, and site photos from your phone in under two minutes.</p>
        <div className="hero-cta">
          <a href="/login" className="btn-primary">Try POMAR Daily Logs</a>
        </div>
      </section>

      <section className="marketing-body">
        <div className="section-inner">
          <div className="section-eyebrow">Why POMAR Daily Logs</div>
          <p className="section-body" style={{ maxWidth: '820px' }}>{product.detailedDescription}</p>

          <div className="section-eyebrow">How It Works</div>
          <ul className="marketing-howitworks">
            {HOW_IT_WORKS.map((step, i) => (
              <li key={i} data-step={i + 1}>{step}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="marketing-cta-section">
        <h2 className="section-h2 centered">Ready to close the site trailer notebook?</h2>
        <div className="hero-cta">
          <a href="/login" className="btn-primary">Try POMAR Daily Logs</a>
        </div>
      </section>
    </div>
  );
}
