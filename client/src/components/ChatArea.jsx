import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ChatArea({
  messages, isLoading, streamingText, thinkingText, showThinking,
  currentSessionId, hasMore, onLoadMore, onRegenerate, onSend,
  userAvatar, assistantAvatar, backgroundImage,
}) {
  const [hoveredMsg, setHoveredMsg] = useState(null);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('claude-full');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const [replyVersions, setReplyVersions] = useState({});

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, thinkingText]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [currentSessionId]);

  const loadReplyVersions = async (vg) => {
    if (!vg || replyVersions[vg]) return;
    try {
      const API = import.meta.env.DEV ? 'http://localhost:3000/api' : 'https://lian-dq0q.onrender.com/api';
      const res = await fetch(`${API}/chat/versions?version_group=${vg}`);
      const data = await res.json();
      if (data.length > 1) {
        setReplyVersions(prev => ({ ...prev, [vg]: { versions: data, activeIdx: data.length - 1 } }));
      }
    } catch {}
  };

  const switchReplyVersion = (vg, dir) => {
    const info = replyVersions[vg];
    if (!info) return;
    const newIdx = info.activeIdx + dir;
    if (newIdx < 0 || newIdx >= info.versions.length) return;
    setReplyVersions(prev => ({ ...prev, [vg]: { ...info, activeIdx: newIdx } }));
  };

  const getActiveReplyContent = (msg) => {
    const vg = msg.version_group;
    if (!vg || !replyVersions[vg]) return msg.content;
    const info = replyVersions[vg];
    return info.versions[info.activeIdx]?.content || msg.content;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSend(input.trim(), 'openai', model);
    setInput('');
  };

  if (!currentSessionId) {
    return (
      <div className="chat-area empty">
        <div className="welcome">
          <h1>恋</h1>
          <p>select a conversation</p>
        </div>
      </div>
    );
  }

  const bgStyle = backgroundImage
    ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }
    : {};

  const defaultUserSvg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#2a2a2a" width="100" height="100"/><text y=".68em" x="50" text-anchor="middle" font-size="55">🐰</text></svg>');
  const defaultAssistantSvg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#1a1a1a" width="100" height="100"/><text y=".68em" x="50" text-anchor="middle" font-size="55">🐇</text></svg>');

  return (
    <div className="chat-area" style={bgStyle}>
      <div className="chat-header">
        <select value={model} onChange={(e) => setModel(e.target.value)} className="provider-select">
          <option value="claude-full">满血版</option>
          <option value="claude-max">Max版</option>
          <option value="claude-direct">直连 Claude</option>
        </select>
      </div>

      <div className="messages-container">
        {hasMore && (
          <button className="load-more-btn" onClick={onLoadMore}>Load earlier</button>
        )}
        {messages.filter((msg, i, arr) => {
          if (!msg.version_group) return true;
          // Only show the latest version in each group
          const maxVer = Math.max(...arr.filter(m => m.version_group === msg.version_group).map(m => m.reply_version || 0));
          return (msg.reply_version || 0) === maxVer;
        }).map((msg, idx) => (
          <div key={msg.id} className={`message ${msg.role}`}
            onMouseEnter={() => setHoveredMsg(msg.id)}
            onMouseLeave={() => setHoveredMsg(null)}>
            <div className="message-body">
              {msg.role === 'assistant' && (
                <div className="message-avatar"><img src={assistantAvatar || defaultAssistantSvg} alt="" /></div>
              )}
              <div className="message-bubble">
                <div className="message-content">
                  {msg.role === 'user' ? (
                  <EditableContent msg={msg} onEdited={(oldId) => {
                    let idx = messages.findIndex(m => m.id === oldId);
                    const nextAsst = idx >= 0 ? messages.slice(idx + 1).find(m => m.role === 'assistant') : null;
                    if (nextAsst) onRegenerate && onRegenerate('openai', 'claude-full', nextAsst.id);
                  }} />
                ) : <MarkdownRenderer content={getActiveReplyContent(msg)} />}
                </div>
                {msg.role === 'assistant' && (
                  <div className="msg-actions">
                    {msg.version_group && replyVersions[msg.version_group] && replyVersions[msg.version_group].versions.length > 1 && (
                      <>
                        <button onClick={() => switchReplyVersion(msg.version_group, -1)}
                          disabled={replyVersions[msg.version_group].activeIdx <= 0}>◂</button>
                        <span className="version-num">{replyVersions[msg.version_group].activeIdx + 1}/{replyVersions[msg.version_group].versions.length}</span>
                        <button onClick={() => switchReplyVersion(msg.version_group, 1)}
                          disabled={replyVersions[msg.version_group].activeIdx >= replyVersions[msg.version_group].versions.length - 1}>▸</button>
                      </>
                    )}
                    <button onClick={() => navigator.clipboard.writeText(getActiveReplyContent(msg))}>copy</button>
                    <button onClick={() => {
                      onRegenerate && onRegenerate('openai', 'claude-full', msg.id);
                      setTimeout(() => msg.version_group && loadReplyVersions(msg.version_group), 3000);
                    }}>retry</button>
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="message-avatar"><img src={userAvatar || defaultUserSvg} alt="" /></div>
              )}
            </div>
          </div>
        ))}

        {showThinking && thinkingText && (
          <div className="message thinking-bubble">
            <div className="thinking-header">Thinking...</div>
            <div className="thinking-content">{thinkingText}</div>
          </div>
        )}

        {streamingText && (
          <div className="message assistant">
            <div className="message-body">
              <div className="message-avatar"><img src={assistantAvatar || defaultAssistantSvg} alt="" /></div>
              <div className="message-content">{streamingText}<span className="cursor-blink">|</span></div>
            </div>
          </div>
        )}

        {isLoading && !streamingText && !thinkingText && (
          <div className="message assistant">
            <div className="message-content typing">
              <span className="dot">*</span><span className="dot">*</span><span className="dot">*</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-area" onSubmit={handleSubmit}>
        <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
          placeholder="say something..." rows={1} disabled={isLoading} />
        <button type="submit" disabled={isLoading || !input.trim()}>send</button>
      </form>
    </div>
  );
}

function EditableContent({ msg, onEdited }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(msg.content || '');

  const submit = async () => {
    if (!text.trim() || text === msg.content) { setEditing(false); return; }
    const API = import.meta.env.DEV ? 'http://localhost:3000/api' : 'https://lian-dq0q.onrender.com/api';
    const res = await fetch(`${API}/chat/edit-message`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: msg.id, newContent: text.trim() })
    });
    const data = await res.json();
    msg.content = text.trim();
    setEditing(false);
    if (onEdited) onEdited(msg.id, data.id);
  };

  if (editing) {
    return (
      <div className="edit-mode">
        <textarea value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          autoFocus />
        <div className="edit-actions">
          <button onClick={submit}>save</button>
          <button onClick={() => { setText(msg.content); setEditing(false); }}>cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="user-msg-row">
      <span>{msg.content}</span>
      <button className="edit-pen" onClick={() => { setText(msg.content); setEditing(true); }}>✎</button>
    </div>
  );
}

function MarkdownRenderer({ content }) {
  if (!content) return null;
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }) {
          if (inline) return <code className="inline-code" {...props}>{children}</code>;
          return <pre className="code-block"><code {...props}>{children}</code></pre>;
        },
      }}>
      {content}
    </ReactMarkdown>
  );
}
