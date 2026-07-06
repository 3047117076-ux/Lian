import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API = import.meta.env.DEV ? 'http://localhost:3000/api' : 'https://lian-dq0q.onrender.com/api';

export default function ChatArea({
  messages, isLoading, streamingText, thinkingText, showThinking,
  currentSessionId, hasMore, onLoadMore, onRegenerate, onSend,
  userAvatar, assistantAvatar, backgroundImage,
}) {
  const [input, setInput] = useState('');
  const [model, setModel] = useState('claude-full');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const [versions, setVersions] = useState({}); // { versionGroup: { msgs: [...], active: idx } }
  const [forceUpdate, setForceUpdate] = useState(0);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingText, thinkingText]);
  useEffect(() => { inputRef.current?.focus(); }, [currentSessionId]);

  // Load versions for a version_group
  const loadVersions = async (vg) => {
    if (!vg) return;
    const res = await fetch(`${API}/chat/versions?version_group=${vg}`);
    const data = await res.json();
    if (data.length > 1) {
      setVersions(prev => ({ ...prev, [vg]: { msgs: data, active: data.length - 1 } }));
    } else {
      setVersions(prev => { const n = { ...prev }; delete n[vg]; return n; });
    }
  };

  // Auto-load versions when messages change
  const versionsLoaded = useRef(new Set());
  useEffect(() => {
    if (messages.length === 0) return;
    messages.forEach(m => {
      if (m.version_group && !versionsLoaded.current.has(m.version_group)) {
        versionsLoaded.current.add(m.version_group);
        loadVersions(m.version_group);
      }
    });
  }, [messages.length, currentSessionId]);

  const switchVersion = (vg, dir) => {
    const info = versions[vg];
    if (!info) return;
    const idx = info.active + dir;
    if (idx < 0 || idx >= info.msgs.length) return;
    setVersions(prev => ({ ...prev, [vg]: { ...info, active: idx } }));
    setForceUpdate(n => n + 1);
  };

  // Filter: only show active version per group
  const visibleMessages = (() => {
    const groupActive = {}; // vg → active message id
    for (const [vg, info] of Object.entries(versions)) {
      if (info.msgs[info.active]) groupActive[vg] = info.msgs[info.active].id;
    }
    // For groups without loaded versions, show highest reply_version
    const maxVer = {};
    messages.forEach(m => {
      if (!m.version_group) return;
      if (!groupActive[m.version_group]) {
        const v = m.reply_version || 0;
        if (!maxVer[m.version_group] || v > maxVer[m.version_group].ver) {
          maxVer[m.version_group] = { id: m.id, ver: v };
        }
      }
    });
    for (const [vg, info] of Object.entries(maxVer)) groupActive[vg] = info.id;

    return messages.filter(m => {
      if (!m.version_group) return true;
      return groupActive[m.version_group] === m.id;
    });
  })();

  if (!currentSessionId) {
    return (
      <div className="chat-area empty">
        <div className="welcome"><h1>恋</h1><p>select a conversation</p></div>
      </div>
    );
  }

  const bgStyle = backgroundImage ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' } : {};
  const uSvg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#2a2a2a" width="100" height="100"/><text y=".68em" x="50" text-anchor="middle" font-size="55">🐰</text></svg>');
  const aSvg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#1a1a1a" width="100" height="100"/><text y=".68em" x="50" text-anchor="middle" font-size="55">🐇</text></svg>');

  const handleRetry = (msg) => {
    onRegenerate && onRegenerate('openai', 'claude-full', msg.id);
    if (msg.version_group) setTimeout(() => loadVersions(msg.version_group), 8000);
  };

  const handleEdit = (oldId) => {
    let idx = messages.findIndex(m => m.id === oldId);
    const nextAsst = idx >= 0 ? messages.slice(idx + 1).find(m => m.role === 'assistant') : null;
    if (nextAsst) {
      const vg = messages.find(m => m.id === oldId)?.version_group || oldId;
      onRegenerate && onRegenerate('openai', 'claude-full', nextAsst.id);
      setTimeout(() => loadVersions(vg), 8000);
    }
  };

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
        {hasMore && <button className="load-more-btn" onClick={onLoadMore}>Load earlier</button>}

        {visibleMessages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-body">
              {msg.role === 'assistant' && <div className="message-avatar"><img src={assistantAvatar || aSvg} alt="" /></div>}
              <div className="message-bubble">
                {/* Version switcher for user messages */}
                {msg.role === 'user' && msg.version_group && versions[msg.version_group] && versions[msg.version_group].msgs.length > 1 && (
                  <div className="version-switcher">
                    <button onClick={() => switchVersion(msg.version_group, -1)} disabled={versions[msg.version_group].active <= 0}>◂</button>
                    <span>{versions[msg.version_group].active + 1}/{versions[msg.version_group].msgs.length}</span>
                    <button onClick={() => switchVersion(msg.version_group, 1)} disabled={versions[msg.version_group].active >= versions[msg.version_group].msgs.length - 1}>▸</button>
                  </div>
                )}
                <div className="message-content">
                  {msg.role === 'user' ? <EditableContent msg={msg} onEdited={handleEdit} /> : <MarkdownRenderer content={msg.content} />}
                </div>
                {/* Version switcher + actions for AI replies */}
                {msg.role === 'assistant' && (
                  <div className="msg-actions">
                    {msg.version_group && versions[msg.version_group] && versions[msg.version_group].msgs.length > 1 && (
                      <>
                        <button onClick={() => switchVersion(msg.version_group, -1)} disabled={versions[msg.version_group].active <= 0}>◂</button>
                        <span className="version-num">{versions[msg.version_group].active + 1}/{versions[msg.version_group].msgs.length}</span>
                        <button onClick={() => switchVersion(msg.version_group, 1)} disabled={versions[msg.version_group].active >= versions[msg.version_group].msgs.length - 1}>▸</button>
                      </>
                    )}
                    <button onClick={() => navigator.clipboard.writeText(msg.content)}>copy</button>
                    <button onClick={() => handleRetry(msg)}>retry</button>
                  </div>
                )}
              </div>
              {msg.role === 'user' && <div className="message-avatar"><img src={userAvatar || uSvg} alt="" /></div>}
            </div>
          </div>
        ))}

        {showThinking && thinkingText && (
          <div className="message thinking-bubble"><div className="thinking-header">Thinking...</div><div className="thinking-content">{thinkingText}</div></div>
        )}
        {streamingText && (
          <div className="message assistant"><div className="message-body"><div className="message-avatar"><img src={assistantAvatar || aSvg} alt="" /></div><div className="message-content">{streamingText}<span className="cursor-blink">|</span></div></div></div>
        )}
        {isLoading && !streamingText && !thinkingText && (
          <div className="message assistant"><div className="message-content typing"><span className="dot">*</span><span className="dot">*</span><span className="dot">*</span></div></div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-area" onSubmit={(e) => { e.preventDefault(); if (!input.trim() || isLoading) return; onSend(input.trim(), 'openai', model); setInput(''); }}>
        <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(input.trim(), 'openai', model); setInput(''); } }}
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
    await fetch(`${API}/chat/edit-message`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: msg.id, newContent: text.trim() }) });
    msg.content = text.trim();
    setEditing(false);
    if (onEdited) onEdited(msg.id);
  };

  if (editing) return (
    <div className="edit-mode">
      <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} autoFocus />
      <div className="edit-actions"><button onClick={submit}>save</button><button onClick={() => { setText(msg.content); setEditing(false); }}>cancel</button></div>
    </div>
  );

  return (
    <div className="user-msg-row"><span>{msg.content}</span><button className="edit-pen" onClick={() => { setText(msg.content); setEditing(true); }}>✎</button></div>
  );
}

function MarkdownRenderer({ content }) {
  if (!content) return null;
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code({ node, inline, className, children, ...props }) { if (inline) return <code className="inline-code" {...props}>{children}</code>; return <pre className="code-block"><code {...props}>{children}</code></pre>; } }}>
      {content}
    </ReactMarkdown>
  );
}
