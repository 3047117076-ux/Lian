import { useState, useRef, useEffect } from 'react';
import { getVersions } from '../utils/api';

/**
 * ChatArea — the main chat display and input area
 */
export default function ChatArea({
  messages,
  isLoading,
  streamingText,
  thinkingText,
  showThinking,
  currentSessionId,
  hasMore,
  onLoadMore,
  onRegenerate,
  onSend,
  onEditMessage,
  onDeleteMessage,
  switchVersion,
  userAvatar,
  assistantAvatar,
  backgroundImage,
}) {
  const [input, setInput] = useState('');
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('claude-full');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, thinkingText]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [currentSessionId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSend(input.trim(), provider, model);
    setInput('');
  };

  if (!currentSessionId) {
    return (
      <div className="chat-area empty">
        <div className="welcome">
          <h1>恋</h1>
          <p>Create or select a conversation to start chatting</p>
          <div className="welcome-emoji">🐇✨💕</div>
        </div>
      </div>
    );
  }

  const bgStyle = backgroundImage
    ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }
    : {};

  return (
    <div className="chat-area" style={bgStyle}>
      <div className="chat-header">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="provider-select"
        >
          <option value="claude-full">🧠 满血版</option>
          <option value="claude-max">⚡ Max版</option>
          <option value="claude-direct">🔷 直连 Claude</option>
        </select>
      </div>

      <div className="messages-container">
        {hasMore && (
          <button className="load-more-btn" onClick={onLoadMore}>
            ↑ Load earlier messages
          </button>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg}
            avatar={msg.role === 'user' ? userAvatar : assistantAvatar}
            onEdit={onEditMessage}
            onDelete={onDeleteMessage}
            onSwitchVersion={switchVersion}
            onRegenerate={onRegenerate}
          />
        ))}

        {/* Thinking indicator */}
        {showThinking && thinkingText && (
          <ThinkingBubble text={thinkingText} />
        )}

        {/* Streaming message */}
        {streamingText && (
          <div className="message assistant">
            <div className="message-content">
              {streamingText}
              <span className="cursor-blink">▊</span>
            </div>
          </div>
        )}

        {/* Loading indicator while waiting for first token */}
        {isLoading && !streamingText && !thinkingText && (
          <div className="message assistant">
            <div className="message-content typing">
              <span className="dot">●</span>
              <span className="dot">●</span>
              <span className="dot">●</span>
            </div>
          </div>
        )}

        {messages.length > 0 && !isLoading && (
          <button className="regenerate-btn" onClick={() => onRegenerate && onRegenerate('openai', model)}>
            ↩ 换一个回复
          </button>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-area" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="Say something sweet..."
          rows={1}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          💌
        </button>
      </form>
    </div>
  );
}

/**
 * MessageBubble — individual message display
 */
const defaultUserSvg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#2a2a2a" width="100" height="100"/><text y=".68em" x="50" text-anchor="middle" font-size="55">🐰</text></svg>');
const defaultAssistantSvg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#1a1a1a" width="100" height="100"/><text y=".68em" x="50" text-anchor="middle" font-size="55">🐇</text></svg>');

function MessageBubble({ message, avatar, onEdit, onDelete, onSwitchVersion, onRegenerate }) {
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [showReasoning, setShowReasoning] = useState(false);
  const [currentVersion, setCurrentVersion] = useState(message.reply_version ?? 0);
  const [versions, setVersions] = useState([]);

  const avatarSrc = avatar || (message.role === 'user' ? defaultUserSvg : defaultAssistantSvg);
  const versionCount = versions.length > 0 ? versions.length : 1;
  const isImported = !message.reply_to && !message.reply_version; // no version info = imported

  // Copy content
  const handleCopy = () => {
    navigator.clipboard.writeText(message.content || '').catch(() => {});
  };

  // Start editing
  const startEdit = () => { setEditText(message.content || ''); setEditing(true); };
  const submitEdit = () => {
    if (editText.trim() && editText !== message.content) {
      onEdit && onEdit(message.id, editText.trim());
    }
    setEditing(false);
  };

  // Load versions for assistant messages
  const loadVersions = async () => {
    if (!message.reply_to) return;
    try {
      const v = await getVersions(message.reply_to);
      setVersions(v);
    } catch {}
  };

  const switchToVersion = (v) => {
    setCurrentVersion(v);
    onSwitchVersion && onSwitchVersion(message.reply_to, v);
  };

  if (message.role === 'user') {
    return (
      <div className="message user" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <div className="message-body">
          <div className="message-bubble">
            {editing ? (
              <div className="edit-mode">
                <textarea value={editText} onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(); } }}
                  autoFocus />
                <div className="edit-actions">
                  <button onClick={submitEdit}>Save</button>
                  <button onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="message-content">{message.content}</div>
            )}
            {hover && !editing && (
              <div className="msg-toolbar">
                <button onClick={startEdit} title="Edit">✏</button>
                <button onClick={() => onDelete && onDelete(message.id)} title="Delete">✕</button>
                <button onClick={handleCopy} title="Copy">📋</button>
              </div>
            )}
          </div>
          <div className="message-avatar"><img src={avatarSrc} alt="" /></div>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="message assistant" onMouseEnter={() => { setHover(true); loadVersions(); }} onMouseLeave={() => setHover(false)}>
      <div className="message-body">
        <div className="message-avatar"><img src={avatarSrc} alt="" /></div>
        <div className="message-bubble">
          {message.reasoning_content && (
            <div className="reasoning-toggle">
              <button onClick={() => setShowReasoning(!showReasoning)}>
                {showReasoning ? 'Hide thinking' : 'Show thinking'}
              </button>
              {showReasoning && <div className="reasoning-content">{message.reasoning_content}</div>}
            </div>
          )}
          <div className="message-content">
            <MarkdownRenderer content={message.content} />
          </div>
          {/* Toolbar */}
          <div className="msg-toolbar">
            {versions.length > 1 && (
              <>
                <button onClick={() => { const cv = currentVersion; const idx = versions.findIndex(v => v.reply_version === cv); if (idx > 0) switchToVersion(versions[idx-1].reply_version); }}
                  disabled={versions.findIndex(v => v.reply_version === currentVersion) <= 0}>◂</button>
                <span className="version-info">{versions.findIndex(v => v.reply_version === currentVersion) + 1}/{versionCount}</span>
                <button onClick={() => { const idx = versions.findIndex(v => v.reply_version === currentVersion); if (idx < versionCount - 1) switchToVersion(versions[idx+1].reply_version); }}
                  disabled={versions.findIndex(v => v.reply_version === currentVersion) >= versionCount - 1}>▸</button>
              </>
            )}
            <button onClick={handleCopy} title="Copy">📋</button>
            <button onClick={() => onRegenerate && onRegenerate('openai', 'claude-full')} title="Regenerate">↻</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ThinkingBubble — shows AI's thought process in real-time
 */
function ThinkingBubble({ text }) {
  return (
    <div className="message thinking-bubble">
      <div className="thinking-header">🧠 Thinking...</div>
      <div className="thinking-content">{text}</div>
    </div>
  );
}

/**
 * Simple Markdown renderer using react-markdown
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function MarkdownRenderer({ content }) {
  if (!content) return null;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }) {
          if (inline) {
            return <code className="inline-code" {...props}>{children}</code>;
          }
          return (
            <pre className="code-block">
              <code {...props}>{children}</code>
            </pre>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
