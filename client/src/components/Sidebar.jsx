/**
 * Sidebar — session list + feature menu
 */
export default function Sidebar({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onOpenPanel,
}) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>恋</h2>
      </div>

      <button className="new-chat-btn" onClick={onNewSession}>
        + New Chat
      </button>

      <div className="session-list">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`session-item ${session.id === currentSessionId ? 'active' : ''}`}
            onClick={() => onSelectSession(session.id)}
          >
            <div className="session-name">{session.name || 'New Chat'}</div>
            <div className="session-date">{formatDate(session.updated_at)}</div>
            <button className="delete-session-btn" onClick={(e) => {
              e.stopPropagation();
              if (confirm('Delete?')) onDeleteSession(session.id);
            }} title="Delete">x</button>
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="no-sessions"><p>No conversations</p></div>
        )}
      </div>

      {/* Feature Menu */}
      <div className="sidebar-menu">
        <button className="menu-item" onClick={() => onOpenPanel('usage')}>
          <span className="menu-icon">&#9633;</span> Token Usage
        </button>
        <button className="menu-item" onClick={() => onOpenPanel('mood')}>
          <span className="menu-icon">&#9829;</span> Daily Mood
        </button>
        <button className="menu-item" onClick={() => onOpenPanel('dates')}>
          <span className="menu-icon">&#9733;</span> Anniversaries
        </button>
        <button className="menu-item" onClick={() => onOpenPanel('export')}>
          <span className="menu-icon">&#8593;</span> Export Chat
        </button>
      </div>

      <div className="sidebar-footer">
        <p className="footer-text">恋</p>
      </div>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
  return d.toLocaleDateString();
}
