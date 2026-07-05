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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, thinkingText]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [currentSessionId]);

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
            onMouseEnter={() => setHoveredMsg(msg.id)}
            onMouseLeave={() => setHoveredMsg(null)}>
            <div className="message-body">
              {msg.role === 'assistant' && (
                <div className="message-avatar"><img src={assistantAvatar || defaultAssistantSvg} alt="" /></div>
              )}
              <div className="message-bubble">
                <div className="message-content">
                  {msg.role === 'user' ? msg.content : <MarkdownRenderer content={msg.content} />}
                </div>
                {msg.role === 'assistant' && hoveredMsg === msg.id && (
                  <div className="msg-actions">
                    <button onClick={() => navigator.clipboard.writeText(msg.content)}>copy</button>
                    <button onClick={() => onRegenerate && onRegenerate('openai', 'claude-full', msg.id)}>retry</button>
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
