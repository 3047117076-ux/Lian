/**
 * API utility — wraps fetch for backend communication
 */

const API_BASE = import.meta.env.DEV
  ? 'http://localhost:3000/api'
  : 'https://lian-dq0q.onrender.com/api';

/**
 * Send message and get SSE stream
 */
export async function* sendMessage(sessionId, message, provider = 'openai', model = 'claude-full') {
  const response = await fetch(`${API_BASE}/chat/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message, provider, model }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6);
        try {
          const data = JSON.parse(jsonStr);
          yield data;
        } catch {
          // skip parse errors
        }
      }
    }
  }
}

/**
 * Get all sessions
 */
export async function getSessions() {
  const res = await fetch(`${API_BASE}/sessions`);
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

/**
 * Create a new session
 */
export async function createSession(name = 'New Chat') {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json();
}

/**
 * Delete a session
 */
export async function deleteSession(id) {
  const res = await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete session');
  return res.json();
}

/**
 * Get messages for a session (paginated, most recent first)
 */
export async function getMessages(sessionId, limit = 50, before = null) {
  let url = `${API_BASE}/sessions/${sessionId}/messages?limit=${limit}`;
  if (before) url += `&before=${before}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

/**
 * Get settings for a session
 */
export async function getSettings(sessionId) {
  const res = await fetch(`${API_BASE}/settings/${sessionId}`);
  if (!res.ok) return {};
  return res.json();
}

/**
 * Update settings for a session
 */
export async function updateSettings(sessionId, settings) {
  const res = await fetch(`${API_BASE}/settings/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to update settings');
  return res.json();
}

/**
 * Rename a session
 */
export async function renameSession(id, name) {
  const res = await fetch(`${API_BASE}/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to rename session');
  return res.json();
}
