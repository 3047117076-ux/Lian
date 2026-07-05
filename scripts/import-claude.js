/**
 * Import Claude exported conversations into Supabase
 * Usage: node scripts/import-claude.js
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const { v4: uuidv4 } = require('uuid');

async function main() {
  const exportFile = 'C:/Users/user/Desktop/claude-export/conversations.json';
  const data = JSON.parse(fs.readFileSync(exportFile, 'utf8'));

  console.log(`📦 Found ${data.length} conversations\n`);

  for (const conv of data) {
    if (!conv.chat_messages || conv.chat_messages.length === 0) {
      console.log(`⏭️  Skipping empty: "${conv.name || 'Untitled'}"`);
      continue;
    }

    const sessionId = uuidv4();
    const now = new Date().toISOString();
    const name = conv.name || 'Untitled';

    console.log(`📝 Importing "${name}" (${conv.chat_messages.length} msgs)...`);

    // Create session
    const { error: sessErr } = await supabase.from('sessions').insert({
      id: sessionId,
      name,
      created_at: conv.created_at || now,
      updated_at: conv.updated_at || now,
    });
    if (sessErr) { console.error('  ❌ Session error:', sessErr.message); continue; }

    // Create default settings
    const { error: setErr } = await supabase.from('settings').insert({
      id: uuidv4(),
      session_id: sessionId,
      temperature: 0.8,
      max_context_rounds: 50,
      max_context_tokens: 100000,
      compress_threshold: 50,
      compress_keep_rounds: 10,
      max_reply_tokens: 4096,
      updated_at: now,
    });
    if (setErr) console.warn('  ⚠️  Settings error:', setErr.message);

    // Import messages in batches of 100
    const messages = conv.chat_messages.map(msg => ({
      id: msg.uuid || uuidv4(),
      session_id: sessionId,
      role: msg.sender === 'human' ? 'user' : 'assistant',
      content: msg.text || '',
      visible: true,
      created_at: msg.created_at || now,
    }));

    // Batch insert
    const batchSize = 100;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const { error } = await supabase.from('messages').insert(batch);
      if (error) {
        console.error(`  ❌ Batch insert error (${i}-${i+batchSize}):`, error.message);
        // Try one by one if batch fails
        console.log('  Retrying one by one...');
        for (const msg of batch) {
          const { error: singleErr } = await supabase.from('messages').insert(msg);
          if (singleErr) console.error(`    ❌ Msg ${msg.id}:`, singleErr.message);
        }
      }
      process.stdout.write(`  ${Math.min(i + batchSize, messages.length)}/${messages.length}\r`);
    }
    console.log(`  ✅ Done!`);
  }

  console.log('\n🎉 All conversations imported!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
