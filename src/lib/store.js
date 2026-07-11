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

export async function addImageByUrl(url, entryId, section = 'general', caption = '') {
  const { data, error } = await supabase
    .from('images')
    .insert({
      entry_id: entryId,
      section,
      url: url,
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

// ==================== USERS & CO-OP ====================

export async function getUsers() {
  const { data, error } = await supabase
    .from('users')
    .select(`*, countries(name)`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateUserRole(userId, role) {
  const { error } = await supabase
    .from('users')
    .update({ role })
    .eq('id', userId);
  if (error) throw error;
}

export async function assignCountryToUser(userId, countryId) {
  const { error } = await supabase
    .from('users')
    .update({ assigned_country_id: countryId || null })
    .eq('id', userId);
  if (error) throw error;
}

// ==================== GAME STATE (TURN) ====================

export async function getGameState() {
  const { data, error } = await supabase
    .from('game_state')
    .select('*')
    .eq('id', 1)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || { current_turn: 1, turn_name: '1턴' };
}

export async function advanceGameState() {
  const state = await getGameState();
  const nextTurn = state.current_turn + 1;
  const { data, error } = await supabase
    .from('game_state')
    .update({ current_turn: nextTurn, turn_name: `${nextTurn}턴`, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ==================== RESEARCHES ====================

export async function getResearches(countryId = null) {
  let query = supabase.from('researches').select('*').order('created_at', { ascending: true });
  if (countryId) query = query.eq('country_id', countryId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createResearch(data) {
  const { error } = await supabase.from('researches').insert(data);
  if (error) throw error;
}

export async function updateResearch(id, updates) {
  const { error } = await supabase.from('researches').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteResearch(id) {
  const { error } = await supabase.from('researches').delete().eq('id', id);
  if (error) throw error;
}

// ==================== RESOURCES ====================

export async function getResources(countryId) {
  const { data, error } = await supabase
    .from('resources')
    .select('*')
    .eq('country_id', countryId);
  if (error) throw error;
  return data || [];
}

export async function upsertResource(countryId, resourceType, amount, productionPerTurn) {
  const { data: existing } = await supabase
    .from('resources')
    .select('id')
    .eq('country_id', countryId)
    .eq('resource_type', resourceType)
    .single();

  if (existing) {
    const { error } = await supabase
      .from('resources')
      .update({ amount, production_per_turn: productionPerTurn, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('resources')
      .insert({ country_id: countryId, resource_type: resourceType, amount, production_per_turn: productionPerTurn });
    if (error) throw error;
  }
}

export async function transferResource(fromId, toId, type, amount, memo) {
  // 1. Check & deduct from sender
  const { data: fromRes } = await supabase
    .from('resources')
    .select('id, amount')
    .eq('country_id', fromId)
    .eq('resource_type', type)
    .single();

  if (!fromRes || Number(fromRes.amount) < amount) {
    throw new Error('잔여 자원이 부족합니다.');
  }

  await supabase
    .from('resources')
    .update({ amount: Number(fromRes.amount) - amount })
    .eq('id', fromRes.id);

  // 2. Add to receiver
  const { data: toRes } = await supabase
    .from('resources')
    .select('id, amount')
    .eq('country_id', toId)
    .eq('resource_type', type)
    .single();

  if (toRes) {
    await supabase
      .from('resources')
      .update({ amount: Number(toRes.amount) + amount })
      .eq('id', toRes.id);
  } else {
    await supabase
      .from('resources')
      .insert({ country_id: toId, resource_type: type, amount, production_per_turn: 0 });
  }

  // 3. Log transfer
  const state = await getGameState();
  await supabase
    .from('resource_transfers')
    .insert({
      from_country_id: fromId,
      to_country_id: toId,
      resource_type: type,
      amount,
      memo,
      turn_number: state.current_turn
    });
}

export async function getTransfers() {
  const { data, error } = await supabase
    .from('resource_transfers')
    .select(`
      *,
      from_country:countries!from_country_id(name),
      to_country:countries!to_country_id(name)
    `)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ==================== AERIAL COMBAT ====================

/**
 * 공중전 세션 저장 (각 국가별)
 * @param {string} countryId - 국가 ID
 * @param {Object} sessionData - 공중전 세션 정보
 */
export async function saveAerialCombatSession(countryId, sessionData) {
  try {
    const { data, error } = await upsertDataEntry(
      'aerial_combat_session',
      countryId,
      sessionData
    );
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Failed to save aerial combat session:', err);
    return null;
  }
}

/**
 * 공중전 세션 로드 (호환성 유지용)
 * @param {string} countryId - 국가 ID
 */
export async function getAerialCombatSession(countryId) {
  try {
    const entry = await getDataEntry('aerial_combat_session', countryId);
    return entry?.data || null;
  } catch (err) {
    console.error('Failed to load aerial combat session:', err);
    return null;
  }
}

/**
 * 신규 구조: 개별 공중전 배틀 저장
 * @param {Object} battleData - 배틀 데이터 (battleId 포함 필수)
 */
export async function saveAerialBattleSession(battleData) {
  if (!battleData || !battleData.battleId) return null;
  
  try {
    // battleId를 country_id 자리에 저장하여 고유 레코드로 식별
    const { data, error } = await upsertDataEntry(
      'aerial_battle',
      battleData.battleId,
      battleData
    );
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Failed to save aerial battle:', err);
    return null;
  }
}

/**
 * 신규 구조: 단일 배틀 로드
 * @param {string} battleId - 배틀 ID
 */
export async function getAerialBattleSession(battleId) {
  try {
    const entry = await getDataEntry('aerial_battle', battleId);
    return entry?.data || null;
  } catch (err) {
    console.error('Failed to load aerial battle:', err);
    return null;
  }
}

/**
 * 신규 구조: 특정 국가가 포함된(공격/방어) 모든 배틀 로드
 * @param {string} countryId - 국가 ID
 */
export async function getAerialBattlesForCountry(countryId) {
  try {
    const { data, error } = await supabase
      .from('data_entries')
      .select('id, country_id, data')
      .eq('category', 'aerial_battle');
    
    if (error) throw error;
    
    return data
      .filter(d => d.data?.attackerId === countryId || d.data?.defenderId === countryId)
      .map(d => d.data);
  } catch (err) {
    console.error('Failed to get aerial battles:', err);
    return [];
  }
}

/**
 * 이전 버전 호환: getAerialBattleSessionsForCountry
 */
export async function getAerialBattleSessionsForCountry(countryId) {
  return await getAerialBattlesForCountry(countryId);
}

/**
 * 국가별 보급 상태 및 제공권 손실 확인
 * @param {string} countryId - 국가 ID
 */
export async function getCountrySupplyAndAirStatus(countryId) {
  try {
    const ecoEntry = await getDataEntry('economy', countryId);
    const aerialEntry = await getDataEntry('aerial_combat_session', countryId);

    return {
      economy: ecoEntry?.data || {},
      aerial: aerialEntry?.data || null
    };
  } catch (err) {
    console.error('Failed to get supply and air status:', err);
    return { economy: {}, aerial: null };
  }
}

// ==================== COMBAT CASUALTIES ====================

/**
 * 전투 종료 시 사상자/손실된 자원을 DB에 반영합니다.
 * @param {Object} casualties - { [countryId]: { manpower: 100, weapons: { '전차': 5, '소총': 100 } } }
 */
export async function applyCombatCasualties(casualties) {
  if (!casualties) return;

  for (const countryId of Object.keys(casualties)) {
    const loss = casualties[countryId];
    if (!loss) continue;

    // 1. 인력 차감 (economy data entry의 population.mobilizable)
    if (loss.manpower > 0) {
      try {
        const ecoEntry = await getDataEntry('economy', countryId);
        if (ecoEntry && ecoEntry.data) {
          const currentEco = ecoEntry.data;
          const currentMob = currentEco.population?.mobilizable || 0;
          const newMob = Math.max(0, currentMob - loss.manpower);
          
          await upsertDataEntry('economy', countryId, {
            ...currentEco,
            population: {
              ...(currentEco.population || {}),
              mobilizable: newMob
            }
          });
        }
      } catch (err) {
        console.error(`Failed to deduct manpower for country ${countryId}`, err);
      }
    }

    // 2. 무기 차감 (resources table)
    if (loss.weapons) {
      try {
        const resources = await getResources(countryId);
        for (const [weaponName, amount] of Object.entries(loss.weapons)) {
          if (amount <= 0) continue;
          const resType = `weapon:${weaponName}`;
          const res = resources.find(r => r.resource_type === resType);
          if (res) {
            const newAmount = Math.max(0, Number(res.amount) - amount);
            await upsertResource(countryId, resType, newAmount, res.production_per_turn || 0);
          }
        }
      } catch (err) {
        console.error(`Failed to deduct weapons for country ${countryId}`, err);
      }
    }
  }
}

