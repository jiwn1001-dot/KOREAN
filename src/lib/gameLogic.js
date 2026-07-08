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
      radar_tech: new Set(),
      rocket_tech: new Set()
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
    const countryTechMultipliers = {};
    
    if (completedResearches) {
      completedResearches.forEach(r => {
        if (!countryTechMultipliers[r.country_id]) {
          countryTechMultipliers[r.country_id] = { agri: 1, heavy: 1, light: 1, mining: 1, rocket: 0 };
        }
        const key = `${r.name}_${r.level}`;
        if (effectMap.agri_boost.has(key)) countryTechMultipliers[r.country_id].agri += 0.2;
        if (effectMap.heavy_boost.has(key)) countryTechMultipliers[r.country_id].heavy += 0.2;
        if (effectMap.light_boost.has(key)) countryTechMultipliers[r.country_id].light += 0.2;
        if (effectMap.mining_boost.has(key)) countryTechMultipliers[r.country_id].mining += 0.2;
        if (effectMap.rocket_tech && effectMap.rocket_tech.has(key)) countryTechMultipliers[r.country_id].rocket += 1;

        if (effectMap.prevent_fail.has(key)) {
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

    // 3. 경제, 코인 산정 및 자동 자원 생산
    const { data: ecoEntries, error: ecoError } = await supabase
      .from('data_entries')
      .select('id, country_id, data')
      .eq('category', 'economy');

    if (!ecoError && ecoEntries) {
      for (const entry of ecoEntries) {
        let data = entry.data || {};
        
        // 3-1. 상업 코인 및 경제 투자에 의한 GDP 증가
        let currentGdp = Number(data.gdp || 0);
        const commCoins = Number(data.commerceCoins || 0);
        if (commCoins !== 0) {
          currentGdp = currentGdp * (1 + (commCoins * 0.01));
          data.commerceCoins = 0; // 소모됨
        }
        
        const ecoInvest = Number(data.economicInvestment || 0);
        if (ecoInvest > 0) {
          currentGdp += (ecoInvest * 10000);
          data.economicInvestment = 0; // 초기화
        }
        data.gdp = currentGdp;

        // 3-2. 예산 및 비예산 분배
        const taxRate = Number(data.taxRate || 0);
        const budget = currentGdp * (taxRate / 100);
        const nonBudget = currentGdp - budget;
        
        const alloc = data.allocation || { mining: 0, agriculture: 0, commerce: 0, lightIndustry: 0 };
        
        // 3-3. 코인 산정
        data.heavyIndustryCoins = Math.floor(budget / 50000);
        data.agricultureCoins = Math.floor((nonBudget * (alloc.agriculture / 100)) / 2000);
        data.lightIndustryCoins = Math.floor((nonBudget * (alloc.lightIndustry / 100)) / 50000);
        
        // 무기 생산 로직 (큐 처리)
        if (entry.country_id) {
          const adminMults = data.multipliers || { shipbuilding: 1, food: 1, heavyIndustry: 1, consumerGoods: 1 };
          const techMults = countryTechMultipliers[entry.country_id] || { agri: 1, heavy: 1, light: 1, mining: 1, rocket: 0 };
          
          // 향후 우주업데이트를 위한 로켓 관련 함숫값 (Placeholder)
          if (techMults.rocket > 0) {
              // TODO: 우주 관련 생산력 등 로직 구현
          }

          let availHeavy = Math.floor((data.heavyIndustryComplexes || 0) * (adminMults.heavyIndustry || 1) * techMults.heavy);
          let availShipyard = Math.floor((data.shipyards || 0) * (adminMults.shipbuilding || 1));
          const weaponBlueprints = settingEntry?.data?.weaponBlueprints || [];
          
          const { data: qEntry } = await supabase.from('data_entries').select('id, data').eq('category', 'military_queue').eq('country_id', entry.country_id).single();
          if (qEntry && qEntry.data && qEntry.data.queue && qEntry.data.queue.length > 0) {
            let queue = qEntry.data.queue;
            let updated = false;
            
            const { data: cRes } = await supabase.from('resources').select('*').eq('country_id', entry.country_id);
            const rMap = {};
            if (cRes) {
              cRes.forEach(r => {
                if (r.resource_type === 'weapon') rMap[`weapon_${r.name}`] = r;
                else rMap[r.resource_type] = r;
              });
            }
            
            for (let i = 0; i < queue.length; i++) {
              let qItem = queue[i];
              if (qItem.progress >= qItem.target) continue;
              
              const bp = weaponBlueprints.find(b => b.id === qItem.bpId);
              if (!bp) continue;
              
              const reqFacility = bp.facility === 'heavy' ? availHeavy : availShipyard;
              const reqAmount = bp.industryCost || 1;
              
              let maxProd = Math.floor(reqFacility / reqAmount);
              if (maxProd <= 0) continue;
              
              if (bp.resources) {
                for (const [resType, resReq] of Object.entries(bp.resources)) {
                  const currAmt = rMap[resType] ? Number(rMap[resType].amount) : 0;
                  const maxByRes = Math.floor(currAmt / resReq);
                  if (maxByRes < maxProd) maxProd = maxByRes;
                }
              }
              
              const needed = qItem.target - qItem.progress;
              if (maxProd > needed) maxProd = needed;
              
              if (maxProd > 0) {
                qItem.progress += maxProd;
                if (bp.facility === 'heavy') availHeavy -= maxProd * reqAmount;
                else availShipyard -= maxProd * reqAmount;
                
                if (bp.resources) {
                  for (const [resType, resReq] of Object.entries(bp.resources)) {
                    rMap[resType].amount = Number(rMap[resType].amount) - (maxProd * resReq);
                    await supabase.from('resources').update({ amount: rMap[resType].amount }).eq('id', rMap[resType].id);
                  }
                }
                
                const wpKey = `weapon_${bp.name}`;
                if (rMap[wpKey]) {
                  rMap[wpKey].amount = Number(rMap[wpKey].amount) + maxProd;
                  await supabase.from('resources').update({ amount: rMap[wpKey].amount }).eq('id', rMap[wpKey].id);
                } else {
                  const { data: newW } = await supabase.from('resources').insert({
                    country_id: entry.country_id,
                    resource_type: 'weapon',
                    name: bp.name,
                    amount: maxProd,
                    production_per_turn: 0
                  }).select().single();
                  if (newW) rMap[wpKey] = newW;
                }
                updated = true;
              }
            }
            
            if (updated) {
              queue = queue.filter(q => q.progress < q.target);
              await supabase.from('data_entries').update({ data: { queue } }).eq('id', qEntry.id);
            }
          }
        }
        
        // 3-4. 이전 턴에 지어둔 단지/조선소 초기화 (매년 새로 배정해야 하므로)
        data.heavyIndustryComplexes = 0;
        data.shipyards = 0;

        // 3-5. 코인 기반 자동 자원 생산 (농업 -> 식량, 경공업 -> 소비재) 및 인구 비례 소비
        if (entry.country_id) {
          const adminMults = data.multipliers || { shipbuilding: 1, food: 1, heavyIndustry: 1, consumerGoods: 1 };
          const techMults = countryTechMultipliers[entry.country_id] || { agri: 1, heavy: 1, light: 1, mining: 1, rocket: 0 };
          
          const foodAmount = Math.floor(data.agricultureCoins * 12 * (adminMults.food || 1) * techMults.agri);
          const cgAmount = Math.floor(data.lightIndustryCoins * 100 * (adminMults.consumerGoods || 1) * techMults.light);
          const population = data.population?.total || 0;
          
          const { data: cRes2 } = await supabase.from('resources').select('id, resource_type, amount, production_per_turn').eq('country_id', entry.country_id);
          if (cRes2) {
            const foodRsc = cRes2.find(r => r.resource_type === 'food');
            const prevFood = foodRsc ? Number(foodRsc.amount) : 0;
            const newFoodAmount = prevFood + foodAmount - population;
            if (foodRsc) {
              await supabase.from('resources').update({ amount: newFoodAmount }).eq('id', foodRsc.id);
            } else {
              await supabase.from('resources').insert({ country_id: entry.country_id, resource_type: 'food', amount: newFoodAmount, production_per_turn: 0 });
            }

            const cgRsc = cRes2.find(r => r.resource_type === 'consumer_goods');
            const prevCg = cgRsc ? Number(cgRsc.amount) : 0;
            const newCgAmount = prevCg + cgAmount - population;
            if (cgRsc) {
              await supabase.from('resources').update({ amount: newCgAmount }).eq('id', cgRsc.id);
            } else {
              await supabase.from('resources').insert({ country_id: entry.country_id, resource_type: 'consumer_goods', amount: newCgAmount, production_per_turn: 0 });
            }
          }
        }

        // DB 업데이트
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
