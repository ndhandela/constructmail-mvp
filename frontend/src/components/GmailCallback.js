import { useEffect } from 'react';

export default function GmailCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      window.opener.postMessage({ type: 'GMAIL_CALLBACK', error }, '*');
      window.close();
      return;
    }

    if (code) {
      window.opener.postMessage({ type: 'GMAIL_CALLBACK', code }, '*');
      window.close();
    }
  }, []);

  return <div>Connecting Gmail... please wait.</div>;
}