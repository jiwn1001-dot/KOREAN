import { supabase } from './supabase.js';
import { saveAerialCombatSession, getAerialCombatSession } from './store.js';

/**
 * ===== 카드 관리 =====
 */

/**
 * 전투기 유닛으로부터 카드 덱 생성
 * @param {Array} aircraftUnits - 전투기 유닛 배열 (각 유닛: {id, unitTemplateId, speed, quantity})
 * @returns {Array} 카드 배열 [{unitId, cardId, speed, isAce, canBlock}]
 */
export function generateAerialCards(aircraftUnits, cumulativeUnitsDeployed = 0, cumulativeAcesGenerated = 0) {
  const cards = [];
  let addedQuantity = 0;

  // 1. 모든 카드 생성 (아직 에이스 미배정)
  aircraftUnits.forEach(unit => {
    const unitId = unit.id;
    const unitName = unit.name || '전투기';
    const speed = unit.speed || 1;
    const quantity = unit.quantity || 0;
    const unitImage = unit.image || null;
    const aiLevel = Math.max(1, parseInt(unit.aiLevel || 1, 10));

    addedQuantity += quantity;

    for (let i = 0; i < quantity; i++) {
      cards.push({
        unitId,
        unitName,
        cardId: `${unitId}_${Date.now()}_${i}`, // Ensure unique ID for reinforcements
        speed,
        unitImage,
        aiLevel,
        isAce: false,
        canBlock: false,
        status: 'hand'
      });
    }
  });

  // 2. 누적 수량 기준으로 에이스 산정
  const newCumulativeUnits = cumulativeUnitsDeployed + addedQuantity;
  const newCumulativeAces = Math.floor(newCumulativeUnits / 10);
  const acesToAssign = newCumulativeAces - cumulativeAcesGenerated;

  // 3. 속도가 빠른 순으로 정렬하여 에이스 배정
  cards.sort((a, b) => b.speed - a.speed);

  for (let i = 0; i < acesToAssign; i++) {
    if (cards[i]) {
      cards[i].isAce = true;
    }
  }

  // 패를 섞어줌 (선택사항이나, 가장 빠른게 항상 먼저 나오면 안될 수 있으므로 무작위 섞기)
  cards.sort(() => Math.random() - 0.5);

  return { 
    cards, 
    newAces: acesToAssign,
    cumulativeUnitsDeployed: newCumulativeUnits,
    cumulativeAcesGenerated: newCumulativeAces
  };
}

/**
 * 상대방에게 대공포 카드 생성
 * @param {number} enemyAceCount - 적 에이스 카드 개수
 * @returns {Array} 대공포 카드 배열
 */
export function generateAntiAircraftCards(enemyAceCount) {
  const aaCards = [];
  for (let i = 0; i < enemyAceCount; i++) {
    aaCards.push({
      cardId: `aa_${i}`,
      speed: Infinity, // 대공포는 무조건 우선순위
      isAce: false,
      canBlock: true,
      status: 'hand'
    });
  }
  return aaCards;
}

/**
 * ===== 라운드 전투 =====
 */

/**
 * 1d(attackSpeed + defenseSpeed) 주사위 굴림
 * @param {number} attackSpeed - 공격 측 속도
 * @param {number} defenseSpeed - 방어 측 속도
 * @returns {number} 1 ~ (attackSpeed + defenseSpeed) 사이의 값
 */
export function rollAerialDice(attackSpeed, defenseSpeed) {
  const diceMax = attackSpeed + defenseSpeed;
  return Math.floor(Math.random() * diceMax) + 1;
}

/**
 * 라운드 전투 판정
 * @param {Object} attackCard - 공격 카드 (또는 null = 아낀다)
 * @param {Object} defenseCard - 방어 카드 (또는 null = 아낀다)
 * @returns {Object} 라운드 결과
 */
export function resolveAerialRound(attackCard, defenseCard) {
  // 케이스 1: 양측 모두 아낀 경우 → 무승부
  if (!attackCard && !defenseCard) {
    return {
      winner: 'draw',
      reason: 'both_passed',
      diceResult: null,
      description: '양측 모두 카드를 아껴 무승부처리되었습니다.'
    };
  }

  // 케이스 2: 한쪽이 아낀 경우 → 다른 쪽 승리
  if (!attackCard) {
    return {
      winner: 'defense',
      reason: 'attacker_passed',
      diceResult: null,
      defenderLost: false,
      attackerLost: false,
      description: '공격측이 카드를 아껴 방어측이 자동 승리합니다.'
    };
  }

  if (!defenseCard) {
    return {
      winner: 'attack',
      reason: 'defender_passed',
      diceResult: null,
      defenderLost: false,
      attackerLost: false,
      description: '방어측이 카드를 아껴 공격측이 자동 승리합니다.'
    };
  }

  // 케이스 3: 양측 모두 카드를 낸 경우 → 일반 전투

  const attackSpeed = attackCard.isAce ? attackCard.speed * 5 : attackCard.speed;
  const defenseSpeed = defenseCard.isAce ? defenseCard.speed * 5 : defenseCard.speed;

  // 대공포 카드 처리: 한쪽이라도 대공포를 냈다면 무조건 양측 카드 손실 및 무승부 처리
  if (attackCard.canBlock || defenseCard.canBlock) {
    return {
      winner: 'draw',
      diceResult: null,
      reason: 'antiAircraft_used',
      attackerLost: true,
      defenderLost: true, // 대공포 및 상대방 카드 모두 소모
      description: '대공포 카드가 사용되어 무승부처리되었습니다. 양측 모두 카드 손실.'
    };
  }

  // 일반 전투
  const diceResult = rollAerialDice(attackSpeed, defenseSpeed);
  const winner = diceResult <= attackSpeed ? 'attack' : 'defense';

  return {
    winner,
    diceResult,
    attackSpeed,
    defenseSpeed,
    diceMax: attackSpeed + defenseSpeed,
    reason: 'normal_combat',
    attackerLost: winner === 'defense',
    defenderLost: winner === 'attack',
    description: `1d${attackSpeed + defenseSpeed} 결과: ${diceResult} (공격 ${attackSpeed}, 수비 ${defenseSpeed}) → ${winner === 'attack' ? '공격 승리' : '수비 승리'}`
  };
}

/**
 * ===== 제공권 관리 =====
 */

/**
 * 수동 PvP 공중결전 세션 생성 (글로벌 배틀 상태)
 * @returns {Object} 공중결전 세션 정보
 */
export function createAerialBattle(battleId, type, attackerId, defenderId, attackerUnits, defenderUnits, atkSupplyLimit, defSupplyLimit) {
  const atkResult = generateAerialCards(attackerUnits, 0, 0);
  const defResult = generateAerialCards(defenderUnits, 0, 0);
  
  // 대공포는 서로의 에이스 개수만큼 받음
  const atkAA = generateAntiAircraftCards(defResult.newAces);
  const defAA = generateAntiAircraftCards(atkResult.newAces);

  const averageLevel = (arr) => {
    if (!arr || arr.length === 0) return 1;
    const sum = arr.reduce((acc, u) => acc + Math.max(1, parseInt(u.aiLevel || 1, 10)), 0);
    return Math.max(1, Math.min(5, Math.round(sum / arr.length)));
  };

  const attackerAiLevel = averageLevel(attackerUnits || []);
  const defenderAiLevel = averageLevel(defenderUnits || []);

  return {
    battleId,
    type, // 'bombing', 'supremacy'
    isMajorBattle: false,
    majorBattleRequest: null, // 'requested_by_attacker', 'requested_by_defender', 'accepted', 'declined'
    attackerId,
    defenderId,
    round: 1,
    status: 'active', // 'active', 'finished'
    winner: null,
    strategicActions: [],
    attackerUnits: attackerUnits || [],
    defenderUnits: defenderUnits || [],
    
    // 공격측 상태
    attackerState: {
      cards: atkResult.cards,
      hand: atkResult.cards.filter(c => c.status === 'hand'),
      antiAircraft: atkAA,
      lost: [],
      cumulativeUnitsDeployed: atkResult.cumulativeUnitsDeployed,
      cumulativeAcesGenerated: atkResult.cumulativeAcesGenerated,
      aiLevel: attackerAiLevel,
      supplyLimit: atkSupplyLimit,
      status: 'fighting' // 'fighting', 'surrendered'
    },
    
    // 방어측 상태
    defenderState: {
      cards: defResult.cards,
      hand: defResult.cards.filter(c => c.status === 'hand'),
      antiAircraft: defAA,
      lost: [],
      cumulativeUnitsDeployed: defResult.cumulativeUnitsDeployed,
      cumulativeAcesGenerated: defResult.cumulativeAcesGenerated,
      aiLevel: defenderAiLevel,
      supplyLimit: defSupplyLimit,
      status: 'fighting'
    },
    
    // 현재 라운드 선택
    attackerChoice: null, // { cardId, type: 'normal'|'ace'|'aa'|'pass' }
    defenderChoice: null,
    
    history: []
  };
}

/**
 * 라운드 완료 후 카드 상태 업데이트
 * @param {Object} session - 공중전 세션
 * @param {Object} roundResult - 라운드 결과
 * @param {string} side - 'attacker' or 'defender'
 * @returns {Object} 업데이트된 세션
 */
export function updateSessionAfterRound(session, roundResult, side, opponentSession) {
  const newSession = JSON.parse(JSON.stringify(session)); // Deep copy

  if (roundResult.attackerLost) {
    // 공격측 카드 손실 처리
    // 손실된 카드 ID를 찾아서 상태 변경
  }
  if (roundResult.defenderLost) {
    // 방어측 카드 손실 처리
  }

  newSession.roundHistory.push({
    round: newSession.currentTurn,
    result: roundResult,
    timestamp: new Date().toISOString()
  });

  return newSession;
}

/**
 * 보급 소모 계산 및 보급 한계 초과 확인
 * @param {Object} session - 공중전 세션
 * @param {Array} cardsInUse - 사용한 카드 배열
 * @param {Array} aircraftUnits - 전체 전투기 유닛
 * @returns {Object} {exceedsLimit: boolean, totalUsed: number, limit: number}
 */
export function calculateSupplyUsage(session, cardsInUse, aircraftUnits) {
  let totalUsed = 0;

  cardsInUse.forEach(card => {
    const unit = aircraftUnits.find(u => u.id === card.unitId);
    if (unit && unit.supplyConsumption) {
      totalUsed += unit.supplyConsumption;
    }
  });

  const exceedsLimit = totalUsed > session.supplyLimit;

  return {
    exceedsLimit,
    totalUsed,
    limit: session.supplyLimit,
    adjustedStats: exceedsLimit ? 0.5 : 1.0 // 초과 시 능력치 50%
  };
}

/**
 * ===== AI 플레이어 =====
 */

export function aiChooseCard(aiSession, opponentSession) {
  const effectiveSpeed = (c) => (c?.isAce ? (c.speed || 1) * 5 : (c?.speed || 1));

  const resolveAILevel = () => {
    if (aiSession?.aiLevel) return Math.max(1, Math.min(5, parseInt(aiSession.aiLevel, 10) || 1));
    const sample = (aiSession?.hand || []).slice(0, 5);
    if (!sample.length) return 1;
    const avg = sample.reduce((acc, c) => acc + Math.max(1, parseInt(c.aiLevel || 1, 10)), 0) / sample.length;
    return Math.max(1, Math.min(5, Math.round(avg)));
  };

  const aiLevel = resolveAILevel();
  const hand = aiSession.hand || [];
  const aa = aiSession.antiAircraft || [];
  const availableCards = [...hand, ...aa];
  
  if (availableCards.length === 0) return null;

  const aiNormals = hand.filter(c => !c.isAce);
  const oppHand = opponentSession.hand || [];
  const oppAces = oppHand.filter(c => c.isAce).length;
  const oppAA = opponentSession.antiAircraft?.length || 0;
  const oppLikely = oppHand.length > 0
    ? [...oppHand].sort((a, b) => effectiveSpeed(a) - effectiveSpeed(b))[Math.max(0, Math.floor((oppHand.length - 1) * (aiLevel >= 4 ? 0.75 : aiLevel >= 2 ? 0.5 : 0.25)))]
    : null;
  const oppLikelySpeed = effectiveSpeed(oppLikely);
  
  // 1. 상대방이 에이스가 많고 내가 대공포(AA)가 있다면, 일정 확률로 대공포 투척 (에이스 저격)
    if (aa.length > 0 && oppAces > 0 && oppHand.length > 0) {
      const aaChance = Math.min(0.95, (oppAces / oppHand.length) * (0.35 + aiLevel * 0.12));
     if (Math.random() < aaChance) {
       return aa[0];
     }
  }
  
  // 2. 상대방이 대공포가 많다면 에이스를 내는 것을 꺼림 (일반 카드를 미끼로 던져 대공포 소진 유도)
    if (oppAA > 0 && aiNormals.length > 0) {
      const baitChance = aiLevel >= 4 ? 0.8 : 0.6;
      if (Math.random() < baitChance) {
        // 가장 속도가 낮은 미끼 투척
        const sortedNormals = [...aiNormals].sort((a,b) => effectiveSpeed(a) - effectiveSpeed(b));
        return sortedNormals[0];
     }
  }

  // 3. 카드를 아낄 확률 계산
  const cardRatio = hand.length / (aiSession.cards?.length || 1);
  const basePassChance = [0.42, 0.32, 0.2, 0.12, 0.08][aiLevel - 1] || 0.2;
  let passChance = basePassChance - (cardRatio * 0.2);
  if (oppHand.length === 0 && oppAA === 0) passChance = 0; // 상대 카드가 없으면 무조건 공격
  passChance = Math.max(0, Math.min(0.65, passChance));

  if (Math.random() < passChance) return null; // 아낀다

  if (hand.length === 0) {
    return aa.length > 0 ? aa[0] : null;
  }

  // 4. 일반적인 교전: 상대 평균 스피드 기반으로 효율적인 카드 선택
  let avgOppSpeed = oppHand.reduce((acc, c) => acc + effectiveSpeed(c), 0) / (oppHand.length || 1);
  if (isNaN(avgOppSpeed)) avgOppSpeed = 1;

  // 내 카드를 위력순 정렬
  const sortedHand = [...hand].sort((a,b) => effectiveSpeed(a) - effectiveSpeed(b));

  // 고레벨은 상대 예상 카드보다 근소 우위 카드를 우선 (효율 교환)
  if (aiLevel >= 3 && oppLikely) {
    const efficientWin = sortedHand.find(c => effectiveSpeed(c) > oppLikelySpeed);
    if (efficientWin) return efficientWin;
  }
  
  // 상대 평균 스피드의 80% 이상인 것 중 가장 약한(가성비) 카드를 낸다
  const efficientCard = sortedHand.find(c => effectiveSpeed(c) > avgOppSpeed * (aiLevel >= 4 ? 0.95 : 0.8));
  if (efficientCard) return efficientCard;

  // 마땅한게 없으면 그냥 제일 쎈 카드
  return sortedHand[sortedHand.length - 1];
}

/**
 * AI가 공중결전을 제안할지 결정
 * @param {Object} aiSession - AI 세션
 * @returns {boolean} true = 제안, false = 제안 안 함
 */
export function aiRequestBattle(aiSession) {
  const aiLevel = Math.max(1, Math.min(5, parseInt(aiSession?.aiLevel || 1, 10) || 1));
  const threshold = aiLevel >= 4 ? 0.4 : 0.55;
  const chance = aiLevel >= 4 ? 0.75 : aiLevel >= 3 ? 0.6 : 0.4;
  return aiSession.hand.length > (aiSession.cards?.length || 1) * threshold && Math.random() < chance;
}

/**
 * AI가 공중결전 제안을 수락할지 결정
 * @param {Object} aiSession - AI 세션
 * @param {Object} opponentSession - 상대 세션 정보
 * @returns {boolean} true = 수락, false = 거절
 */
export function aiRespondToBattle(aiSession, opponentSession) {
  // AI의 카드가 충분하면 수락 확률 높음
  const aiCardStrength = aiSession.hand.length / (aiSession.cards?.length || 1);
  const opponentCardStrength = opponentSession.hand.length / (opponentSession.cards?.length || 1);

  const aiLevel = Math.max(1, Math.min(5, parseInt(aiSession?.aiLevel || 1, 10) || 1));
  const bias = aiLevel >= 4 ? 0.15 : aiLevel >= 3 ? 0.05 : -0.05;
  return aiCardStrength + bias > opponentCardStrength ? Math.random() < 0.85 : Math.random() < 0.25;
}

/**
 * AI가 항복할지 결정
 * @param {Object} aiSession - AI 세션
 * @returns {boolean} true = 항복, false = 계속
 */
export function aiShouldSurrender(aiSession) {
  const aiLevel = Math.max(1, Math.min(5, parseInt(aiSession?.aiLevel || 1, 10) || 1));
  const remainingRatio = aiSession.hand.length / (aiSession.cards?.length || 1);
  const threshold = aiLevel >= 4 ? 0.05 : 0.1;
  const surrenderChance = aiLevel >= 4 ? 0.35 : 0.6;
  return remainingRatio < threshold && Math.random() < surrenderChance;
}

/**
 * ===== DB 저장 함수 =====
 */

/**
 * 공중전 세션을 DB에 저장
 * @param {string} countryId - 국가 ID
 * @param {Object} session - 공중전 세션 정보
 */
export async function saveAerialSession(countryId, session) {
  return await saveAerialCombatSession(countryId, session);
}

/**
 * 공중전 세션을 DB에서 로드
 * @param {string} countryId - 국가 ID
 */
export async function loadAerialSession(countryId) {
  return await getAerialCombatSession(countryId);
}

/**
 * 제공권 상태 업데이트
 * @param {string} countryId - 국가 ID
 * @param {'gained'|'full'|null} supremacyType - 제공권 타입
 */
export async function updateAirSupremacy(countryId, supremacyType) {
  try {
    const session = await loadAerialSession(countryId);
    if (!session) return null;

    session.airSupremacy = supremacyType;
    return await saveAerialSession(countryId, session);
  } catch (err) {
    console.error('Failed to update air supremacy:', err);
    return null;
  }
}

/**
 * 공중전 세션 초기화 (턴 시작 시)
 * @param {string} countryId - 국가 ID
 */
export async function resetAerialSupremacy(countryId) {
  try {
    const session = await loadAerialSession(countryId);
    if (!session) return null;

    session.airSupremacy = null;
    session.played = [];
    return await saveAerialSession(countryId, session);
  } catch (err) {
    console.error('Failed to reset aerial supremacy:', err);
    return null;
  }
}

/**
 * ===== 공중결전 모드 (데스메치) =====
 */

/**
 * ===== 필드 시스템 (Placeholder - 나중에 개발) =====
 */

/**
 * 지상 필드 초기화 (20x20)
 */
export function initializeLandField() {
  return {
    type: 'land',
    width: 20,
    height: 20,
    cells: Array(20).fill(null).map(() => Array(20).fill({ terrain: 'grass', units: [] })),
    description: '지상 필드 (20x20 칸) - 육군의 무대'
  };
}

/**
 * 해양 필드 초기화 (30x30)
 */
export function initializeSeaField() {
  return {
    type: 'sea',
    width: 30,
    height: 30,
    cells: Array(30).fill(null).map(() => Array(30).fill({ terrain: 'water', units: [] })),
    description: '해양 필드 (30x30 칸) - 해군의 무대'
  };
}

/**
 * 공역 필드 초기화 (20x20)
 */
export function initializeAirspaceField() {
  return {
    type: 'airspace',
    width: 20,
    height: 20,
    cells: Array(20).fill(null).map(() => Array(20).fill({ terrain: 'sky', units: [] })),
    description: '공역 필드 (20x20 칸) - 공중전 전용 무대'
  };
}

/**
 * ===== 전술 스킬 (Placeholder - 나중에 개발) =====
 */

/**
 * 핵 투발 (완전 제공권 시)
 * @param {Object} targetCountry - 대상 국가
 * @param {number} damage - 피해량 (원자폭탄 공격력)
 */
export function tacticalNuclearStrike(targetCountry, damage) {
  const dmg = Math.max(1, parseInt(damage || 1, 10));
  return {
    type: 'nuke_missile_like_strike',
    target: targetCountry,
    damage: dmg,
    radius: 2,
    status: 'ready',
    description: `핵미사일과 유사한 효과로 반경 타격을 수행합니다. (기본 반경 2, 위력 ${dmg})`
  };
}

/**
 * 보급 체계 폭격 (완전 제공권 시)
 * @param {Object} targetCountry - 대상 국가
 * @param {number} supplyReduction - 보급 한계 감소량
 */
export function tacticalSupplyRaid(targetCountry, supplyReduction) {
  const reduction = Math.max(1, parseInt(supplyReduction || 1, 10));
  return {
    type: 'supply_raid',
    target: targetCountry,
    supplyReduction: reduction,
    status: 'ready',
    description: `투입한 폭격기 공격력(${reduction})만큼 상대 보급 한계를 감소시킵니다.`
  };
}

/**
 * 상대방에게 공중결전(데스매치) 제안
 * @param {Object} battleSession - 전체 세션
 * @param {string} requesterId - 제안하는 국가 ID
 * @returns {Object} 업데이트된 세션
 */
export function requestMajorAerialBattle(battleSession, requesterId) {
  const isAttacker = battleSession.attackerId === requesterId;
  battleSession.majorBattleRequest = isAttacker ? 'requested_by_attacker' : 'requested_by_defender';
  battleSession.history.push({
    round: battleSession.round,
    reason: 'major_battle_requested',
    requesterId,
    timestamp: new Date().toISOString()
  });
  return battleSession;
}

/**
 * 공중결전 동의
 * 이제부터 양측 모든 카드가 소진되거나 항복으로 종료될 때까지 전투가 이어집니다.
 * @param {Object} battleSession - 전체 세션
 * @returns {Object} 업데이트된 세션
 */
export function acceptMajorAerialBattle(battleSession) {
  battleSession.majorBattleRequest = 'accepted';
  battleSession.isMajorBattle = true;
  battleSession.history.push({
    round: battleSession.round,
    reason: 'major_battle_accepted',
    timestamp: new Date().toISOString()
  });
  return battleSession;
}

/**
 * 공중결전 거절 (상대에게 완전 제공권 부여 및 패배 처리)
 * @param {Object} battleSession - 전체 세션
 * @param {string} declinerId - 거절하는 국가 ID
 * @returns {Object} 업데이트된 세션
 */
export function declineMajorAerialBattle(battleSession, declinerId) {
  const isAttacker = battleSession.attackerId === declinerId;
  battleSession.majorBattleRequest = 'declined';
  battleSession.status = 'finished';
  battleSession.winner = isAttacker ? 'defender' : 'attacker';
  
  if (isAttacker) {
    battleSession.attackerState.status = 'surrendered';
  } else {
    battleSession.defenderState.status = 'surrendered';
  }

  battleSession.history.push({
    round: battleSession.round,
    reason: 'major_battle_declined',
    declinerId,
    timestamp: new Date().toISOString()
  });
  return battleSession;
}

/**
 * 보급 한계 초과 시 카드 능력치 조정
 * @param {Object} card - 카드
 * @param {number} adjustFactor - 능력치 계수 (초과 시 0.5, 정상 시 1.0)
 * @returns {Object} 능력치가 조정된 카드
 */
function applySupplyPenalty(card, adjustFactor) {
  if (adjustFactor === 1.0) return card;
  
  return {
    ...card,
    speed: Math.max(1, Math.floor(card.speed * adjustFactor)),
    adjustedBySupply: true
  };
}

/**
 * 수동 배틀 라운드 진행
 * 양측이 카드를 모두 선택(또는 패스)했을 때 호출되어 1라운드를 진행합니다.
 */
export function processBattleRound(battleSession, attackerUnits = [], defenderUnits = []) {
  const atkChoice = battleSession.attackerChoice;
  const defChoice = battleSession.defenderChoice;
  
  if (!atkChoice || !defChoice) return battleSession; // 아직 준비 안 됨

  const atkSess = battleSession.attackerState;
  const defSess = battleSession.defenderState;

  // 보급 한계 초과 여부 계산
  const atkSupplyStatus = calculateSupplyUsage({ supplyLimit: atkSess.supplyLimit }, atkSess.hand, attackerUnits);
  const defSupplyStatus = calculateSupplyUsage({ supplyLimit: defSess.supplyLimit }, defSess.hand, defenderUnits);

  // 카드 가져오기
  const getCardFromChoice = (sess, choice) => {
    if (choice.type === 'pass') return null;
    if (choice.type === 'aa') {
      const idx = sess.antiAircraft.findIndex(c => c.cardId === choice.cardId);
      return idx >= 0 ? sess.antiAircraft[idx] : null;
    }
    const idx = sess.hand.findIndex(c => c.cardId === choice.cardId);
    return idx >= 0 ? sess.hand[idx] : null;
  };

  const atkCardRaw = getCardFromChoice(atkSess, atkChoice);
  const defCardRaw = getCardFromChoice(defSess, defChoice);

  const atkCard = atkCardRaw ? applySupplyPenalty(atkCardRaw, atkSupplyStatus.adjustedStats) : null;
  const defCard = defCardRaw ? applySupplyPenalty(defCardRaw, defSupplyStatus.adjustedStats) : null;

  // 전투 판정
  const result = resolveAerialRound(atkCard, defCard);

  // 결과에 따라 카드 소모 또는 재배치
  const applyLoss = (sess, choice, lost, isAttacker) => {
    if (choice.type === 'pass') return;
    
    if (choice.type === 'aa') {
      // 대공포는 사용 즉시 소모되거나, 졌을 때 소모됨 (resolveAerialRound에서 무조건 소모로 판정)
      const idx = sess.antiAircraft.findIndex(c => c.cardId === choice.cardId);
      if (idx >= 0) sess.antiAircraft.splice(idx, 1);
      return;
    }

    const idx = sess.hand.findIndex(c => c.cardId === choice.cardId);
    if (idx >= 0) {
      const card = sess.hand.splice(idx, 1)[0];
      if (lost) {
        sess.lost.push(card);
        // 실제 비행기 유닛도 파괴 처리
        const unitsArray = isAttacker ? battleSession.attackerUnits : battleSession.defenderUnits;
        if (unitsArray) {
          const unit = unitsArray.find(u => u.id === card.unitId);
          if (unit) {
            unit.hp = 0;
            unit.status = 'destroyed';
          }
        }
      } else {
        sess.hand.push(card); // 이겼거나 비겨서 살아남으면 다시 패로 돌아감
      }
    }
  };

  applyLoss(atkSess, atkChoice, result.attackerLost, true);
  applyLoss(defSess, defChoice, result.defenderLost, false);

  // 히스토리 기록
  battleSession.history.push({
    round: battleSession.round,
    ...result,
    atkCard: atkCardRaw,
    defCard: defCardRaw,
    atkRemaining: atkSess.hand.length,
    defRemaining: defSess.hand.length,
    timestamp: new Date().toISOString()
  });

  // 라운드 종료 처리
  battleSession.attackerChoice = null;
  battleSession.defenderChoice = null;
  battleSession.round += 1;

  // 비공중결전(일반 모드)의 경우 한 라운드만 진행하고 결과를 확정합니다.
  if (!battleSession.isMajorBattle) {
    battleSession.status = 'finished';
    if (result.winner === 'attack') {
      battleSession.winner = 'attacker';
    } else if (result.winner === 'defense') {
      battleSession.winner = 'defender';
    } else {
      battleSession.winner = 'draw';
    }
    return battleSession;
  }

  // 승패 판정
  // 제공권 전투는 양측 카드가 모두 소진되거나 항복/포기될 때까지 계속 진행한다.
  const atkEmpty = atkSess.hand.length === 0 && atkSess.antiAircraft.length === 0;
  const defEmpty = defSess.hand.length === 0 && defSess.antiAircraft.length === 0;

  if (atkEmpty || defEmpty) {
    battleSession.status = 'finished';
    if (atkEmpty && defEmpty) {
      battleSession.winner = 'draw';
    } else if (atkEmpty) {
      battleSession.winner = 'defender';
    } else if (defEmpty) {
      battleSession.winner = 'attacker';
    }
  }

  return battleSession;
}

/**
 * 진행 중인 전투에 증원 병력(새 카드) 투입
 */
export function addReinforcements(battleSession, isAttacker, newAircraftUnits) {
  const sess = isAttacker ? battleSession.attackerState : battleSession.defenderState;
  
  const result = generateAerialCards(
    newAircraftUnits, 
    sess.cumulativeUnitsDeployed, 
    sess.cumulativeAcesGenerated
  );

  // 패에 카드 추가
  sess.cards.push(...result.cards);
  sess.hand.push(...result.cards); // 증원된 카드는 바로 사용할 수 있게 손으로 들어감
  
  sess.cumulativeUnitsDeployed = result.cumulativeUnitsDeployed;
  sess.cumulativeAcesGenerated = result.cumulativeAcesGenerated;

  // 대공포는? 증원 시 상대방의 "새로 생성된 에이스 수"만큼 내가 대공포를 받아야 함.
  // 이 부분 처리는 여기서는 일단 보류하거나, 호출하는 쪽에서 상대방 세션에 대공포를 추가해야 함.
  // 간단히:
  const opponentSess = isAttacker ? battleSession.defenderState : battleSession.attackerState;
  if (result.newAces > 0) {
    const aaCards = generateAntiAircraftCards(result.newAces);
    opponentSess.antiAircraft.push(...aaCards);
  }

  return battleSession;
}

/**
 * 항복 처리
 * @param {Object} battleSession - 글로벌 배틀 세션
 * @param {string} surrenderingId - 항복하는 국가 ID
 * @returns {Object} 업데이트된 배틀 세션
 */
export function surrenderAerialBattle(battleSession, surrenderingId) {
  const isAttacker = battleSession.attackerId === surrenderingId;
  
  if (isAttacker) {
    battleSession.attackerState.status = 'surrendered';
  } else {
    battleSession.defenderState.status = 'surrendered';
  }
  
  battleSession.status = 'finished';
  battleSession.winner = isAttacker ? 'defender' : 'attacker';
  battleSession.history.push({
    round: battleSession.round,
    reason: 'surrender',
    surrenderingId,
    timestamp: new Date().toISOString()
  });

  return battleSession;
}

/**
 * 비동기 턴제: 플레이어의 카드 선택을 제출하고, 양측이 모두 선택했다면 라운드를 진행합니다.
 * @param {Object} battleSession - 전체 세션
 * @param {string} countryId - 선택하는 국가 ID
 * @param {Object} choice - { cardId, type }
 * @param {Array} attackerUnits - 전체 전투기 정보 (보급 계산용)
 * @param {Array} defenderUnits - 전체 전투기 정보 (보급 계산용)
 * @returns {Object} 업데이트된 세션
 */
export function submitCardChoice(battleSession, countryId, choice, attackerUnits = [], defenderUnits = []) {
  if (battleSession.status === 'finished') return battleSession;

  if (countryId === battleSession.attackerId) {
    battleSession.attackerChoice = choice;
  } else if (countryId === battleSession.defenderId) {
    battleSession.defenderChoice = choice;
  }

  const isAttackerAI = battleSession.attackerId === 'AI' || battleSession.attackerState?.isAI;
  const isDefenderAI = battleSession.defenderId === 'AI' || battleSession.defenderState?.isAI;

  if (battleSession.attackerChoice && !battleSession.defenderChoice && isDefenderAI) {
    const aiCard = aiChooseCard(battleSession.defenderState, battleSession.attackerState);
    battleSession.defenderChoice = aiCard
      ? { cardId: aiCard.cardId, type: aiCard.canBlock ? 'aa' : (aiCard.isAce ? 'ace' : 'normal') }
      : { cardId: null, type: 'pass' };
  }

  if (battleSession.defenderChoice && !battleSession.attackerChoice && isAttackerAI) {
    const aiCard = aiChooseCard(battleSession.attackerState, battleSession.defenderState);
    battleSession.attackerChoice = aiCard
      ? { cardId: aiCard.cardId, type: aiCard.canBlock ? 'aa' : (aiCard.isAce ? 'ace' : 'normal') }
      : { cardId: null, type: 'pass' };
  }

  // 양측 모두 선택 완료 시 자동 라운드 진행
  if (battleSession.attackerChoice && battleSession.defenderChoice) {
    return processBattleRound(battleSession, attackerUnits, defenderUnits);
  }

  return battleSession;
}

