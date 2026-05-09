import React, { useState } from 'react';
import axios from 'axios';
import '../styles/Contact.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    message: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await axios.post(`${API_BASE_URL}/api/contact`, formData);
      setSuccess(true);
      setFormData({ name: '', email: '', company: '', message: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="contact-container">
      <div className="contact-hero">
        <h1>Book a Free Consultation</h1>
        <p>Tell us about your project. We'll get back to you within 24 hours.</p>
      </div>

      <div className="contact-body">
        <div className="contact-info">
          <h2>Let's Talk</h2>
          <p>Whether you're looking to streamline your project communications, implement construction technology, or just want to see a demo of ConstructMail Intelligence — we'd love to hear from you.</p>

          <div className="contact-details">
            <div className="contact-detail">
              <span className="contact-icon">📍</span>
              <span>Prosper, TX — serving GCs across DFW and beyond</span>
            </div>
            <div className="contact-detail">
              <span className="contact-icon">📧</span>
              <span>connect@techdensolutions.com</span>
            </div>
            <div className="contact-detail">
              <span className="contact-icon">⏱️</span>
              <span>Response within 24 hours</span>
            </div>
          </div>
        </div>

        <div className="contact-form-wrapper">
          {success ? (
            <div className="contact-success">
              <div className="success-icon">✅</div>
              <h3>Message Sent!</h3>
              <p>Thank you for reaching out. We'll get back to you within 24 hours.</p>
              <button onClick={() => setSuccess(false)} className="contact-btn">
                Send Another Message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="contact-form">
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="John Smith"
                  required
                />
              </div>

              <div className="form-group">
                <label>Email Address *</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="john@yourcompany.com"
                  required
                />
              </div>

              <div className="form-group">
                <label>Company</label>
                <input
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  placeholder="Smith Construction LLC"
                />
              </div>

              <div className="form-group">
                <label>Message *</label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  placeholder="Tell us about your project or what you'd like to discuss..."
                  rows={5}
                  required
                />
              </div>

              {error && <div className="contact-error">{error}</div>}

              <button type="submit" disabled={loading} className="contact-btn">
                {loading ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}