import { useState, useRef, useEffect } from 'react';
import { sendMessage } from '../utils/api';

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
  onSend,
}) {
  const [input, setInput] = useState('');
  const [provider, setProvider] = useState('claude');
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
    onSend(input.trim(), provider);
    setInput('');
  };

  if (!currentSessionId) {
    return (
      <div className="chat-area empty">
        <div className="welcome">
          <h1>🐰 Bunny & Elliott 💝</h1>
          <p>Create or select a conversation to start chatting</p>
          <div className="welcome-emoji">🐇✨💕</div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-area">
      <div className="chat-header">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="provider-select"
        >
          <option value="claude">🤖 Claude</option>
          <option value="deepseek">🧠 DeepSeek</option>
        </select>
      </div>

      <div className="messages-container">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
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
function MessageBubble({ message }) {
  const [showReasoning, setShowReasoning] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="message user">
        <div className="message-content">{message.content}</div>
      </div>
    );
  }

  if (message.role === 'assistant') {
    return (
      <div className="message assistant">
        {message.reasoning_content && (
          <div className="reasoning-toggle">
            <button onClick={() => setShowReasoning(!showReasoning)}>
              {showReasoning ? '🧠 Hide thinking' : '🧠 Show thinking'}
            </button>
            {showReasoning && (
              <div className="reasoning-content">{message.reasoning_content}</div>
            )}
          </div>
        )}
        <div className="message-content">
          <MarkdownRenderer content={message.content} />
        </div>
      </div>
    );
  }

  return null;
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
