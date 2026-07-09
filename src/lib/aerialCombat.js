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
export function generateAerialCards(aircraftUnits) {
  const cards = [];
  let totalQuantity = 0;

  // 1. 모든 카드 생성 (아직 에이스 미배정)
  aircraftUnits.forEach(unit => {
    const unitId = unit.id;
    const speed = unit.speed || 1;
    const quantity = unit.quantity || 0;
    const unitImage = unit.image || null;

    totalQuantity += quantity;

    for (let i = 0; i < quantity; i++) {
      cards.push({
        unitId,
        cardId: `${unitId}_${i}`,
        speed,
        unitImage,
        isAce: false,
        canBlock: false,
        status: 'hand'
      });
    }
  });

  // 2. 전체 수량 기준으로 10장당 1장 에이스 산정
  const aceCount = Math.floor(totalQuantity / 10);

  // 3. 속도가 빠른 순으로 정렬하여 에이스 배정
  cards.sort((a, b) => b.speed - a.speed);

  for (let i = 0; i < aceCount; i++) {
    if (cards[i]) {
      cards[i].isAce = true;
    }
  }

  // 패를 섞어줌 (선택사항이나, 가장 빠른게 항상 먼저 나오면 안될 수 있으므로 무작위 섞기)
  cards.sort(() => Math.random() - 0.5);

  return { cards, aceCount };
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

  // 대공포 카드 처리: 무조건 상대 손실, 무승부 처리
  if (defenseCard.canBlock) {
    return {
      winner: 'draw',
      diceResult: null,
      reason: 'antiAircraft_used',
      attackerLost: true,
      defenderLost: true, // 대공포도 소모됨
      description: '대공포 카드가 사용되어 무승부처리되었습니다. 양측 모두 카드 손실.'
    };
  }

  if (attackCard.canBlock) {
    // 공격측이 대공포를 냈으면 불가능 (논리적으로 방어측만 낼 수 있음)
    return {
      winner: 'defense',
      reason: 'invalid_attack',
      description: '공격측에서 대공포를 낼 수 없습니다.'
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
 * 공중전 세션 생성 (게임 시작 시)
 * @param {string} countryId - 국가 ID
 * @param {Array} aircraftUnits - 전투기 유닛 배열
 * @param {number} supplyLimit - 보급 한계
 * @returns {Object} 공중전 세션 정보
 */
export function createAerialCombatSession(countryId, aircraftUnits, supplyLimit) {
  const { cards, aceCount } = generateAerialCards(aircraftUnits);
  const aaCards = generateAntiAircraftCards(aceCount);

  return {
    countryId,
    currentTurn: 1,
    aceCount,
    antiAircraftCountFixed: aceCount, // ⭐ 초기화 시점에 고정되며 변하지 않음
    cards, // 모든 카드
    hand: cards.filter(c => c.status === 'hand'), // 패
    played: [], // 사용된 카드
    lost: [], // 손실된 카드
    antiAircraft: aaCards,
    airSupremacy: null, // null | 'gained' | 'full'
    supplyLimit,
    totalSupplyUsed: 0,
    roundHistory: [],
    battleRequest: null, // {requesterId, status: 'pending'|'accepted'|'declined', timestamp}
    status: 'active' // 'active', 'surrendered', 'defeated'
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

/**
 * AI가 카드를 선택 (낸다 또는 아낀다)
 * 전략: 손실 상황, 에이스 카드 보존 등을 고려
 * @param {Object} aiSession - AI 세션
 * @param {Object} opponentSession - 상대 세션 (정보 제공)
 * @returns {Object|null} 선택된 카드 (null = 아낀다)
 */
export function aiChooseCard(aiSession, opponentSession) {
  const hand = aiSession.hand || [];
  if (hand.length === 0) return null;

  const cardRatio = hand.length / (aiSession.cards?.length || 1);
  const opponentLostRatio = (opponentSession.lost?.length || 0) / (opponentSession.cards?.length || 1);
  
  // 카드가 적을수록 아낄 확률 증가 (cardRatio가 낮을수록 passChance 높음)
  let passChance = 1.0 - cardRatio;
  
  // 상대방이 손실이 크면 더 적극적으로 싸우려 함
  passChance -= opponentLostRatio * 0.5;

  // 확률을 10% ~ 90% 사이로 제한
  passChance = Math.max(0.1, Math.min(0.9, passChance));

  // 확률로 결정
  if (Math.random() < passChance) {
    return null; // 아낀다
  }

  // 카드를 낼 것으로 결정한 경우
  let selectedIndex = 0;

  // 전략: 에이스는 아끼고, 일반 카드를 먼저 사용
  const normalCards = hand.map((c, i) => ({ card: c, index: i })).filter(x => !x.card.isAce);

  if (normalCards.length > 0) {
    selectedIndex = normalCards[0].index;
  }

  return hand[selectedIndex];
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
 * 공중결전 라운드 (카드 1장씩 소모, 항복 불가)
 * @param {Object} atkSession - 공격국 세션
 * @param {Object} defSession - 방어국 세션
 * @param {number} atkAdjustFactor - 공격국 능력치 계수 (보급 한계 초과 시 0.5)
 * @param {number} defAdjustFactor - 방어국 능력치 계수 (보급 한계 초과 시 0.5)
 * @returns {Object} 이번 라운드 결과
 */
export function deathMatchRound(atkSession, defSession, atkAdjustFactor = 1.0, defAdjustFactor = 1.0) {
  if (atkSession.hand.length === 0 || defSession.hand.length === 0) {
    return { winner: null, reason: 'one_side_eliminated' };
  }

  const atkCard = applySupplyPenalty(atkSession.hand[0], atkAdjustFactor);
  const defCard = applySupplyPenalty(defSession.hand[0], defAdjustFactor);

  const result = resolveAerialRound(atkCard, defCard);

  // 카드 상태 업데이트 (승리한 카드는 패의 맨 뒤로 이동하여 계속 싸움)
  if (result.attackerLost) {
    atkSession.hand.shift();
    atkSession.lost.push(atkCard);
  } else {
    // 공격 승리: 카드를 다시 패의 맨 뒤로
    atkSession.hand.shift();
    atkSession.hand.push(atkCard);
  }

  if (result.defenderLost) {
    defSession.hand.shift();
    defSession.lost.push(defCard);
  } else {
    // 방어 승리: 카드를 다시 패의 맨 뒤로
    defSession.hand.shift();
    defSession.hand.push(defCard);
  }

  return result;
}

/**
 * 공중결전 시뮬레이션 (모든 카드 전부 소모 또는 항복까지)
 * 규칙: 이미 시작되면 무조건 계속 진행 (항복 불가)
 * 손실된 카드 = 실제 유닛 손실 처리됨
 * 
 * @param {Object} attackerSession - 공격국 세션 (깊은 복사 필요)
 * @param {Object} defenderSession - 방어국 세션 (깊은 복사 필요)
 * @param {Array} attackerUnits - 공격국 전체 전투기 유닛
 * @param {Array} defenderUnits - 방어국 전체 전투기 유닛
 * @returns {Object} {
 *   winner: 'attacker'|'defender',
 *   totalRounds: number,
 *   reason: 'all_cards_exhausted'|'complete_elimination',
 *   attackerLostCount: number,
 *   defenderLostCount: number,
 *   supplyPenaltyApplied: {attacker: boolean, defender: boolean}
 * }
 */
export function resolveMajorAerialBattle(
  attackerSession,
  defenderSession,
  attackerUnits = [],
  defenderUnits = [],
  attackerIsAi = false,
  defenderIsAi = false
) {
  // 깊은 복사 (원본 손상 방지)
  const atkSess = JSON.parse(JSON.stringify(attackerSession));
  const defSess = JSON.parse(JSON.stringify(defenderSession));

  let round = 1;
  const maxRounds = 10000; // 무한 루프 방지
  const history = [];

  // 보급 한계 초과 여부 계산
  const atkSupplyStatus = calculateSupplyUsage(atkSess, atkSess.cards, attackerUnits);
  const defSupplyStatus = calculateSupplyUsage(defSess, defSess.cards, defenderUnits);

  while (
    round <= maxRounds &&
    atkSess.hand.length > 0 &&
    defSess.hand.length > 0 &&
    atkSess.status !== 'surrendered' &&
    defSess.status !== 'surrendered'
  ) {
    // AI 항복 체크
    if (attackerIsAi && aiShouldSurrender(atkSess)) {
      history.push({ round, reason: 'attacker_surrendered', description: '공격측 AI가 항복했습니다.' });
      atkSess.status = 'surrendered';
      break;
    }
    if (defenderIsAi && aiShouldSurrender(defSess)) {
      history.push({ round, reason: 'defender_surrendered', description: '방어측 AI가 항복했습니다.' });
      defSess.status = 'surrendered';
      break;
    }

    // 이번 라운드 전투
    const roundResult = deathMatchRound(
      atkSess,
      defSess,
      atkSupplyStatus.adjustedStats,
      defSupplyStatus.adjustedStats
    );

    history.push({
      round,
      ...roundResult,
      atkRemaining: atkSess.hand.length,
      defRemaining: defSess.hand.length
    });

    round++;
  }

  // 승자 결정
  const atkWon = defSess.status === 'surrendered' || (atkSess.status !== 'surrendered' && atkSess.hand.length > 0);
  const defWon = atkSess.status === 'surrendered' || (defSess.status !== 'surrendered' && defSess.hand.length > 0);
  const winner = (atkWon && !defWon) ? 'attacker' : (defWon && !atkWon) ? 'defender' : 'draw';

  let finalReason = 'all_cards_exhausted';
  if (atkSess.status === 'surrendered') finalReason = 'attacker_surrendered';
  else if (defSess.status === 'surrendered') finalReason = 'defender_surrendered';
  else if (winner === 'draw') finalReason = 'simultaneous_elimination';

  return {
    winner,
    totalRounds: round - 1,
    reason: finalReason,
    attackerLostCount: atkSess.lost.length,
    defenderLostCount: defSess.lost.length,
    attackerRemaining: atkSess.hand.length,
    defenderRemaining: defSess.hand.length,
    supplyPenaltyApplied: {
      attacker: atkSupplyStatus.exceedsLimit,
      defender: defSupplyStatus.exceedsLimit
    },
    battleHistory: history
  };
}

/**
 * 항복 처리
 * 공중결전 중에도 항복 가능 (항복하면 상대가 제공권 획득)
 * @param {Object} surrenderingSession - 항복하는 국가 세션
 * @returns {Object} {surrendered: true, opponentGetsSupremacy: ...}
 */
export function surrenderAerialBattle(surrenderingSession) {
  return {
    surrendered: true,
    timestamp: new Date().toISOString(),
    
    // 항복 시 상대가 얻는 제공권 타입
    opponentAirSupremacy: surrenderingSession.battleRequest?.status === 'accepted'
      ? 'gained'  // 공중결전 중 항복 → 라운드 승리 제공권
      : 'gained', // 일반 라운드 중 항복 → 라운드 승리 제공권
    
    remainingCards: surrenderingSession.hand.length,
    lostCards: surrenderingSession.lost.length
  };
}
