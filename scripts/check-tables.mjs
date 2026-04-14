import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  const tables = ['users', 'projects', 'clients', 'invoices', 'employees', 'project_members', 'tasks'];
  console.log('Checking Supabase tables...\n');

  for (const table of tables) {
    const { error } = await supabase.from(table).select('id').limit(1);
    
    if (error) {
           console.log(`❌ ${table}: ${error.message} (Code: ${error.code})`);
    } else {
      console.log(`✅ ${table}: Exists`);
    }
  }
}

checkTables();
