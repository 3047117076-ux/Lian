/**
 * Sidebar — session list, new chat, and session management
 */
export default function Sidebar({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
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
            <div className="session-name">
              {session.name || 'New Chat'}
            </div>
            <div className="session-date">
              {formatDate(session.updated_at)}
            </div>
            <button
              className="delete-session-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Delete this conversation?')) {
                  onDeleteSession(session.id);
                }
              }}
              title="Delete"
            >
              🗑
            </button>
          </div>
        ))}

        {sessions.length === 0 && (
          <div className="no-sessions">
            <p>No conversations yet</p>
            <p className="hint">Click "+ New Chat" to start!</p>
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <p className="footer-text">Made with 💝 by Bunny</p>
      </div>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

  return date.toLocaleDateString();
}
