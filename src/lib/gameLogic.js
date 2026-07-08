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

    // 3. 경제 성장 처리 (GDP)
    const { data: ecoEntries, error: ecoError } = await supabase
      .from('data_entries')
      .select('id, data')
      .eq('category', 'economy');

    if (!ecoError && ecoEntries) {
      for (const entry of ecoEntries) {
        const data = entry.data || {};
        const gdpStr = data.gdp?.value || '0';
        const growthStr = data.economicGrowthRate?.value || '0';
        
        let gdp = parseFloat(gdpStr.replace(/[^0-9.-]+/g,"")) || 0;
        let growthRate = parseFloat(growthStr.replace(/[^0-9.-]+/g,"")) || 0;

        if (gdp > 0 && growthRate !== 0) {
          const newGdp = gdp * (1 + (growthRate / 100));
          data.gdp = { ...data.gdp, value: newGdp.toFixed(1) };
          
          await supabase
            .from('data_entries')
            .update({ data })
            .eq('id', entry.id);
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
