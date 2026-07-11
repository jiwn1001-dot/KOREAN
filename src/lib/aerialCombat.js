import { supabase } from './supabase';
import { saveAerialCombatSession, getAerialCombatSession } from './store';

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

    addedQuantity += quantity;

    for (let i = 0; i < quantity; i++) {
      cards.push({
        unitId,
        unitName,
        cardId: `${unitId}_${Date.now()}_${i}`, // Ensure unique ID for reinforcements
        speed,
        unitImage,
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

export function processBattleRound(session) {
  const atkChoice = session.attackerChoice;
  const defChoice = session.defenderChoice;
  
  let atkCard = null;
  if (atkChoice && atkChoice.cardId) {
    atkCard = atkChoice.type === 'aa' ? session.attackerState.antiAircraft.find(c => c.cardId === atkChoice.cardId) 
                                      : session.attackerState.hand.find(c => c.cardId === atkChoice.cardId);
  }
  
  let defCard = null;
  if (defChoice && defChoice.cardId) {
    defCard = defChoice.type === 'aa' ? session.defenderState.antiAircraft.find(c => c.cardId === defChoice.cardId)
                                      : session.defenderState.hand.find(c => c.cardId === defChoice.cardId);
  }

  const roundResult = resolveAerialRound(atkCard, defCard);
  
  // 패배한 측 (혹은 무승부시 양측) 카드 소모
  if (roundResult.attackerLost && atkCard) {
    if (atkChoice.type === 'aa') session.attackerState.antiAircraft = session.attackerState.antiAircraft.filter(c => c.cardId !== atkCard.cardId);
    else session.attackerState.hand = session.attackerState.hand.filter(c => c.cardId !== atkCard.cardId);
  }
  
  if (roundResult.defenderLost && defCard) {
    if (defChoice.type === 'aa') session.defenderState.antiAircraft = session.defenderState.antiAircraft.filter(c => c.cardId !== defCard.cardId);
    else session.defenderState.hand = session.defenderState.hand.filter(c => c.cardId !== defCard.cardId);
  }

  session.history.push(roundResult);
  session.round += 1;
  
  // 손패가 비었으면 전투 종료
  if (session.attackerState.hand.length === 0 || session.defenderState.hand.length === 0) {
    session.status = 'finished';
  }
  
  return session;
}

export function surrenderAerialBattle(session, surrenderingId) {
  if (session.attackerId === surrenderingId || !session.defenderId) {
    session.attackerState.status = 'surrendered';
  } else {
    session.defenderState.status = 'surrendered';
  }
  session.status = 'finished';
  return session;
}

/**
 * ===== 제공권 관리 =====
 */

/**
 * 수동 PvP 공중결전 세션 생성 (글로벌 배틀 상태)
 * @returns {Object} 공중결전 세션 정보
 */
export function createAerialBattle(attackerId, defenderId, attackerUnits, defenderUnits, atkSupplyLimit, defSupplyLimit) {
  const atkResult = generateAerialCards(attackerUnits, 0, 0);
  const defResult = generateAerialCards(defenderUnits, 0, 0);
  
  // 대공포는 서로의 에이스 개수만큼 받음
  const atkAA = generateAntiAircraftCards(defResult.newAces);
  const defAA = generateAntiAircraftCards(atkResult.newAces);

  return {
    attackerId,
    defenderId,
    round: 1,
    status: 'active', // 'active', 'finished'
    
    // 공격측 상태
    attackerState: {
      cards: atkResult.cards,
      hand: atkResult.cards.filter(c => c.status === 'hand'),
      antiAircraft: atkAA,
      lost: [],
      cumulativeUnitsDeployed: atkResult.cumulativeUnitsDeployed,
      cumulativeAcesGenerated: atkResult.cumulativeAcesGenerated,
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
  const hand = aiSession.hand || [];
  const aa = aiSession.antiAircraft || [];
  const availableCards = [...hand, ...aa];
  
  if (availableCards.length === 0) return null;

  const aiAces = hand.filter(c => c.isAce);
  const aiNormals = hand.filter(c => !c.isAce);
  const oppHand = opponentSession.hand || [];
  const oppAces = oppHand.filter(c => c.isAce).length;
  const oppAA = opponentSession.antiAircraft?.length || 0;
  
  // 1. 상대방이 에이스가 많고 내가 대공포(AA)가 있다면, 일정 확률로 대공포 투척 (에이스 저격)
  if (aa.length > 0 && oppAces > 0 && oppHand.length > 0) {
     const aaChance = (oppAces / oppHand.length) * 0.8; // 상대 에이스 비율에 비례
     if (Math.random() < aaChance) {
       return aa[0];
     }
  }
  
  // 2. 상대방이 대공포가 많다면 에이스를 내는 것을 꺼림 (일반 카드를 미끼로 던져 대공포 소진 유도)
  if (oppAA > 0 && aiNormals.length > 0) {
     if (Math.random() < 0.7) { 
        // 가장 속도가 낮은 미끼 투척
        const sortedNormals = [...aiNormals].sort((a,b) => a.speed - b.speed);
        return sortedNormals[0];
     }
  }

  // 3. 카드를 아낄 확률 계산
  const cardRatio = hand.length / (aiSession.cards?.length || 1);
  let passChance = 0.5 - (cardRatio * 0.4); // 카드가 적으면 최대 50% 패스 확률
  if (oppHand.length === 0 && oppAA === 0) passChance = 0; // 상대 카드가 없으면 무조건 공격

  if (Math.random() < passChance) return null; // 아낀다

  if (hand.length === 0) {
    return aa.length > 0 ? aa[0] : null;
  }

  // 4. 일반적인 교전: 상대 평균 스피드 기반으로 효율적인 카드 선택
  let avgOppSpeed = oppHand.reduce((acc, c) => acc + (c.isAce ? c.speed * 5 : c.speed), 0) / (oppHand.length || 1);
  if (isNaN(avgOppSpeed)) avgOppSpeed = 1;

  // 내 카드를 위력순 정렬
  const sortedHand = [...hand].sort((a,b) => (a.isAce ? a.speed * 5 : a.speed) - (b.isAce ? b.speed * 5 : b.speed));
  
  // 상대 평균 스피드의 80% 이상인 것 중 가장 약한(가성비) 카드를 낸다
  const efficientCard = sortedHand.find(c => (c.isAce ? c.speed * 5 : c.speed) > avgOppSpeed * 0.8);
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
  // AI는 카드가 충분하면 50% 확률로 제안
  return aiSession.hand.length > (aiSession.cards?.length || 1) * 0.5 && Math.random() < 0.5;
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

  // 상대보다 카드가 많으면 수락, 적으면 거절 (자신감 기반)
  return aiCardStrength > opponentCardStrength ? Math.random() < 0.8 : Math.random() < 0.3;
}

/**
 * AI가 항복할지 결정
 * @param {Object} aiSession - AI 세션
 * @returns {boolean} true = 항복, false = 계속
 */
export function aiShouldSurrender(aiSession) {
  const remainingRatio = aiSession.hand.length / (aiSession.cards?.length || 1);
  // 카드가 10% 이하 남으면 항복 고려
  return remainingRatio < 0.1 && Math.random() < 0.6;
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
  return {
    type: 'nuclear_strike',
    target: targetCountry,
    damage,
    status: 'pending',
    description: `${damage}의 피해로 핵 투발을 수행합니다.`
  };
}

/**
 * 보급 체계 폭격 (완전 제공권 시)
 * @param {Object} targetCountry - 대상 국가
 * @param {number} supplyReduction - 보급 한계 감소량
 */
export function tacticalSupplyRaid(targetCountry, supplyReduction) {
  return {
    type: 'supply_raid',
    target: targetCountry,
    supplyReduction,
    status: 'pending',
    description: `보급 체계를 ${supplyReduction}만큼 폭격하여 상대의 보급 한계를 줄입니다.`
  };
}

/**
 * 상대방이 수락/거절할 때까지 대기
 * @param {string} requesterId - 요청하는 국가 ID
 * @returns {Object} {status: 'pending', requesterId, timestamp}
 */
export function requestMajorAerialBattle(requesterId) {
  return {
    status: 'pending',
    requesterId,
    timestamp: new Date().toISOString()
  };
}

/**
 * 공중결전 동의
 * 이제부터 양측 모든 카드가 소진될 때까지 항복 불가
 * @param {Object} defenderSession - 방어국 세션
 * @returns {Object} {accepted: true, timestamp}
 */
export function acceptMajorAerialBattle(defenderSession) {
  defenderSession.battleRequest = {
    status: 'accepted',
    timestamp: new Date().toISOString()
  };
  return {
    accepted: true,
    message: '공중결전이 수락되었습니다. 양측의 모든 카드가 소진될 때까지 전투가 계속됩니다. (항복 불가)'
  };
}

/**
 * 공중결전 거절 (상대에게 완전 제공권 부여)
 * @param {Object} defenderSession - 거절하는 국가 세션
 * @param {string} attackerId - 공격국 ID
 * @returns {Object} {declined: true, opponentGetsFullSupremacy: true}
 */
export function declineMajorAerialBattle(defenderSession, attackerId) {
  defenderSession.battleRequest = {
    status: 'declined',
    timestamp: new Date().toISOString()
  };
  return {
    declined: true,
    message: '공중결전을 거절했습니다. 상대국이 완전 제공권을 얻습니다.',
    opponentGetsFullSupremacy: true,
    opponentId: attackerId
  };
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
  const atkSupplyStatus = calculateSupplyUsage(atkSess, atkSess.cards, attackerUnits);
  const defSupplyStatus = calculateSupplyUsage(defSess, defSess.cards, defenderUnits);

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
  const applyLoss = (sess, choice, lost) => {
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
      } else {
        sess.hand.push(card); // 이겼거나 비겨서 살아남으면 다시 패로 돌아감
      }
    }
  };

  applyLoss(atkSess, atkChoice, result.attackerLost);
  applyLoss(defSess, defChoice, result.defenderLost);

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

  // 승패 판정 (전멸 - 패와 대공포 모두 소진 시)
  const atkEmpty = atkSess.hand.length === 0 && atkSess.antiAircraft.length === 0;
  const defEmpty = defSess.hand.length === 0 && defSess.antiAircraft.length === 0;

  if (atkEmpty || defEmpty) {
    battleSession.status = 'finished';
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
  battleSession.history.push({
    round: battleSession.round,
    reason: 'surrender',
    surrenderingId,
    timestamp: new Date().toISOString()
  });

  return battleSession;
}
