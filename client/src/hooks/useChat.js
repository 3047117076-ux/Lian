import { useState, useCallback } from 'react';
import * as api from '../utils/api';

export default function useChat() {
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [thinkingText, setThinkingText] = useState('');
  const [showThinking, setShowThinking] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const data = await api.getSessions();
      setSessions(data);
      return data;
    } catch (err) {
      console.error('Failed to load sessions:', err);
      return [];
    }
  }, []);

  // Load most recent 50 messages
  const loadMessages = useCallback(async (sessionId) => {
    try {
      const data = await api.getMessages(sessionId, 50);
      setMessages(data);
      setHasMore(data.length === 50); // if we got 50, there might be more
      return data;
    } catch (err) {
      console.error('Failed to load messages:', err);
      return [];
    }
  }, []);

  // Load older messages (before the earliest one we have)
  const loadMoreMessages = useCallback(async () => {
    if (!currentSessionId || messages.length === 0) return;
    const oldestId = messages[0].id;
    try {
      const older = await api.getMessages(currentSessionId, 50, oldestId);
      if (older.length > 0) {
        setMessages(prev => [...older, ...prev]);
      }
      setHasMore(older.length === 50);
    } catch (err) {
      console.error('Failed to load more:', err);
    }
  }, [currentSessionId, messages]);

  const selectSession = useCallback(async (sessionId) => {
    setCurrentSessionId(sessionId);
    setStreamingText('');
    setThinkingText('');
    setShowThinking(false);
    await loadMessages(sessionId);
  }, [loadMessages]);

  const newSession = useCallback(async () => {
    const session = await api.createSession();
    await loadSessions();
    await selectSession(session.id);
    return session;
  }, [loadSessions, selectSession]);

  const removeSession = useCallback(async (id) => {
    await api.deleteSession(id);
    await loadSessions();
    if (id === currentSessionId) {
      setCurrentSessionId(null);
      setMessages([]);
    }
  }, [currentSessionId, loadSessions]);

  const sendMessage = useCallback(async (content, provider = 'openai', model = 'claude-full') => {
    if (!currentSessionId || !content.trim()) return;

    setIsLoading(true);
    setStreamingText('');
    setThinkingText('');
    setShowThinking(false);

    const userMsg = {
      id: 'temp-' + Date.now(),
      session_id: currentSessionId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      let fullContent = '';
      let fullReasoning = '';

      for await (const chunk of api.sendMessage(currentSessionId, content, provider, model)) {
        if (chunk.type === 'text') {
          fullContent += chunk.text;
          setStreamingText(fullContent);
        } else if (chunk.type === 'thinking') {
          fullReasoning += chunk.text;
          setThinkingText(fullReasoning);
          setShowThinking(true);
        } else if (chunk.type === 'thinking_start') {
          setShowThinking(true);
        } else if (chunk.type === 'done') {
          fullContent = chunk.content || fullContent;
          fullReasoning = chunk.reasoning || fullReasoning;
          const assistantMsg = {
            id: chunk.messageId || 'msg-' + Date.now(),
            session_id: currentSessionId,
            role: 'assistant',
            content: fullContent,
            reasoning_content: fullReasoning,
            created_at: new Date().toISOString(),
          };
          setMessages(prev => [...prev, assistantMsg]);
        } else if (chunk.type === 'error') {
          console.error('Stream error:', chunk.message);
          break;
        }
      }
    } catch (err) {
      console.error('Send message error:', err);
      setMessages(prev => [...prev, {
        id: 'error-' + Date.now(),
        session_id: currentSessionId,
        role: 'assistant',
        content: `Error: ${err.message}`,
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setIsLoading(false);
      setStreamingText('');
      setThinkingText('');
      setShowThinking(false);
      loadSessions();
    }
  }, [currentSessionId, loadSessions]);

  // Regenerate last reply
  const regenerateLastReply = useCallback(async (provider = 'openai', model = 'claude-full') => {
    if (!currentSessionId || isLoading) return;

    // Remove last assistant message from UI
    setMessages(prev => {
      let lastIdx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === 'assistant') { lastIdx = i; break; }
      }
      if (lastIdx < 0) return prev;
      return prev.slice(0, lastIdx);
    });

    setIsLoading(true);
    setStreamingText('');
    setThinkingText('');
    setShowThinking(false);

    try {
      let fullContent = '', fullReasoning = '';
      for await (const chunk of api.regenerateMessage(currentSessionId, provider, model)) {
        if (chunk.type === 'text') { fullContent += chunk.text; setStreamingText(fullContent); }
        else if (chunk.type === 'thinking') { fullReasoning += chunk.text; setThinkingText(fullReasoning); setShowThinking(true); }
        else if (chunk.type === 'thinking_start') { setShowThinking(true); }
        else if (chunk.type === 'done') {
          fullContent = chunk.content || fullContent;
          fullReasoning = chunk.reasoning || fullReasoning;
          setMessages(prev => [...prev, {
            id: chunk.messageId || 'msg-' + Date.now(),
            session_id: currentSessionId, role: 'assistant',
            content: fullContent, reasoning_content: fullReasoning,
            created_at: new Date().toISOString(),
          }]);
        }
      }
    } catch (err) {
      console.error('Regenerate error:', err);
    } finally {
      setIsLoading(false); setStreamingText(''); setThinkingText(''); setShowThinking(false);
    }
  }, [currentSessionId, isLoading]);

  return {
    sessions, currentSessionId, messages,
    isLoading, streamingText, thinkingText, showThinking,
    hasMore,
    loadSessions, selectSession, newSession, removeSession,
    sendMessage, loadMoreMessages, regenerateLastReply,
  };
}
