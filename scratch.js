const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
const supabaseUrl = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const supabaseKey = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixSequence() {
  // Let's see the current max ID
  const { data, error } = await supabase.from('attendance_records').select('id').order('id', { ascending: false }).limit(1);
  console.log("Max ID:", data?.[0]?.id, error);
}

fixSequence();
