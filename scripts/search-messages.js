const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function run() {
  const sessionId = '6ed6a36b-fb60-4d04-8344-ae283b7a4711';

  // Get conversation around July 1, 07:30-08:40
  const { data } = await supabase
    .from('messages')
    .select('id, role, content, created_at')
    .eq('session_id', sessionId)
    .eq('visible', true)
    .gte('created_at', '2026-07-01T07:30:00')
    .lte('created_at', '2026-07-01T08:50:00')
    .order('created_at', { ascending: true });

  if (data) {
    for (const d of data) {
      const role = d.role === 'user' ? '悦宝' : '小克';
      console.log('\n[' + d.created_at?.substring(11, 16) + '] ' + role + ':');
      console.log((d.content || '').substring(0, 800));
    }
  }
  console.log('\nTotal: ' + (data?.length || 0) + ' messages');
}

run().catch(err => console.error(err));
