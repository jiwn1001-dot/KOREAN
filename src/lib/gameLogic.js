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
      rocket_tech: new Set(),
      penetration_boost: new Set(),
      antiair_boost: new Set(),
      observation_boost: new Set()
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
        if (effectMap.research_speed.has(key)) {
          const tree = techTrees.find(t => t.name === r.name);
          if (tree) {
            const lvl = tree.levels.find(l => l.level === r.level);
            if (lvl && lvl.era) {
              if (!countryTechMultipliers[r.country_id].fastEras) countryTechMultipliers[r.country_id].fastEras = new Set();
              countryTechMultipliers[r.country_id].fastEras.add(lvl.era);
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
        let currentEra = null;
        const tree = techTrees.find(t => t.name === r.name);
        if (tree) {
          const lvl = tree.levels.find(l => l.level === r.level);
          if (lvl) currentEra = lvl.era;
        }
        
        const isFast = currentEra && countryTechMultipliers[r.country_id]?.fastEras?.has(currentEra);
        const deduction = isFast ? 2 : 1;
        const newRemaining = Math.max(0, r.remaining_turns - deduction);
        let status = 'in_progress';
        
        if (newRemaining === 0) {
          // 실패 확률 계산 (50%)
          
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
          
          const foodAmount = Math.floor(data.agricultureCoins * 5 * (adminMults.food || 1) * techMults.agri);
          const cgAmount = Math.floor(data.lightIndustryCoins * 100 * (adminMults.consumerGoods || 1) * techMults.light);
          const population = data.population?.total || 0;
          
          const { data: cRes2 } = await supabase.from('resources').select('id, resource_type, amount, production_per_turn').eq('country_id', entry.country_id);
          if (cRes2) {
            const foodRsc = cRes2.find(r => r.resource_type === 'food');
            const prevFood = foodRsc ? Number(foodRsc.amount) : 0;
            const foodMult = data.food_consumption_mult !== undefined ? data.food_consumption_mult : 1.0;
            const newFoodAmount = prevFood + foodAmount - Math.floor(population * foodMult);
            if (foodRsc) {
              await supabase.from('resources').update({ amount: newFoodAmount }).eq('id', foodRsc.id);
            } else {
              await supabase.from('resources').insert({ country_id: entry.country_id, resource_type: 'food', amount: newFoodAmount, production_per_turn: 0 });
            }

            const cgRsc = cRes2.find(r => r.resource_type === 'consumer_goods');
            const prevCg = cgRsc ? Number(cgRsc.amount) : 0;
            const cgMult = data.cg_consumption_mult !== undefined ? data.cg_consumption_mult : 1.0;
            const newCgAmount = prevCg + cgAmount - Math.floor(population * cgMult);
            if (cgRsc) {
              await supabase.from('resources').update({ amount: newCgAmount }).eq('id', cgRsc.id);
            } else {
              await supabase.from('resources').insert({ country_id: entry.country_id, resource_type: 'consumer_goods', amount: newCgAmount, production_per_turn: 0 });
            }
          }
        }

        // 3-6. 인구 증가율 처리 (나눌 값으로 적용)
        if (data.population && data.population.growthRate > 0) {
          const gRate = data.population.growthRate;
          data.population.total = Math.floor(data.population.total + (data.population.total / gRate));
          data.population.mobilizable = Math.floor(data.population.mobilizable + (data.population.mobilizable / gRate));
        }

        // DB 업데이트
        await supabase
          .from('data_entries')
          .update({ data })
          .eq('id', entry.id);
      }
    }

    // 4. 편제 유닛 연료 소모 처리
    const { data: unitEntries } = await supabase.from('data_entries').select('id, country_id, data').eq('category', 'military_units');
    if (unitEntries) {
      for (const uEntry of unitEntries) {
        if (!uEntry.country_id || !uEntry.data?.units || uEntry.data.units.length === 0) continue;

        // 해당 국가의 유닛 템플릿 정보 가져오기
        const unitTemplates = settingEntry?.data?.unitTemplates || [];
        
        // 해당 국가 자원 조회
        const { data: countryResources } = await supabase.from('resources').select('*').eq('country_id', uEntry.country_id);
        const resMap = {};
        if (countryResources) {
          countryResources.forEach(r => { resMap[r.resource_type] = r; });
        }

        let units = [...uEntry.data.units];
        let updated = false;

        for (let i = 0; i < units.length; i++) {
          const unit = units[i];
          const template = unitTemplates.find(t => t.id === unit.templateId);
          if (!template) continue;

          // 연료 불필요 유닛은 항상 전체 가동
          if (!template.fuelType || template.fuelType === 'none' || template.fuelPerTurn <= 0) {
            if (unit.operational !== unit.count) {
              units[i] = { ...unit, operational: unit.count };
              updated = true;
            }
            continue;
          }

          const totalFuelNeeded = template.fuelPerTurn * unit.count;
          const fuelRes = resMap[template.fuelType];
          const currentFuel = fuelRes ? Number(fuelRes.amount) : 0;

          if (currentFuel >= totalFuelNeeded) {
            // 충분 → 전체 가동, 연료 차감
            if (fuelRes) {
              fuelRes.amount = currentFuel - totalFuelNeeded;
              await supabase.from('resources').update({ amount: fuelRes.amount }).eq('id', fuelRes.id);
            }
            units[i] = { ...unit, operational: unit.count };
            updated = true;
          } else {
            // 부족 → 가능한 만큼만 가동
            const canOperate = Math.floor(currentFuel / template.fuelPerTurn);
            const fuelUsed = canOperate * template.fuelPerTurn;
            if (fuelRes && fuelUsed > 0) {
              fuelRes.amount = currentFuel - fuelUsed;
              await supabase.from('resources').update({ amount: fuelRes.amount }).eq('id', fuelRes.id);
            }
            units[i] = { ...unit, operational: canOperate };
            updated = true;
          }
        }

        if (updated) {
          await supabase.from('data_entries').update({ data: { units } }).eq('id', uEntry.id);
        }
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


export async function transferItem(senderId, receiverId, category, itemKey, amount) {
  if (!senderId || !receiverId || !category || !itemKey || amount <= 0) return { success: false, error: '유효하지 않은 요청입니다.' };
  if (senderId === receiverId) return { success: false, error: '자기 자신에게 보낼 수 없습니다.' };

  try {
    if (category === 'coin') {
      const { data: sData } = await supabase.from('data_entries').select('data').eq('category', `economy_${senderId}`).eq('country_id', senderId).single();
      const { data: rData } = await supabase.from('data_entries').select('data').eq('category', `economy_${receiverId}`).eq('country_id', receiverId).single();
      
      const senderEcon = sData?.data || {};
      const receiverEcon = rData?.data || {};
      
      if ((senderEcon[itemKey] || 0) < amount) return { success: false, error: '코인이 부족합니다.' };
      
      senderEcon[itemKey] = (senderEcon[itemKey] || 0) - amount;
      receiverEcon[itemKey] = (receiverEcon[itemKey] || 0) + amount;
      
      await supabase.from('data_entries').upsert({ category: `economy_${senderId}`, country_id: senderId, data: senderEcon }, { onConflict: 'country_id,category' });
      await supabase.from('data_entries').upsert({ category: `economy_${receiverId}`, country_id: receiverId, data: receiverEcon }, { onConflict: 'country_id,category' });
      
      return { success: true };
    } else if (category === 'resource' || category === 'weapon') {
      let queryType = category === 'weapon' ? 'weapon' : itemKey;
      let q = supabase.from('resources').select('*').eq('country_id', senderId).eq('resource_type', queryType);
      if (category === 'weapon') q = q.eq('name', itemKey);
      
      const { data: sRes } = await q.single();
      if (!sRes || Number(sRes.amount) < amount) return { success: false, error: '보유량이 부족합니다.' };
      
      let rq = supabase.from('resources').select('*').eq('country_id', receiverId).eq('resource_type', queryType);
      if (category === 'weapon') rq = rq.eq('name', itemKey);
      
      const { data: rRes } = await rq.single();
      
      const newSenderAmt = Number(sRes.amount) - amount;
      await supabase.from('resources').update({ amount: newSenderAmt }).eq('id', sRes.id);
      
      if (rRes) {
        await supabase.from('resources').update({ amount: Number(rRes.amount) + amount }).eq('id', rRes.id);
      } else {
        const ins = { country_id: receiverId, resource_type: queryType, amount };
        if (category === 'weapon') ins.name = itemKey;
        await supabase.from('resources').insert(ins);
      }
      return { success: true };
    }
    return { success: false, error: '잘못된 카테고리입니다.' };
  } catch (err) {
    console.error(err);
    return { success: false, error: '오류가 발생했습니다.' };
  }
}


export async function transferItems(fromCountryId, toCountryId, itemType, itemKey, amount) {
  if (amount <= 0) return { success: false, message: '수량은 1 이상이어야 합니다.' };
  
  // 1. Check if sender currently has enough before even creating the request
  if (itemType === 'resource' || itemType === 'weapon') {
    let query = supabase.from('resources').select('*').eq('country_id', fromCountryId);
    if (itemType === 'weapon') query = query.eq('resource_type', 'weapon').eq('name', itemKey);
    else query = query.eq('resource_type', itemKey);
    const { data: senderRes } = await query.single();
    if (!senderRes || senderRes.amount < amount) {
      return { success: false, message: '보낼 물자가 부족합니다.' };
    }
  } else if (itemType === 'coin') {
    const { data: senderData } = await supabase.from('data_entries').select('*').eq('category', 'country_stats').eq('country_id', fromCountryId).single();
    if (!senderData || !senderData.data[itemKey] || senderData.data[itemKey] < amount) {
      return { success: false, message: '보낼 코인이 부족합니다.' };
    }
  }

  // 2. Add to receiver's pending_transfers
  let { data: ptEntry } = await supabase.from('data_entries').select('*').eq('category', 'pending_transfers').eq('country_id', toCountryId).single();
  
  const newTransfer = {
    id: crypto.randomUUID(),
    from: fromCountryId,
    type: itemType,
    key: itemKey,
    amount: amount,
    timestamp: new Date().toISOString()
  };

  if (ptEntry) {
    const transfers = ptEntry.data?.transfers || [];
    transfers.push(newTransfer);
    await supabase.from('data_entries').update({ data: { transfers } }).eq('id', ptEntry.id);
  } else {
    await supabase.from('data_entries').insert({
      country_id: toCountryId,
      category: 'pending_transfers',
      data: { transfers: [newTransfer] }
    });
  }
  
  return { success: true, message: '상대방에게 전송(수락 대기)을 요청했습니다.' };
}

export async function acceptTransfer(transferId, receiverCountryId) {
  const { data: ptEntry } = await supabase.from('data_entries').select('*').eq('category', 'pending_transfers').eq('country_id', receiverCountryId).single();
  if (!ptEntry) return { success: false, message: '대기 중인 요청이 없습니다.' };

  const transfers = ptEntry.data?.transfers || [];
  const transferIndex = transfers.findIndex(t => t.id === transferId);
  if (transferIndex === -1) return { success: false, message: '해당 요청을 찾을 수 없습니다.' };

  const transfer = transfers[transferIndex];
  const { from: fromCountryId, type: itemType, key: itemKey, amount } = transfer;

  // 1. Perform the actual transfer
  if (itemType === 'resource' || itemType === 'weapon') {
    let query = supabase.from('resources').select('*').eq('country_id', fromCountryId);
    if (itemType === 'weapon') query = query.eq('resource_type', 'weapon').eq('name', itemKey);
    else query = query.eq('resource_type', itemKey);
    const { data: senderRes } = await query.single();
    
    if (!senderRes || senderRes.amount < amount) {
      return { success: false, message: '상대방의 잔여 물자가 부족하여 수락할 수 없습니다.' };
    }
    
    await supabase.from('resources').update({ amount: senderRes.amount - amount }).eq('id', senderRes.id);
    
    let rQuery = supabase.from('resources').select('*').eq('country_id', receiverCountryId);
    if (itemType === 'weapon') rQuery = rQuery.eq('resource_type', 'weapon').eq('name', itemKey);
    else rQuery = rQuery.eq('resource_type', itemKey);
    const { data: receiverRes } = await rQuery.single();
    
    if (receiverRes) {
      await supabase.from('resources').update({ amount: receiverRes.amount + amount }).eq('id', receiverRes.id);
    } else {
      await supabase.from('resources').insert({
        country_id: receiverCountryId,
        resource_type: itemType === 'weapon' ? 'weapon' : itemKey,
        amount: amount,
        production_per_turn: 0,
        name: itemType === 'weapon' ? itemKey : null
      });
    }
  } else if (itemType === 'coin') {
    const { data: senderData } = await supabase.from('data_entries').select('*').eq('category', 'country_stats').eq('country_id', fromCountryId).single();
    if (!senderData || !senderData.data[itemKey] || senderData.data[itemKey] < amount) {
      return { success: false, message: '상대방의 잔여 코인이 부족하여 수락할 수 없습니다.' };
    }
    
    const { data: receiverData } = await supabase.from('data_entries').select('*').eq('category', 'country_stats').eq('country_id', receiverCountryId).single();
    if (!receiverData) return { success: false, message: '수신국 데이터를 찾을 수 없습니다.' };
    
    senderData.data[itemKey] -= amount;
    receiverData.data[itemKey] = (receiverData.data[itemKey] || 0) + amount;
    
    await supabase.from('data_entries').update({ data: senderData.data }).eq('id', senderData.id);
    await supabase.from('data_entries').update({ data: receiverData.data }).eq('id', receiverData.id);
  }

  // 2. Remove from pending list
  transfers.splice(transferIndex, 1);
  await supabase.from('data_entries').update({ data: { transfers } }).eq('id', ptEntry.id);

  return { success: true, message: '전송을 수락하여 인벤토리에 추가되었습니다.' };
}

export async function rejectTransfer(transferId, receiverCountryId) {
  const { data: ptEntry } = await supabase.from('data_entries').select('*').eq('category', 'pending_transfers').eq('country_id', receiverCountryId).single();
  if (!ptEntry) return { success: false, message: '대기 중인 요청이 없습니다.' };

  const transfers = ptEntry.data?.transfers || [];
  const transferIndex = transfers.findIndex(t => t.id === transferId);
  if (transferIndex === -1) return { success: false, message: '해당 요청을 찾을 수 없습니다.' };

  transfers.splice(transferIndex, 1);
  await supabase.from('data_entries').update({ data: { transfers } }).eq('id', ptEntry.id);

  return { success: true, message: '전송 요청을 거절했습니다.' };
}

export async function getPendingTransfers(countryId) {
  const { data } = await supabase.from('data_entries').select('*').eq('category', 'pending_transfers').eq('country_id', countryId).single();
  return data?.data?.transfers || [];
}
