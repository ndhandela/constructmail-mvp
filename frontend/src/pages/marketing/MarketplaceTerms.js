import React from 'react';
import '../../styles/PrivacyPolicy.css';

// Structure-only placeholder — see routers/marketplace.py for the endpoints
// this page documents. No binding legal language belongs here; every
// [LEGAL REVIEW NEEDED: ...] block needs real counsel before launch.
export default function MarketplaceTerms() {
  return (
    <div className="privacy-container">
      <title>Marketplace Terms | POMAR</title>
      <meta name="description" content="Terms governing reviews, listings, and disputes on the POMAR Marketplace vendor network." />
      <link rel="canonical" href="https://pomar.ai/marketplace/terms" />
      <section className="privacy-hero">
        <div className="privacy-eyebrow">Legal</div>
        <h1>POMAR Marketplace Terms</h1>
        <p className="last-updated">Draft — not yet reviewed by counsel</p>
      </section>

      <section className="privacy-body">
        <div className="privacy-content">
          <section>
            <h2>1. Review Content Ownership</h2>
            <p>[LEGAL REVIEW NEEDED: review content ownership — who owns a review's text/rating once posted, what license POMAR holds to display and moderate it, and what happens to that content if the reviewer's account is closed.]</p>
          </section>

          <section>
            <h2>2. No Fake Review Policy</h2>
            <p>[LEGAL REVIEW NEEDED: no-fake-review policy — prohibited conduct (incentivized/paid reviews, reviews from accounts with no real relationship to the listing, review manipulation), and consequences for violations.]</p>
          </section>

          <section>
            <h2>3. Listing Removal Rights</h2>
            <p>[LEGAL REVIEW NEEDED: listing removal rights — under what circumstances a business can require its listing be removed, how the removal-request review process works, and how competitor-abuse of that process is handled.]</p>
          </section>

          <section>
            <h2>4. Dispute Process</h2>
            <p>[LEGAL REVIEW NEEDED: dispute process — see also the Dispute Policy page. Governs how a disputed review is handled, response timelines, and each party's rights during a dispute.]</p>
          </section>
        </div>
      </section>
    </div>
  );
}
