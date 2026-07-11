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
  console.log('Migrating unit_templates...');
  let { data: tEntry } = await supabase.from('data_entries').select('*').eq('category', 'unit_templates').is('country_id', null).single();
  if (tEntry && tEntry.data) {
    let modified = false;
    let templates = tEntry.data.templates || [];
    for (let t of templates) {
      if (t.subCategory === '기뢰함') {
        t.subCategory = '기뢰부설함';
        modified = true;
      }
    }
    if (modified) {
      tEntry.data.templates = templates;
      await supabase.from('data_entries').update({ data: tEntry.data }).eq('id', tEntry.id);
      console.log('Updated unit_templates in DB');
    } else {
      console.log('No unit_templates to update');
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
