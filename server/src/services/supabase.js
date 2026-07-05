const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  SUPABASE_URL or SUPABASE_KEY not set. Database features will not work.');
}

const supabase = createClient(
  supabaseUrl || 'http://localhost',
  supabaseKey || 'dummy-key'
);

module.exports = supabase;
