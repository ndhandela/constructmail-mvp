import React, { useState } from 'react';
import ClashUploader from '../components/ClashUploader';
import ClashDashboard from '../components/ClashDashboard';
import { parseNavisworksHTML } from '../components/ClashParser';
import '../styles/ClashAnalyzer.css';

export default function ClashAnalyzer() {
  const [report, setReport]         = useState(null);
  const [fileName, setFileName]     = useState('');
  const [parseError, setParseError] = useState('');

  const handleParsed = (htmlString, name) => {
    setParseError('');
    const result = parseNavisworksHTML(htmlString);

    if (result.parseErrors.length > 0 && result.clashes.length === 0) {
      setParseError(result.parseErrors[0]);
      return;
    }

    setFileName(name);
    setReport(result);
  };

  const handleReset = () => {
    setReport(null);
    setFileName('');
    setParseError('');
  };

  return (
    <main className="clash-page">
      {!report ? (
        <>
          <ClashUploader onParsed={handleParsed} />
          {parseError && (
            <div className="clash-parse-error">
              <strong>Parse error:</strong> {parseError}
            </div>
          )}
        </>
      ) : (
        <ClashDashboard
          report={report}
          fileName={fileName}
          onReset={handleReset}
        />
      )}
    </main>
  );
}
