import { supabase } from './supabase';

// ==================== COUNTRIES ====================

export async function getCountries() {
  const { data, error } = await supabase
    .from('countries')
    .select('id, name, color, flag_url, sort_order, created_at')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getCountry(id) {
  const { data, error } = await supabase
    .from('countries')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createCountry({ name, password, color }) {
  const { data, error } = await supabase
    .from('countries')
    .insert({ name, password, color: color || '#cccccc' })
    .select()
    .single();
  if (error) throw error;

  // Create default data entries for this country
  const categories = ['politics', 'economy', 'social', 'diplomacy'];
  const defaults = {
    politics: {
      governmentType: '',
      headOfState: '',
      parties: [],
      keyFigures: [],
      customFields: [],
    },
    economy: {
      heavyIndustry: { value: '', unit: '' },
      lightIndustry: { value: '', unit: '' },
      agriculture: { value: '', unit: '' },
      resources: { value: '', unit: '' },
      commerce: { value: '', unit: '' },
      customFields: [],
    },
    social: { content: '', customFields: [] },
    diplomacy: { content: '', customFields: [] },
  };

  for (const cat of categories) {
    await supabase.from('data_entries').insert({
      category: cat,
      country_id: data.id,
      data: defaults[cat],
    });
  }

  return data;
}

export async function updateCountry(id, updates) {
  const { data, error } = await supabase
    .from('countries')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCountry(id) {
  const { error } = await supabase.from('countries').delete().eq('id', id);
  if (error) throw error;
}

// ==================== DATA ENTRIES ====================

export async function getDataEntry(category, countryId = null) {
  let query = supabase
    .from('data_entries')
    .select('*')
    .eq('category', category);

  if (countryId) {
    query = query.eq('country_id', countryId);
  } else {
    query = query.is('country_id', null);
  }

  const { data, error } = await query.single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function upsertDataEntry(category, countryId, entryData) {
  // Check if entry exists
  let query = supabase
    .from('data_entries')
    .select('id')
    .eq('category', category);

  if (countryId) {
    query = query.eq('country_id', countryId);
  } else {
    query = query.is('country_id', null);
  }

  const { data: existing } = await query.single();

  if (existing) {
    const { data, error } = await supabase
      .from('data_entries')
      .update({ data: entryData, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from('data_entries')
      .insert({
        category,
        country_id: countryId || null,
        data: entryData,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

// ==================== IMAGES ====================

export async function getImages(entryId, section = 'general') {
  const { data, error } = await supabase
    .from('images')
    .select('*')
    .eq('entry_id', entryId)
    .eq('section', section)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getAllImages(entryId) {
  const { data, error } = await supabase
    .from('images')
    .select('*')
    .eq('entry_id', entryId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function uploadImage(file, entryId, section = 'general', caption = '') {
  const ext = file.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const filePath = `uploads/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('images')
    .upload(filePath, file);

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from('images')
    .getPublicUrl(filePath);

  const { data, error } = await supabase
    .from('images')
    .insert({
      entry_id: entryId,
      section,
      url: urlData.publicUrl,
      caption,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteImage(imageId) {
  const { error } = await supabase.from('images').delete().eq('id', imageId);
  if (error) throw error;
}

// ==================== MAP DATA ====================

export async function getMapData() {
  const { data, error } = await supabase
    .from('map_data')
    .select('*')
    .eq('id', 1)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function saveMapData(imageDataUrl, legend = []) {
  const { data: existing } = await supabase
    .from('map_data')
    .select('id')
    .eq('id', 1)
    .single();

  if (existing) {
    const { error } = await supabase
      .from('map_data')
      .update({
        image_data: imageDataUrl,
        legend,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('map_data')
      .insert({ id: 1, image_data: imageDataUrl, legend });
    if (error) throw error;
  }
}
