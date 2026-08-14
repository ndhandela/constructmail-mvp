import React, { useState } from 'react';
import axios from 'axios';
import '../styles/Demo.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function Demo() {
  const [formData, setFormData] = useState({ name: '', email: '', company: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await axios.post(`${API_BASE_URL}/api/contact`, { ...formData, source: 'demo' });
      setSuccess(true);
      setFormData({ name: '', email: '', company: '', message: '' });
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="demo-container">
      <title>Book a Demo | POMAR</title>
      <meta name="description" content="See POMAR Mail and POMAR Clash in action on real project data. Book a free 20-minute demo — no obligation." />
      <link rel="canonical" href="https://pomar.ai/demo" />
      <section className="demo-hero">
        <video className="page-hero-video" autoPlay muted loop playsInline
          poster="/videos/hero-construction-poster.jpg">
          <source src="/videos/hero-construction.mp4" type="video/mp4" />
        </video>
        <div className="page-hero-overlay"></div>
        <div className="demo-eyebrow">See It In Action</div>
        <h1>Book a <em>Live Demo.</em></h1>
        <p className="demo-hero-sub">
          20 minutes, no obligation. We'll walk through POMAR Mail and POMAR Clash on real
          project data and talk pricing based on your team.
        </p>
      </section>

      <section className="demo-body-wrap">
        <div className="demo-body">
          <div className="demo-info">
            <div className="demo-section-eyebrow">What to Expect</div>
            <h2>We'll show, not just tell.</h2>
            <p>
              Bring a recent RFI thread or clash report if you want — we'll run it through POMAR
              live so you can see exactly what your team would get.
            </p>
            <div className="demo-details">
              <div className="demo-detail">
                <span className="demo-icon-pill">20m</span>
                <span>Quick walkthrough, no lengthy sales pitch</span>
              </div>
              <div className="demo-detail">
                <span className="demo-icon-pill">$</span>
                <span>We'll talk pricing scoped to your modules and project count</span>
              </div>
              <div className="demo-detail">
                <span className="demo-icon-pill">24h</span>
                <span>We'll follow up to schedule within one business day</span>
              </div>
            </div>
          </div>

          <div className="demo-form-wrapper">
            {success ? (
              <div className="demo-success">
                <div className="success-mark">✓</div>
                <h3>Request Sent</h3>
                <p>Thanks — we'll reach out within 24 hours to find a time.</p>
                <button onClick={() => setSuccess(false)} className="demo-btn">Send Another Request</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="demo-form">
                <div className="form-group">
                  <label>Full Name *</label>
                  <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="John Smith" required />
                </div>
                <div className="form-group">
                  <label>Work Email *</label>
                  <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="john@yourcompany.com" required />
                </div>
                <div className="form-group">
                  <label>Company</label>
                  <input type="text" name="company" value={formData.company} onChange={handleChange} placeholder="Smith Construction LLC" />
                </div>
                <div className="form-group">
                  <label>What would you like to see? *</label>
                  <textarea name="message" value={formData.message} onChange={handleChange} placeholder="POMAR Mail, POMAR Clash, both — and anything specific you'd like covered..." rows={5} required />
                </div>
                {error && <div className="demo-error">{error}</div>}
                <button type="submit" disabled={loading} className="demo-btn">{loading ? 'Sending...' : 'Request Demo'}</button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
