import { supabase } from './supabase';

/**
 * 게임의 현재 상태(연구, 자원, 경제)를 스냅샷으로 저장
 */
export async function createTurnSnapshot() {
  try {
    const { data: researches } = await supabase.from('researches').select('*');
    const { data: resources } = await supabase.from('resources').select('*');
    const { data: ecoEntries } = await supabase.from('data_entries').select('*').eq('category', 'economy');
    const { data: state } = await supabase.from('game_state').select('*').eq('id', 1).single();

    const snapshotData = {
      turn: state?.current_turn || 1,
      researches: researches || [],
      resources: resources || [],
      ecoEntries: ecoEntries || []
    };

    // upsert into data_entries for snapshot
    await supabase.from('data_entries').upsert({
      category: 'turn_snapshot',
      country_id: null,
      data: snapshotData,
      title: 'Turn Snapshot'
    }, { onConflict: 'category,country_id' });

    return { success: true };
  } catch (err) {
    console.error('Snapshot error:', err);
    return { success: false };
  }
}

/**
 * 턴을 넘길 때 호출되는 핵심 게임 로직 함수
 * @param {number} newTurn - 새 턴 번호
 */
export async function processTurnEnd(newTurn) {
  try {
    // 0. 스냅샷 생성 (롤백용)
    await createTurnSnapshot();

    // 설정에서 기술 트리 데이터 가져오기
    const { data: settingEntry } = await supabase.from('data_entries').select('data').eq('category', 'game_settings').single();
    const techTrees = settingEntry?.data?.techTrees || [];
    
    // 각 효과별 기술 식별자(name_level) 추출
    const effectMap = {
      prevent_fail: new Set(),
      research_speed: new Set(),
      unlock_special: new Set(),
      agri_boost: new Set(),
      heavy_boost: new Set(),
      light_boost: new Set(),
      mining_boost: new Set(),
      radar_tech: new Set()
    };
    
    techTrees.forEach(tree => {
      tree.levels.forEach(lvl => {
        if (lvl.effect && lvl.effect !== 'none') {
          if (effectMap[lvl.effect]) effectMap[lvl.effect].add(`${tree.name}_${lvl.level}`);
        }
      });
    });

    // 국가별 완료된 기술 목록
    const { data: completedResearches } = await supabase.from('researches').select('country_id, name, level').eq('status', 'completed');
    const safeEras = {};
    
    if (completedResearches) {
      completedResearches.forEach(r => {
        if (effectMap.prevent_fail.has(`${r.name}_${r.level}`)) {
          const tree = techTrees.find(t => t.name === r.name);
          if (tree) {
            const lvl = tree.levels.find(l => l.level === r.level);
            if (lvl && lvl.era) {
              if (!safeEras[r.country_id]) safeEras[r.country_id] = new Set();
              safeEras[r.country_id].add(lvl.era);
            }
          }
        }
      });
    }

    // 1. 진행 중인 연구 remaining_turns 감소 및 완료/실패 판정
    const { data: activeResearches, error: resError } = await supabase
      .from('researches')
      .select('id, country_id, remaining_turns, name, level')
      .eq('status', 'in_progress');

    if (!resError && activeResearches) {
      for (const r of activeResearches) {
        const newRemaining = Math.max(0, r.remaining_turns - 1);
        let status = 'in_progress';
        
        if (newRemaining === 0) {
          // 실패 확률 계산 (50%)
          let currentEra = null;
          const tree = techTrees.find(t => t.name === r.name);
          if (tree) {
            const lvl = tree.levels.find(l => l.level === r.level);
            if (lvl) currentEra = lvl.era;
          }
          
          const isSafe = currentEra && safeEras[r.country_id]?.has(currentEra);
          if (!isSafe && Math.random() < 0.5) {
            status = 'failed';
          } else {
            status = 'completed';
          }
        }
        
        await supabase
          .from('researches')
          .update({ remaining_turns: newRemaining, status })
          .eq('id', r.id);
      }
    }

    // 2. 국가 자원 생산 처리
    const { data: resources, error: resourceError } = await supabase
      .from('resources')
      .select('id, amount, production_per_turn');
    
    if (!resourceError && resources) {
      for (const res of resources) {
        if (res.production_per_turn > 0) {
          await supabase
            .from('resources')
            .update({ amount: Number(res.amount) + Number(res.production_per_turn) })
            .eq('id', res.id);
        }
      }
    }

    // 3. 경제 시스템 (GDP, 예산, 생산, 인플레이션, 상업코인, 무기생산)
    const { data: gameSettingsEntry } = await supabase.from('data_entries').select('data').eq('category', 'game_settings').is('country_id', null).single();
    const weaponTemplates = gameSettingsEntry?.data?.weaponTemplates || [];

    const { data: ecoEntries, error: ecoError } = await supabase
      .from('data_entries')
      .select('id, country_id, data')
      .eq('category', 'economy');

    if (!ecoError && ecoEntries) {
      for (const entry of ecoEntries) {
        if (!entry.country_id) continue;
        const data = entry.data || {};
        
        let gdp = Number(data.gdp) || 0;
        let taxRate = Number(data.taxRate) || 0;
        let totalPopulation = Number(data.totalPopulation) || 0;
        let mobilizablePopulation = Number(data.mobilizablePopulation) || 0;
        
        // 기존 성장률 로직 호환성 유지용
        let growthRate = Number(data.economicGrowthRate?.value || data.economicGrowthRate || 0);
        if (gdp > 0 && growthRate !== 0) {
          gdp = gdp * (1 + (growthRate / 100));
        }

        // --- 상업코인 GDP 반영 (코인 1개당 GDP 1% 상승) ---
        const commerceCoins = Number(data.commerceCoins) || 0;
        if (commerceCoins !== 0) {
          gdp = gdp * (1 + (commerceCoins / 100));
          data.commerceCoins = 0; // 적용 후 리셋
        }
        data.gdp = gdp;

        // --- 예산 및 중공업 코인 ---
        const budget = gdp * (taxRate / 100);
        const heavyIndustryCoins = Math.floor(budget / 50000);
        data.heavyIndustryCoins = heavyIndustryCoins; // 턴마다 리셋 및 새로 할당
        data.budget = budget; // 디스플레이용
        
        // --- 비예산 및 농업/경공업 생산 ---
        const nonBudgetGdp = gdp - budget;
        const ratios = data.nonBudgetRatio || { mining: 0, agriculture: 0, commerce: 0, lightIndustry: 0 };
        
        const agriShare = nonBudgetGdp * (Number(ratios.agriculture || 0) / 100);
        const lightShare = nonBudgetGdp * (Number(ratios.lightIndustry || 0) / 100);
        
        const agriCoins = Math.floor(agriShare / 50000); // 농수산업장
        const lightCoins = Math.floor(lightShare / 50000); // 경공업코인
        
        const foodProduced = agriCoins * 5;
        const consumerGoodsProduced = lightCoins * 100;
        
        // --- 자원 갱신 ---
        const { data: countryResources } = await supabase.from('resources').select('*').eq('country_id', entry.country_id);
        let foodAmount = 0;
        let cgAmount = 0;
        
        if (countryResources) {
          const foodRes = countryResources.find(r => r.resource_type === 'food');
          const cgRes = countryResources.find(r => r.resource_type === 'consumer_goods');
          if (foodRes) foodAmount = Number(foodRes.amount);
          if (cgRes) cgAmount = Number(cgRes.amount);
        }
        
        foodAmount += foodProduced;
        cgAmount += consumerGoodsProduced;
        
        const updateRes = async (type, amt) => {
          const existing = countryResources?.find(r => r.resource_type === type);
          if (existing) {
            await supabase.from('resources').update({ amount: amt }).eq('id', existing.id);
          } else {
            await supabase.from('resources').insert({ country_id: entry.country_id, resource_type: type, amount: amt, production_per_turn: 0 });
          }
        };
        
        await updateRes('food', foodAmount);
        await updateRes('consumer_goods', cgAmount);

        // --- 무기 생산 (중공업단지 + 조선소) ---
        // 해당 국가의 완료된 연구 기술 목록 가져오기
        const { data: completedResearches } = await supabase
          .from('researches')
          .select('name')
          .eq('country_id', entry.country_id)
          .eq('status', 'completed');
        const completedNames = completedResearches ? completedResearches.map(r => r.name) : [];

        const weapons = data.weapons || {};
        const allocations = data.weaponAllocations || {};
        
        for (const tmpl of weaponTemplates) {
          const allocAmount = allocations[tmpl.id] || 0;
          if (allocAmount <= 0) continue;
          
          // 요구 기술 검증
          if (tmpl.requiredTech && !completedNames.includes(tmpl.requiredTech)) continue;

          let possibleRuns = allocAmount;
          
          // 자원 소모 검증
          const resCosts = tmpl.resourceCosts || {};
          const resourcesToConsume = [];
          for (const [resName, cost] of Object.entries(resCosts)) {
            if (cost > 0) {
              // DB에 한글 이름으로 저장되어 있을 경우를 위해 리소스 찾기
              const resData = countryResources?.find(r => r.resource_type === resName);
              const currentAmt = resData ? Number(resData.amount) : 0;
              const maxRunsWithRes = Math.floor(currentAmt / cost);
              if (maxRunsWithRes < possibleRuns) possibleRuns = maxRunsWithRes;
              resourcesToConsume.push({ type: resName, costPerRun: cost, existing: resData });
            }
          }

          if (possibleRuns > 0) {
            // 자원 차감
            for (const r of resourcesToConsume) {
              const deduct = r.costPerRun * possibleRuns;
              const newAmt = (Number(r.existing?.amount) || 0) - deduct;
              await updateRes(r.type, newAmt);
              if (r.existing) r.existing.amount = newAmt; // 업데이트 반영 (다른 무기 생산을 위해)
            }
            // 무기 생산
            const produced = possibleRuns * (tmpl.powerCost || 1);
            weapons[tmpl.name] = (weapons[tmpl.name] || 0) + produced;
          }
        }
        data.weapons = weapons;
        
        // --- 인플레이션 / 디플레이션 판정 ---
        const warnings = [];
        if (totalPopulation > 0) {
          if (foodAmount < totalPopulation) warnings.push('⚠️ 식량 인플레이션 (식량 부족)');
          else if (foodAmount >= totalPopulation * 2) warnings.push('📉 식량 디플레이션 (식량 과잉)');
          
          if (cgAmount < totalPopulation) warnings.push('⚠️ 소비재 인플레이션 (소비재 부족)');
          else if (cgAmount >= totalPopulation * 2) warnings.push('📉 소비재 디플레이션 (소비재 과잉)');
        }
        data.warnings = warnings;
        
        await supabase
          .from('data_entries')
          .update({ data })
          .eq('id', entry.id);
      }
    }

    return { success: true };
  } catch (err) {
    console.error('Turn processing error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 턴을 이전 상태로 롤백
 */
export async function rollbackTurn() {
  try {
    const { data: snapshotEntry } = await supabase
      .from('data_entries')
      .select('data')
      .eq('category', 'turn_snapshot')
      .is('country_id', null)
      .single();

    if (!snapshotEntry || !snapshotEntry.data) {
      return { success: false, error: '저장된 이전 턴 스냅샷이 없습니다.' };
    }

    const { turn, researches, resources, ecoEntries } = snapshotEntry.data;

    // 1. 상태 복원
    await supabase.from('game_state').update({ current_turn: turn, turn_name: `${turn}턴` }).eq('id', 1);

    // 2. 연구 복원
    if (researches && researches.length > 0) {
      for (const r of researches) {
        await supabase.from('researches').update({ remaining_turns: r.remaining_turns, status: r.status }).eq('id', r.id);
      }
    }

    // 3. 자원 복원
    if (resources && resources.length > 0) {
      for (const res of resources) {
        await supabase.from('resources').update({ amount: res.amount }).eq('id', res.id);
      }
    }

    // 4. 경제(GDP) 복원
    if (ecoEntries && ecoEntries.length > 0) {
      for (const entry of ecoEntries) {
        await supabase.from('data_entries').update({ data: entry.data }).eq('id', entry.id);
      }
    }

    // 삭제 (한 번만 롤백 가능하도록 하거나 유지. 여기선 유지)
    return { success: true };
  } catch (err) {
    console.error('Rollback error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 1턴으로 강제 초기화
 */
export async function resetToTurnOne() {
  try {
    await supabase.from('game_state').update({ current_turn: 1, turn_name: '1턴' }).eq('id', 1);
    // 선택적으로 데이터(연구, 자원)를 비우거나 유지할 수 있습니다.
    // 여기서는 단순히 턴만 1로 되돌립니다.
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function consumeResources(countryId, requiredResources) {
  return true; 
}

export async function transferTech(targetCountryId, techName, techLevel, isAdmin = false) {
  try {
    // 1. Get target's current tech level
    const { data: currentRes } = await supabase
      .from('researches')
      .select('*')
      .eq('country_id', targetCountryId)
      .eq('name', techName)
      .single();

    const currentLevel = currentRes ? currentRes.level : 0;

    if (currentLevel >= techLevel) {
      return { success: false, error: '대상 국가가 이미 해당 기술을 같거나 높은 단계로 보유하고 있습니다.' };
    }

    // Calculate skip bonus (Skeleton only, do not write to DB yet)
    let bonusToAdd = 0;
    if (!isAdmin) {
      const levelsSkipped = techLevel - currentLevel - 1;
      if (levelsSkipped > 0) {
        bonusToAdd = levelsSkipped * 10;
      }
    }

    // Update or insert target research
    if (currentRes) {
      await supabase.from('researches').update({ level: techLevel, status: 'completed', remaining_turns: 0 }).eq('id', currentRes.id);
    } else {
      await supabase.from('researches').insert({
        country_id: targetCountryId,
        name: techName,
        level: techLevel,
        status: 'completed',
        remaining_turns: 0
      });
    }

    // [뼈대] 보너스는 나중에 생산력에 비례하여 직접 계산되도록 추가할 예정이므로 DB 저장은 제거함
    // if (bonusToAdd > 0) { ... }

    return { success: true, bonusAdded: bonusToAdd };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
}

/**
 * 유저간 중공업 코인 전송
 */
export async function transferHeavyIndustryCoins(fromCountryId, toCountryId, amount) {
  if (amount <= 0) return { success: false, error: '올바른 수량을 입력하세요.' };

  // 1. Check sender
  const { data: fromEntry } = await supabase
    .from('data_entries')
    .select('id, data')
    .eq('country_id', fromCountryId)
    .eq('category', 'economy')
    .single();

  if (!fromEntry || !fromEntry.data) return { success: false, error: '보내는 국가의 경제 데이터가 없습니다.' };
  
  const fromCoins = Number(fromEntry.data.heavyIndustryCoins || 0);
  if (fromCoins < amount) return { success: false, error: '중공업 코인이 부족합니다.' };

  // 2. Fetch receiver
  const { data: toEntry } = await supabase
    .from('data_entries')
    .select('id, data')
    .eq('country_id', toCountryId)
    .eq('category', 'economy')
    .single();

  if (!toEntry) return { success: false, error: '받는 국가의 경제 데이터가 없습니다.' };
  const toData = toEntry.data || {};

  // 3. Update sender
  const newFromData = { ...fromEntry.data, heavyIndustryCoins: fromCoins - amount };
  await supabase.from('data_entries').update({ data: newFromData }).eq('id', fromEntry.id);

  // 4. Update receiver
  const newToData = { ...toData, heavyIndustryCoins: Number(toData.heavyIndustryCoins || 0) + amount };
  await supabase.from('data_entries').update({ data: newToData }).eq('id', toEntry.id);

  return { success: true };
}

/**
 * 유저간 무기 전송
 */
export async function transferWeapons(fromCountryId, toCountryId, weaponName, amount) {
  if (amount <= 0) return { success: false, error: '올바른 수량을 입력하세요.' };

  // 1. Check sender
  const { data: fromEntry } = await supabase
    .from('data_entries')
    .select('id, data')
    .eq('country_id', fromCountryId)
    .eq('category', 'economy')
    .single();

  if (!fromEntry || !fromEntry.data) return { success: false, error: '보내는 국가의 경제 데이터가 없습니다.' };
  
  const fromWeapons = fromEntry.data.weapons || {};
  const currentAmount = fromWeapons[weaponName] || 0;
  if (currentAmount < amount) return { success: false, error: '해당 무기의 재고가 부족합니다.' };

  // 2. Fetch receiver
  const { data: toEntry } = await supabase
    .from('data_entries')
    .select('id, data')
    .eq('country_id', toCountryId)
    .eq('category', 'economy')
    .single();

  if (!toEntry) return { success: false, error: '받는 국가의 경제 데이터가 없습니다.' };
  const toData = toEntry.data || {};
  const toWeapons = toData.weapons || {};

  // 3. Update sender
  fromWeapons[weaponName] -= amount;
  if (fromWeapons[weaponName] === 0) delete fromWeapons[weaponName];
  const newFromData = { ...fromEntry.data, weapons: fromWeapons };
  await supabase.from('data_entries').update({ data: newFromData }).eq('id', fromEntry.id);

  // 4. Update receiver
  toWeapons[weaponName] = (toWeapons[weaponName] || 0) + amount;
  const newToData = { ...toData, weapons: toWeapons };
  await supabase.from('data_entries').update({ data: newToData }).eq('id', toEntry.id);

  return { success: true };
}

/**
 * 유저간 자원 전송
 */
export async function transferResources(fromCountryId, toCountryId, resourceType, amount) {
  if (amount <= 0) return { success: false, error: '올바른 수량을 입력하세요.' };

  // 1. Fetch sender resource
  const { data: fromRes } = await supabase
    .from('resources')
    .select('id, amount')
    .eq('country_id', fromCountryId)
    .eq('resource_type', resourceType)
    .single();
    
  if (!fromRes || Number(fromRes.amount) < amount) return { success: false, error: '자원이 부족합니다.' };

  // 2. Fetch receiver resource
  const { data: toRes } = await supabase
    .from('resources')
    .select('id, amount')
    .eq('country_id', toCountryId)
    .eq('resource_type', resourceType)
    .maybeSingle();

  // 3. Update sender
  await supabase.from('resources').update({ amount: Number(fromRes.amount) - amount }).eq('id', fromRes.id);

  // 4. Update receiver
  if (toRes) {
    await supabase.from('resources').update({ amount: Number(toRes.amount) + amount }).eq('id', toRes.id);
  } else {
    await supabase.from('resources').insert({
      country_id: toCountryId,
      resource_type: resourceType,
      amount: amount,
      production_per_turn: 0
    });
  }

  // 5. Log transfer
  await supabase.from('resource_transfers').insert({
    from_country_id: fromCountryId,
    to_country_id: toCountryId,
    resource_type: resourceType,
    amount: amount
  });

  return { success: true };
}
