import React from 'react';
import '../styles/PrivacyPolicy.css';

export default function PrivacyPolicy() {
  return (
    <div className="privacy-container">
      <div className="privacy-content">
        <h1>Privacy Policy</h1>
        <p className="last-updated">Last updated: May 2025</p>

        <section>
          <h2>1. Introduction</h2>
          <p>TechDen Solutions ("we", "our", or "us") operates ConstructMail Intelligence at pomar.ai. This Privacy Policy explains how we collect, use, and protect your information when you use our service.</p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>
          <p>When you connect your Gmail account, we access:</p>
          <ul>
            <li>Your email address for authentication</li>
            <li>Email content you select for analysis</li>
            <li>Basic profile information (name, email)</li>
          </ul>
        </section>

        <section>
          <h2>3. How We Use Your Information</h2>
          <p>We use your information solely to:</p>
          <ul>
            <li>Authenticate your identity</li>
            <li>Analyze email content you submit using AI</li>
            <li>Improve our service</li>
          </ul>
        </section>

        <section>
          <h2>4. What We Do NOT Do</h2>
          <ul>
            <li>We do not store your emails</li>
            <li>We do not sell your data to third parties</li>
            <li>We do not send emails on your behalf</li>
            <li>We do not share your data with advertisers</li>
          </ul>
        </section>

        <section>
          <h2>5. Gmail Data</h2>
          <p>ConstructMail Intelligence uses Gmail API in read-only mode. We only access emails you explicitly select for analysis. We do not store email content after analysis is complete.</p>
        </section>

        <section>
          <h2>6. Data Security</h2>
          <p>We implement industry-standard security measures to protect your data. Gmail access tokens are stored securely and used only for the purpose of fetching emails you request.</p>
        </section>

        <section>
          <h2>7. Contact Us</h2>
          <p>If you have questions about this Privacy Policy, contact us at:</p>
          <p><strong>TechDen Solutions</strong><br />
          Prosper, TX<br />
          Email: info@techdensolutions.com</p>
        </section>
      </div>
    </div>
  );
}