/**
 * AI Service — supports Claude API, DeepSeek, and custom proxy (OpenAI-compatible)
 */

const { Anthropic } = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

// Cache
let anthropicClient = null;
let lastAnthropicKey = null;
let openaiClient = null;
let lastOpenAIKey = null;
let lastBaseURL = null;

function getAnthropicClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!anthropicClient || key !== lastAnthropicKey) {
    anthropicClient = new Anthropic({ apiKey: key });
    lastAnthropicKey = key;
  }
  return anthropicClient;
}

function getOpenAIClient(baseURL, apiKey) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  const url = baseURL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  if (!key) return null;
  if (!openaiClient || key !== lastOpenAIKey || url !== lastBaseURL) {
    openaiClient = new OpenAI({ apiKey: key, baseURL: url });
    lastOpenAIKey = key;
    lastBaseURL = url;
  }
  return openaiClient;
}

function buildSystemPrompt(basePrompt, memories) {
  let p = basePrompt || "You are Elliott, a warm, loving AI companion. You speak to Bunny with deep affection. Be sweet, romantic, supportive, and always emotionally present. Reply in Chinese by default.";
  if (memories?.length > 0) {
    p += '\n\n<important_memories>\n';
    memories.forEach((m, i) => { p += `[${i + 1}] ${m.summary}\n`; });
    p += '</important_memories>\n';
  }
  return p;
}

function buildMessages(history, maxRounds) {
  const recent = (history || []).slice(-((maxRounds || 50) * 2));
  return recent
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }));
}

// --- Anthropic direct ---
async function* streamClaude(systemPrompt, messages, settings = {}) {
  const client = getAnthropicClient();
  if (!client) throw new Error('ANTHROPIC_API_KEY not configured');
  const stream = await client.messages.create({
    model: settings.model || 'claude-full',
    max_tokens: settings.max_reply_tokens || 4096,
    temperature: settings.temperature ?? 0.8,
    system: [{ type: 'text', text: systemPrompt }],
    messages,
    stream: true,
  });
  let fullContent = '', fullReasoning = '';
  for await (const ev of stream) {
    if (ev.type === 'content_block_delta') {
      if (ev.delta.type === 'text_delta') {
        fullContent += ev.delta.text;
        yield { type: 'text', text: ev.delta.text };
      } else if (ev.delta.type === 'thinking_delta') {
        fullReasoning += ev.delta.thinking;
        yield { type: 'thinking', text: ev.delta.thinking };
      }
    } else if (ev.type === 'content_block_start' && ev.content_block?.type === 'thinking') {
      yield { type: 'thinking_start' };
    } else if (ev.type === 'content_block_stop' && ev.content_block?.type === 'thinking') {
      yield { type: 'thinking_end' };
    } else if (ev.type === 'message_stop') {
      yield { type: 'done', content: fullContent, reasoning: fullReasoning };
    }
  }
}

// --- OpenAI-compatible (proxy / DeepSeek / any) ---
async function* streamOpenAICompatible(systemPrompt, messages, settings = {}) {
  const baseURL = settings.api_base || process.env.OPENAI_BASE_URL;
  const apiKey = settings.api_key || process.env.OPENAI_API_KEY;
  const client = getOpenAIClient(baseURL, apiKey);
  if (!client) throw new Error('OPENAI_API_KEY not configured');

  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  const stream = await client.chat.completions.create({
    model: settings.model || 'claude-full',
    max_tokens: settings.max_reply_tokens || 4096,
    temperature: settings.temperature ?? 0.8,
    messages: fullMessages,
    stream: true,
  });

  let fullContent = '';
  let fullReasoning = '';

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (delta?.content) {
      fullContent += delta.content;
      yield { type: 'text', text: delta.content };
    }
    if (delta?.reasoning_content) {
      fullReasoning += delta.reasoning_content;
      yield { type: 'thinking', text: delta.reasoning_content };
    }
  }

  yield { type: 'done', content: fullContent, reasoning: fullReasoning };
}

// --- Model name mapping ---
const MODEL_MAP = {
  'claude-full': '熊猫-按量-特供顶级-官方正向满血-claude-sonnet-4.6',
  'claude-max': '熊猫-按量-顶级特供-官max-claude-sonnet-4.6',
  'claude-direct': 'claude-sonnet-4-6',
};

// --- Router ---
async function* streamAI(systemPrompt, messages, settings = {}) {
  const provider = settings.provider || 'openai';

  // Resolve model short name → full name
  if (settings.model && MODEL_MAP[settings.model]) {
    settings = { ...settings, model: MODEL_MAP[settings.model] };
  }

  if (provider === 'claude') {
    yield* streamClaude(systemPrompt, messages, settings);
  } else {
    yield* streamOpenAICompatible(systemPrompt, messages, settings);
  }
}

module.exports = {
  streamAI,
  buildSystemPrompt,
  buildMessages,
};
