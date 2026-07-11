const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envStr = fs.readFileSync('.env.local', 'utf8');
envStr.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1].trim()] = match[2].trim();
  }
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log('Migrating game_settings (unit_templates)...');
  let { data: gsEntry } = await supabase.from('data_entries').select('*').eq('category', 'game_settings').is('country_id', null).single();
  if (gsEntry && gsEntry.data) {
    let modified = false;
    let templates = gsEntry.data.unitTemplates || [];
    for (let t of templates) {
      if (t.minorCategory === '기뢰함') {
        t.minorCategory = '기뢰부설함';
        modified = true;
      }
    }
    if (modified) {
      gsEntry.data.unitTemplates = templates;
      await supabase.from('data_entries').update({ data: gsEntry.data }).eq('id', gsEntry.id);
      console.log('Updated unitTemplates inside game_settings');
    } else {
      console.log('No unitTemplates to update (or already updated)');
    }
  }

  console.log('Migrating military_units...');
  let { data: entries } = await supabase.from('data_entries').select('*').eq('category', 'military_units');
  if (entries) {
    for (let entry of entries) {
      if (entry.data && entry.data.units) {
        let modified = false;
        let units = entry.data.units;
        for (let u of units) {
          if (u.subCategory === '기뢰함') {
            u.subCategory = '기뢰부설함';
            modified = true;
          }
          if (u.minorCategory === '기뢰함') {
            u.minorCategory = '기뢰부설함';
            modified = true;
          }
        }
        if (modified) {
          entry.data.units = units;
          await supabase.from('data_entries').update({ data: entry.data }).eq('id', entry.id);
          console.log(`Updated military_units for country_id ${entry.country_id}`);
        }
      }
    }
  }
  console.log('Done!');
}

migrate();
