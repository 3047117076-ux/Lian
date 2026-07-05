-- ============================================================
-- Bunny & Elliott — Supabase Database Schema
-- Run this in Supabase SQL Editor to set up all tables
-- ============================================================

-- 1. Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL DEFAULT '',
  reasoning_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visible BOOLEAN NOT NULL DEFAULT TRUE
);

-- 3. Memories table (compressed conversation summaries)
CREATE TABLE IF NOT EXISTS memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Settings table (per-session configuration)
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE UNIQUE,
  system_prompt TEXT,
  temperature FLOAT DEFAULT 0.8,
  max_context_rounds INTEGER DEFAULT 50,
  max_context_tokens INTEGER DEFAULT 100000,
  compress_threshold INTEGER DEFAULT 50,
  compress_keep_rounds INTEGER DEFAULT 10,
  max_reply_tokens INTEGER DEFAULT 4096,
  provider TEXT DEFAULT 'claude',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_visible ON messages(session_id, visible);
CREATE INDEX IF NOT EXISTS idx_memories_session_id ON memories(session_id);
CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);

-- ============================================================
-- Enable Row Level Security (optional for personal use)
-- ============================================================

-- For a personal app without auth, we can allow all operations
-- If you later add auth, you can restrict with policies

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Allow all operations (personal use, no auth)
CREATE POLICY "Allow all on sessions" ON sessions FOR ALL USING (true);
CREATE POLICY "Allow all on messages" ON messages FOR ALL USING (true);
CREATE POLICY "Allow all on memories" ON memories FOR ALL USING (true);
CREATE POLICY "Allow all on settings" ON settings FOR ALL USING (true);
