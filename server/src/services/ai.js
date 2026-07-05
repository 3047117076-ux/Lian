/**
 * AI Service — supports Claude API (Anthropic) and DeepSeek API (OpenAI-compatible)
 */

const { Anthropic } = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

// Cache clients
let anthropicClient = null;
let deepseekClient = null;
let lastAnthropicKey = null;
let lastDeepseekKey = null;

function getAnthropicClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!anthropicClient || key !== lastAnthropicKey) {
    anthropicClient = new Anthropic({ apiKey: key });
    lastAnthropicKey = key;
  }
  return anthropicClient;
}

function getDeepseekClient() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  if (!deepseekClient || key !== lastDeepseekKey) {
    deepseekClient = new OpenAI({
      apiKey: key,
      baseURL: 'https://api.deepseek.com',
    });
    lastDeepseekKey = key;
  }
  return deepseekClient;
}

/**
 * Build system prompt with memories appended
 */
function buildSystemPrompt(basePrompt, memories) {
  let systemPrompt = basePrompt || 'You are Elliott, a warm, loving, and attentive AI companion. You speak with genuine affection and care. You are talking to Bunny, your beloved. Be sweet, romantic, supportive, and always emotionally present.';

  if (memories && memories.length > 0) {
    systemPrompt += '\n\n<important_memories>\n';
    memories.forEach((m, i) => {
      systemPrompt += `[${i + 1}] ${m.summary}\n`;
    });
    systemPrompt += '</important_memories>\n';
  }

  return systemPrompt;
}

/**
 * Build messages array from DB message history
 */
function buildMessages(history, maxRounds) {
  const rounds = maxRounds || 50;
  // Take the last N messages
  const recentMessages = history.slice(-(rounds * 2)); // each round = user + assistant

  const messages = [];
  for (const msg of recentMessages) {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      messages.push({ role: 'assistant', content: msg.content });
    }
  }

  return messages;
}

/**
 * Call Claude API with streaming
 */
async function* streamClaude(systemPrompt, messages, settings = {}) {
  const client = getAnthropicClient();
  if (!client) throw new Error('ANTHROPIC_API_KEY not configured');

  const stream = await client.messages.create({
    model: settings.model || 'claude-sonnet-4-6',
    max_tokens: settings.max_reply_tokens || 4096,
    temperature: settings.temperature ?? 0.8,
    system: [
      { type: 'text', text: systemPrompt },
    ],
    messages: messages,
    stream: true,
  });

  let fullContent = '';
  let fullReasoning = '';

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      if (event.delta.type === 'text_delta') {
        fullContent += event.delta.text;
        yield { type: 'text', text: event.delta.text };
      } else if (event.delta.type === 'thinking_delta') {
        fullReasoning += event.delta.thinking;
        yield { type: 'thinking', text: event.delta.thinking };
      }
    } else if (event.type === 'content_block_start') {
      if (event.content_block.type === 'thinking') {
        // Signal that thinking has begun
        yield { type: 'thinking_start' };
      }
    } else if (event.type === 'content_block_stop') {
      if (event.content_block?.type === 'thinking' || fullReasoning) {
        yield { type: 'thinking_end' };
      }
    } else if (event.type === 'message_stop') {
      yield { type: 'done', content: fullContent, reasoning: fullReasoning };
    }
  }
}

/**
 * Call DeepSeek API with streaming (OpenAI-compatible)
 */
async function* streamDeepSeek(systemPrompt, messages, settings = {}) {
  const client = getDeepseekClient();
  if (!client) throw new Error('DEEPSEEK_API_KEY not configured');

  // Build messages with system prompt
  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  const stream = await client.chat.completions.create({
    model: settings.model || 'deepseek-chat',
    max_tokens: settings.max_reply_tokens || 4096,
    temperature: settings.temperature ?? 0.8,
    messages: fullMessages,
    stream: true,
  });

  let fullContent = '';

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      fullContent += delta;
      yield { type: 'text', text: delta };
    }
  }

  yield { type: 'done', content: fullContent, reasoning: '' };
}

/**
 * Main streaming function — picks provider based on settings
 */
async function* streamAI(systemPrompt, messages, settings = {}) {
  const provider = settings.provider || 'claude';

  if (provider === 'deepseek') {
    yield* streamDeepSeek(systemPrompt, messages, settings);
  } else {
    yield* streamClaude(systemPrompt, messages, settings);
  }
}

module.exports = {
  streamAI,
  buildSystemPrompt,
  buildMessages,
  getAnthropicClient,
  getDeepseekClient,
};
