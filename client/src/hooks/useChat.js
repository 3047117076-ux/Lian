import { useState, useRef, useCallback } from 'react';
import * as api from '../utils/api';

export default function useChat() {
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [thinkingText, setThinkingText] = useState('');
  const [showThinking, setShowThinking] = useState(false);
  const abortRef = useRef(null);

  // Load sessions list
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

  // Load messages for a session
  const loadMessages = useCallback(async (sessionId) => {
    try {
      const data = await api.getMessages(sessionId);
      setMessages(data);
      return data;
    } catch (err) {
      console.error('Failed to load messages:', err);
      return [];
    }
  }, []);

  // Select/switch to a session
  const selectSession = useCallback(async (sessionId) => {
    setCurrentSessionId(sessionId);
    setStreamingText('');
    setThinkingText('');
    setShowThinking(false);
    await loadMessages(sessionId);
  }, [loadMessages]);

  // Create new session
  const newSession = useCallback(async () => {
    const session = await api.createSession();
    await loadSessions();
    await selectSession(session.id);
    return session;
  }, [loadSessions, selectSession]);

  // Delete session
  const removeSession = useCallback(async (id) => {
    await api.deleteSession(id);
    await loadSessions();
    if (id === currentSessionId) {
      setCurrentSessionId(null);
      setMessages([]);
    }
  }, [currentSessionId, loadSessions]);

  // Send message
  const sendMessage = useCallback(async (content, provider = 'claude') => {
    if (!currentSessionId || !content.trim()) return;

    setIsLoading(true);
    setStreamingText('');
    setThinkingText('');
    setShowThinking(false);

    // Add user message immediately to UI
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

      for await (const chunk of api.sendMessage(currentSessionId, content, provider)) {
        if (chunk.type === 'text') {
          fullContent += chunk.text;
          setStreamingText(fullContent);
        } else if (chunk.type === 'thinking') {
          fullReasoning += chunk.text;
          setThinkingText(fullReasoning);
          setShowThinking(true);
        } else if (chunk.type === 'thinking_start') {
          setShowThinking(true);
        } else if (chunk.type === 'thinking_end') {
          // keep thinking visible but mark as complete
        } else if (chunk.type === 'done') {
          fullContent = chunk.content || fullContent;
          fullReasoning = chunk.reasoning || fullReasoning;

          // Add assistant message
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
      // Add error message
      setMessages(prev => [...prev, {
        id: 'error-' + Date.now(),
        session_id: currentSessionId,
        role: 'assistant',
        content: `❌ Error: ${err.message}`,
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setIsLoading(false);
      setStreamingText('');
      setThinkingText('');
      setShowThinking(false);
      // Refresh sessions to update order
      loadSessions();
    }
  }, [currentSessionId, loadSessions]);

  return {
    sessions,
    currentSessionId,
    messages,
    isLoading,
    streamingText,
    thinkingText,
    showThinking,
    loadSessions,
    selectSession,
    newSession,
    removeSession,
    sendMessage,
  };
}
