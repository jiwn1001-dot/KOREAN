import { supabase } from './supabase';

/**
 * 턴을 넘길 때 호출되는 핵심 게임 로직 함수
 * @param {number} newTurn - 새 턴 번호
 */
export async function processTurnEnd(newTurn) {
  try {
    // 1. 진행 중인 연구 remaining_turns 감소 처리
    const { data: researches, error: resError } = await supabase
      .from('researches')
      .select('id, remaining_turns')
      .eq('status', 'in_progress');

    if (!resError && researches) {
      for (const r of researches) {
        const newRemaining = Math.max(0, r.remaining_turns - 1);
        const status = newRemaining === 0 ? 'completed' : 'in_progress';
        
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
    // economy data entry를 가져와서 gdp = gdp * (1 + growthRate) 적용
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
          // 단위 복원 (단순화: 억 달러 등은 포맷팅 로직 추가 필요할 수 있음)
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
 * 자원 소모 체크 (유닛 생산, 건설 등에 사용)
 * @param {string} countryId 
 * @param {Array<{type: string, amount: number}>} requiredResources 
 */
export async function consumeResources(countryId, requiredResources) {
  // 실제 자원 소모 로직 (추후 생산 시스템 개발 시 활용)
  // return true (성공) or false (자원 부족)
  return true; 
}
