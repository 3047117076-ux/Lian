import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3000/api' : 'https://lian-dq0q.onrender.com/api';

export default function UsagePanel({ sessionId, onClose }) {
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`${API_BASE}/chat/usage/${sessionId}`)
      .then(r => r.json())
      .then(setUsage)
      .catch(() => {});
  }, [sessionId]);

  const formatTokens = (n) => {
    if (!n) return '0';
    if (n > 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n > 1000) return (n / 1000).toFixed(0) + 'K';
    return String(n);
  };

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <h3>Token Usage</h3>
          <button onClick={onClose}>x</button>
        </div>
        <div className="panel-body">
          {usage ? (
            <>
              <div className="usage-stats">
                <div className="stat">
                  <span className="stat-num">{formatTokens(usage.totalTokens)}</span>
                  <span className="stat-label">Total Tokens</span>
                </div>
                <div className="stat">
                  <span className="stat-num">{usage.requestCount}</span>
                  <span className="stat-label">Requests</span>
                </div>
                <div className="stat">
                  <span className="stat-num">{formatTokens(usage.totalPrompt)}</span>
                  <span className="stat-label">Prompt</span>
                </div>
                <div className="stat">
                  <span className="stat-num">{formatTokens(usage.totalCompletion)}</span>
                  <span className="stat-label">Reply</span>
                </div>
              </div>
              {usage.daily && Object.keys(usage.daily).length > 0 && (
                <div className="daily-breakdown">
                  <h4>Daily</h4>
                  {Object.entries(usage.daily).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30).map(([day, d]) => (
                    <div key={day} className="daily-row">
                      <span className="daily-date">{day}</span>
                      <span className="daily-tokens">{formatTokens(d.total)}</span>
                      <span className="daily-count">x{d.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="panel-loading">Loading...</p>
          )}
        </div>
      </div>
    </div>
  );
}
