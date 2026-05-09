// Email Service - swap providers here without touching other code
// Current provider: SendGrid
// To switch: replace the sendEmail function below

const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const FROM_EMAIL = 'connect@techdensolutions.com';
const FROM_NAME = 'TechDen Solutions';

/**
 * Send an email
 * @param {string} to - recipient email
 * @param {string} subject - email subject
 * @param {string} html - email body in HTML
 */
exports.sendEmail = async ({ to, subject, html }) => {
  const msg = {
    to,
    from: {
      email: FROM_EMAIL,
      name: FROM_NAME
    },
    subject,
    html
  };

  await sgMail.send(msg);
};

/* 
  TO SWITCH TO ANOTHER PROVIDER (e.g. Resend, Postmark, AWS SES):
  1. npm install <new-provider-package>
  2. Replace the sgMail logic above with new provider
  3. Keep the exports.sendEmail signature the same
  4. Everything else in the codebase stays untouched
*/