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
          const ids = chunk.multiParts || [chunk.messageId || 'msg-' + Date.now()];
          // If multiParts, split content
          if (chunk.multiParts && chunk.multiParts.length > 1) {
            const msgs = fullContent.split(/\n?---\n?/).filter(p => p.trim()).map((c, i) => ({
              id: ids[i] || 'msg-' + Date.now() + '-' + i,
              session_id: currentSessionId,
              role: 'assistant',
              content: c.trim(),
              reasoning_content: i === 0 ? fullReasoning : null,
              created_at: new Date(Date.now() + i * 100).toISOString(),
            }));
            setMessages(prev => [...prev, ...msgs]);
          } else {
            setMessages(prev => [...prev, {
              id: chunk.messageId || 'msg-' + Date.now(),
              session_id: currentSessionId, role: 'assistant',
              content: fullContent, reasoning_content: fullReasoning,
              created_at: new Date().toISOString(),
            }]);
          }
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

  // Regenerate from a specific or last reply
  const regenerateLastReply = useCallback(async (provider = 'openai', model = 'claude-full', messageId = null) => {
    if (!currentSessionId || isLoading) return;

    setIsLoading(true);
    setStreamingText('');
    setThinkingText('');
    setShowThinking(false);

    try {
      let fullContent = '', fullReasoning = '';
      for await (const chunk of api.regenerateMessage(currentSessionId, provider, model, messageId)) {
        if (chunk.type === 'text') { fullContent += chunk.text; setStreamingText(fullContent); }
        else if (chunk.type === 'thinking') { fullReasoning += chunk.text; setThinkingText(fullReasoning); setShowThinking(true); }
        else if (chunk.type === 'thinking_start') { setShowThinking(true); }
        else if (chunk.type === 'done') {
          fullContent = chunk.content || fullContent;
          fullReasoning = chunk.reasoning || fullReasoning;
          const deletedSet = new Set(chunk.deletedIds || []);
          setMessages(prev => {
            // Remove deleted messages + add new reply
            const filtered = prev.filter(m => !deletedSet.has(m.id));
            return [...filtered, {
              id: chunk.messageId || 'msg-' + Date.now(),
              session_id: currentSessionId, role: 'assistant',
              content: fullContent, reasoning_content: fullReasoning,
              reply_to: null, reply_version: chunk.replyVersion ?? 0,
              created_at: new Date().toISOString(),
            }];
          });
        }
      }
    } catch (err) {
      console.error('Regenerate error:', err);
    } finally {
      setIsLoading(false); setStreamingText(''); setThinkingText(''); setShowThinking(false);
    }
  }, [currentSessionId, isLoading]);

  // Edit a user message
  const editUserMessage = useCallback(async (messageId, newContent) => {
    try {
      await api.editMessage(messageId, newContent);
      // Reload messages to get the updated state
      await loadMessages(currentSessionId);
    } catch (err) {
      console.error('Edit error:', err);
    }
  }, [currentSessionId, loadMessages]);

  // Delete a message
  const deleteUserMessage = useCallback(async (messageId) => {
    try {
      await api.deleteMessage(messageId);
      setMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (err) {
      console.error('Delete error:', err);
    }
  }, []);

  // Switch to a different reply version
  const switchVersion = useCallback(async (replyTo, version) => {
    // Find the version and show it
    const versions = await api.getVersions(replyTo);
    const target = versions.find(v => v.reply_version === version);
    if (target) {
      setMessages(prev => {
        // Replace the assistant message with the target version
        return prev.map(m => {
          if (m.role === 'assistant' && m.reply_to === replyTo) {
            return { ...m, content: target.content, id: target.id, reply_version: version };
          }
          return m;
        });
      });
    }
  }, []);

  return {
    sessions, currentSessionId, messages,
    isLoading, streamingText, thinkingText, showThinking,
    hasMore,
    loadSessions, selectSession, newSession, removeSession,
    sendMessage, loadMoreMessages, regenerateLastReply,
    editUserMessage, deleteUserMessage, switchVersion,
  };
}
