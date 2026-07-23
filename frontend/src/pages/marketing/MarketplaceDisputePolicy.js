import React from 'react';
import '../../styles/PrivacyPolicy.css';

// Structure-only placeholder — mirrors the flow implemented in
// routers/marketplace.py's POST /listings/{id}/reviews/{review_id}/dispute.
// No binding legal language belongs here.
export default function MarketplaceDisputePolicy() {
  return (
    <div className="privacy-container">
      <section className="privacy-hero">
        <div className="privacy-eyebrow">Legal</div>
        <h1>POMAR Marketplace Dispute Policy</h1>
        <p className="last-updated">Draft — not yet reviewed by counsel</p>
      </section>

      <section className="privacy-body">
        <div className="privacy-content">
          <section>
            <h2>1. Who Can Dispute a Review</h2>
            <p>[LEGAL REVIEW NEEDED: who can file a dispute — today, only the business (sub) that has claimed the listing a review was left on. Confirm this is the intended scope and whether unclaimed listings need a separate path.]</p>
          </section>

          <section>
            <h2>2. What Happens When a Review Is Disputed</h2>
            <p>[LEGAL REVIEW NEEDED: dispute mechanics — the reviewing GC is notified and can edit their own review; POMAR does not edit review content on anyone's behalf and does not share either party's contact information as part of this process.]</p>
          </section>

          <section>
            <h2>3. Review Removal / Hiding</h2>
            <p>[LEGAL REVIEW NEEDED: moderation authority — Admin may hide a review as a moderation action (logged), but never edits its content. Define the standard for when hiding is warranted.]</p>
          </section>

          <section>
            <h2>4. Escalation</h2>
            <p>[LEGAL REVIEW NEEDED: what a business can do if a dispute doesn't resolve through the in-product flow.]</p>
          </section>
        </div>
      </section>
    </div>
  );
}
