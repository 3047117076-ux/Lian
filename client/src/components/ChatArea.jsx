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
  const [msgVersions, setMsgVersions] = useState({}); // { versionGroup: { versions: [...], current: N } }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, thinkingText]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [currentSessionId]);

  const loadVersions = async (msg) => {
    const vg = msg.version_group;
    if (!vg) return;
    if (msgVersions[vg]) return; // already loaded
    try {
      const API = import.meta.env.DEV ? 'http://localhost:3000/api' : 'https://lian-dq0q.onrender.com/api';
      const res = await fetch(`${API}/chat/versions?version_group=${vg}`);
      const data = await res.json();
      if (data.length > 1) {
        const current = (msg.reply_version || 0);
        setMsgVersions(prev => ({ ...prev, [vg]: { versions: data, current } }));
      }
    } catch {}
  };

  const switchMsgVersion = (vg, direction) => {
    const info = msgVersions[vg];
    if (!info) return;
    const newIdx = info.current + direction;
    if (newIdx < 0 || newIdx >= info.versions.length) return;
    setMsgVersions(prev => ({ ...prev, [vg]: { ...info, current: newIdx } }));
    // Update the message content in-place
    const target = info.versions[newIdx];
    const msg = messages.find(m => m.version_group === vg || m.id === target.id);
    if (msg) {
      msg.content = target.content;
      msg.id = target.id;
      msg.reply_version = target.reply_version;
      // Force re-render
      setHoveredMsg(null);
    }
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
        {messages.map((msg, idx) => (
          <div key={msg.id} className={`message ${msg.role}`}
            onMouseEnter={() => { setHoveredMsg(msg.id); if (msg.version_group) loadVersions(msg); }}
            onMouseLeave={() => setHoveredMsg(null)}>
            <div className="message-body">
              {msg.role === 'assistant' && (
                <div className="message-avatar"><img src={assistantAvatar || defaultAssistantSvg} alt="" /></div>
              )}
              <div className="message-bubble">
                <div className="message-content">
                  {msg.role === 'user' ? (
                  <div>
                    {msg.version_group && msgVersions[msg.version_group] && msgVersions[msg.version_group].versions.length > 1 && (
                      <div className="version-switcher">
                        <button onClick={() => switchMsgVersion(msg.version_group, -1)}
                          disabled={msgVersions[msg.version_group].current <= 0}>◂</button>
                        <span>{msgVersions[msg.version_group].current + 1}/{msgVersions[msg.version_group].versions.length}</span>
                        <button onClick={() => switchMsgVersion(msg.version_group, 1)}
                          disabled={msgVersions[msg.version_group].current >= msgVersions[msg.version_group].versions.length - 1}>▸</button>
                      </div>
                    )}
                    <EditableContent msg={msg} onEdited={(oldId, newId, versionGroup) => {
                      msg.id = newId;
                      msg.version_group = versionGroup;
                      // Load versions for this group
                      loadVersions(msg);
                      let idx = messages.findIndex(m => m.id === oldId);
                      if (idx < 0) idx = messages.findIndex(m => m.id === newId);
                      const nextAsst = messages.slice(idx + 1).find(m => m.role === 'assistant');
                      if (nextAsst) {
                        onRegenerate && onRegenerate('openai', 'claude-full', nextAsst.id);
                      }
                    }} />
                  </div>
                ) : <MarkdownRenderer content={msg.content} />}
                </div>
                {msg.role === 'assistant' && hoveredMsg === msg.id && (
                  <div className="msg-actions">
                    <button onClick={() => navigator.clipboard.writeText(msg.content)}>copy</button>
                    <button onClick={() => onRegenerate && onRegenerate('openai', 'claude-full', msg.id)}>retry</button>
                  </div>
                )}
                {msg.role === 'user' && hoveredMsg === msg.id && (
                  <div className="msg-actions">
                    <button onClick={() => navigator.clipboard.writeText(msg.content)}>copy</button>
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
    try {
      const API = import.meta.env.DEV ? 'http://localhost:3000/api' : 'https://lian-dq0q.onrender.com/api';
      const res = await fetch(`${API}/chat/edit-message`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: msg.id, newContent: text.trim() })
      });
      const data = await res.json();
      setEditing(false);
      if (onEdited) onEdited(msg.id, data.id, data.versionGroup);
    } catch (err) { console.error(err); }
  };

  if (!editing) {
    return (
      <span onClick={() => setEditing(true)} className="editable-text">
        {msg.content}
      </span>
    );
  }

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
