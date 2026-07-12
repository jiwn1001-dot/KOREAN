/**
 * 지상전(육전) 동시 턴 처리 엔진 및 맵 생성 로직
 * - 20x20 그리드 맵
 * - 동시 턴 처리 (스피드 기반)
 * - 험지, 산 등 타일 기믹
 */

export const TILE_TYPES = {
  NORMAL: '일반',
  ROUGH: '험지',
  MOUNTAIN: '산',
  WATER: '물',
  FORTRESS: '요새',
  ULTIMATE_FORTRESS: '궁극의 요새',
  PEAK: '꼭대기' // 이동 불가
};

/**
 * 20x20 보드 초기화
 */
export function createLandBoard() {
  const board = [];
  for (let y = 0; y < 20; y++) {
    const row = [];
    for (let x = 0; x < 20; x++) {
      row.push({
        x,
        y,
        type: TILE_TYPES.NORMAL, // 기본 타일
        poisoned: false, // 독가스 여부
        poisonDamage: 0,
        poisonTurns: 0,
      });
    }
    board.push(row);
  }
  return board;
}

/**
 * 유닛의 보급 초과 페널티 계산 (50% 디버프)
 * @param {Array} deployedUnits 현재 맵에 투입된 유닛 리스트
 * @param {number} supplyLimit 세션의 보급 한계
 */
export function getSupplyPenalty(deployedUnits, supplyLimit) {
  let totalConsumption = 0;
  deployedUnits.forEach(u => {
    totalConsumption += u.supplyConsumption || 1;
  });

  // 보급 한계 초과 시 50% 패널티 (스탯 절반 적용)
  return totalConsumption > supplyLimit ? 0.5 : 1.0;
}

/**
 * 데미지 계산 공식
 * @param {number} attack 공격력
 * @param {number} defense 방어력
 * @param {number} penetration 관통력
 */
export function calculateDamage(attack, defense, penetration = 0) {
  const effectiveDefense = Math.max(0, defense - penetration);
  return Math.max(0, attack - effectiveDefense);
}

/**
 * 유닛의 타일 효과 적용 (방어 시/공격 시/이동 시)
 */
export function applyTileEffects(unit, tile, actionType) {
  // unit.subCategory: '보병', '기계화', '해병대', '산악부대', '공수부대', '특전사', '포병' 등
  const sub = unit.subCategory || '보병';

  let effects = {
    attackMultiplier: 1.0,
    defenseDamageMultiplier: 1.0, // 피격 시 데미지 배율
    movementPenalty: 0, // 몇 턴 정지할지
    hpDrainPct: 0 // 최대체력 대비 턴당 감소
  };

  if (!tile || tile.type === TILE_TYPES.NORMAL || tile.type === TILE_TYPES.PEAK) return effects;

  if (tile.type === TILE_TYPES.ROUGH) {
    if (['해병대', '산악부대', '공수부대', '특전사'].includes(sub)) {
      effects.defenseDamageMultiplier = 0.5;
    } else {
      effects.attackMultiplier = 0.75;
      effects.hpDrainPct = 1 / 40;
      effects.movementPenalty = 1;
      effects.defenseDamageMultiplier = 0.5;
    }
  } else if (tile.type === TILE_TYPES.MOUNTAIN) {
    if (sub === '산악부대') {
      effects.defenseDamageMultiplier = 0.5;
    } else if (['해병대', '공수부대', '특전사'].includes(sub)) {
      effects.hpDrainPct = 1 / 40;
      effects.movementPenalty = 1;
      effects.defenseDamageMultiplier = 0.5;
    } else {
      effects.hpDrainPct = 1 / 20;
      effects.movementPenalty = 2;
      effects.defenseDamageMultiplier = 0.5;
    }
  } else if (tile.type === TILE_TYPES.WATER) {
    if (sub === '해병대') {
      // 면역
    } else if (['산악부대', '특전사', '공수부대'].includes(sub)) {
      effects.defenseDamageMultiplier = 1.5;
      effects.movementPenalty = 1;
    } else {
      effects.defenseDamageMultiplier = 2.0;
      effects.movementPenalty = 2;
    }
  } else if (tile.type === TILE_TYPES.FORTRESS) {
    effects.defenseDamageMultiplier = 0.8; 
  } else if (tile.type === TILE_TYPES.ULTIMATE_FORTRESS) {
    effects.defenseDamageMultiplier = 0.1; 
  }

  return effects;
}

/**
 * 턴 정지(속박) 패널티 부여 함수
 */
export function applyTerrainMovementLock(unit, tile) {
  const effects = applyTileEffects(unit, tile);
  if (effects.movementPenalty > 0) {
    unit.movementLock = effects.movementPenalty;
  }
}

/**
 * 경로(Path)상 장애물이나 적을 만났을 때 실제 최종 도착지 반환 (Bresenham 알고리즘 기반)
 */
function calculateActualPath(unit, targetX, targetY, board, allUnits, isAirdrop = false) {
  if (isAirdrop) {
    return { x: targetX, y: targetY };
  }

  let currentX = unit.x;
  let currentY = unit.y;
  let lastValidX = unit.x;
  let lastValidY = unit.y;

  const maxSteps = unit.isHQ ? 1 : (unit.speed || 1);
  const isMechanized = unit.subCategory === '기계화' || unit.subCategory === '전차';
  
  let dx = Math.abs(targetX - currentX);
  let dy = Math.abs(targetY - currentY);
  let sx = (currentX < targetX) ? 1 : -1;
  let sy = (currentY < targetY) ? 1 : -1;
  let err = dx - dy;

  for (let step = 0; step < maxSteps; step++) {
    if (currentX === targetX && currentY === targetY) break;

    // 1칸 이동 계산
    if (isMechanized) {
      // 기계화: 십자 이동 (거리가 먼 축부터 먼저 이동)
      if (dx > dy) { currentX += sx; dx--; }
      else { currentY += sy; dy--; }
    } else {
      // 보병: 8방향 대각선 이동 허용 (Bresenham)
      let e2 = 2 * err;
      if (e2 > -dy) { err -= dy; currentX += sx; }
      if (e2 < dx) { err += dx; currentY += sy; }
    }

    // 이동한 칸이 보드 밖이면 직전 유효 좌표 반환
    if (currentY < 0 || currentY >= 20 || currentX < 0 || currentX >= 20) {
      return { x: lastValidX, y: lastValidY };
    }

    const tile = board[currentY][currentX];
    if (tile.type === TILE_TYPES.PEAK) {
      return { x: lastValidX, y: lastValidY };
    }

    // 유닛 충돌(아군/적군) 체크
    const occupant = allUnits.find(u => u.x === currentX && u.y === currentY && u.status === 'field');
    if (occupant) {
      if (occupant.owner === unit.owner) {
        // 아군은 뚫고 지나갈 수 없음 (직전 타일에서 멈춤)
        return { x: lastValidX, y: lastValidY };
      } else {
        // 적군을 만나면 해당 칸까지만 진입하여 교전(Melee) 유발
        return { x: currentX, y: currentY };
      }
    }

    const effects = applyTileEffects(unit, tile);
    if (effects.movementPenalty > 0) {
      // 험지, 산, 물 등 이동 페널티가 있는 타일에 진입하면 즉시 이동 중지
      return { x: currentX, y: currentY };
    }

    lastValidX = currentX;
    lastValidY = currentY;
  }

  return { x: lastValidX, y: lastValidY };
}

/**
 * AI 자동 배치 (배치 페이즈 종료 후 호출)
 * 주어진 units(유저의 수정사항 반영본) 중, 유저 소유가 아닌(또는 아직 배치되지 않은) AI 유닛들을 보급 한계 내에서 자동 배치합니다.
 */
export function deployAIUnits(units, initialSession, userCountryId) {
  let updatedUnits = [...units];
  
  // 모든 참전국 ID 추출
  const allCountries = [...new Set(updatedUnits.map(u => u.owner))];

  for (const countryId of allCountries) {
    if (countryId === userCountryId) continue; // 유저는 직접 배치함

    const isTeam1 = initialSession?.isTeamBattle ? initialSession.team1.includes(countryId) : (initialSession?.host === countryId);
    const supplyLimit = isTeam1 ? (initialSession?.supplyLimitTeam1 || 10) : (initialSession?.supplyLimitTeam2 || 10);
    const xRange = isTeam1 ? [0, 9] : [10, 19];
    
    const army = initialSession?.armies?.find(a => a.corpsIds.some(cid => updatedUnits.some(u => u.owner === countryId && u.corpsId === cid)));
    let armyAiLevel = 1;
    if (army && army.commanderId) {
      const general = initialSession?.generals?.find(g => g.id === army.commanderId);
      if (general && general.aiLevel) armyAiLevel = parseInt(general.aiLevel, 10);
    }

    const standbyUnits = updatedUnits.filter(u => u.owner === countryId && u.status === 'standby');
    let currentSupply = updatedUnits.filter(u => u.owner === countryId && (u.status === 'field' || (u.status === 'standby' && u.majorCategory === '공군'))).reduce((a, b) => a + (b.supplyConsumption || 0), 0);

    const hq = standbyUnits.find(u => u.isHQ);
    if (hq) {
      const targetX = isTeam1 ? (armyAiLevel >= 2 ? 2 : 0) : (armyAiLevel >= 2 ? 17 : 19);
      const targetY = 10;
      let placed = false;
      if (armyAiLevel >= 2) {
        const searchOrder = [10, 9, 11, 8, 12, 7, 13, 6, 14, 5, 15, 4, 16, 3, 17, 2, 18, 1, 19, 0];
        for (let delta of searchOrder) {
          const y = delta;
          if (!updatedUnits.some(u => u.x === targetX && u.y === y && u.status === 'field')) {
            hq.x = targetX;
            hq.y = y;
            hq.status = 'field';
            placed = true;
            break;
          }
        }
      }
      if (!placed) {
        for (let x = xRange[0]; x <= xRange[1] && !placed; x++) {
          for (let y = 0; y < 20 && !placed; y++) {
            if (!updatedUnits.some(u => u.x === x && u.y === y && u.status === 'field')) {
              hq.x = x;
              hq.y = y;
              hq.status = 'field';
              placed = true;
            }
          }
        }
      }
    }

    // 나머지 유닛들 보급 한계 내에서 배치 (공군은 제외!)
    const nonHqStandby = standbyUnits.filter(u => !u.isHQ && u.majorCategory !== '공군');
    const formationSpread = armyAiLevel >= 3 ? 0.8 : 0.4;
    const placementOrder = nonHqStandby.sort((a, b) => {
      if (armyAiLevel >= 3) {
        return (b.attack || 0) - (a.attack || 0);
      }
      return Math.random() - 0.5;
    });

    for (const unit of placementOrder) {
      if (currentSupply + (unit.supplyConsumption || 1) <= supplyLimit) {
        let placed = false;
        const preferredXs = armyAiLevel >= 2 ? (isTeam1 ? [2, 3, 4, 1, 5, 0, 6, 7, 8, 9] : [17, 16, 15, 18, 14, 19, 13, 12, 11, 10]) : xRange;
        const yOffsets = armyAiLevel >= 2 ? [10, 9, 11, 8, 12, 7, 13, 6, 14, 5, 15, 4, 16, 3, 17, 2, 18, 1, 19, 0] : Array.from({ length: 20 }, (_, i) => i);

        for (const x of preferredXs) {
          for (const y of yOffsets) {
            if (Math.random() > formationSpread && armyAiLevel < 3) continue;
            if (x < xRange[0] || x > xRange[1]) continue;
            if (!updatedUnits.some(u => u.x === x && u.y === y && u.status === 'field')) {
              unit.x = x;
              unit.y = y;
              unit.status = 'field';
              currentSupply += (unit.supplyConsumption || 1);
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
        if (!placed) {
          for (let x = xRange[0]; x <= xRange[1] && !placed; x++) {
            for (let y = 0; y < 20 && !placed; y++) {
              if (!updatedUnits.some(u => u.x === x && u.y === y && u.status === 'field')) {
                unit.x = x;
                unit.y = y;
                unit.status = 'field';
                currentSupply += (unit.supplyConsumption || 1);
                placed = true;
              }
            }
          }
        }
      }
    }
  }

  return updatedUnits;
}

/**
 * AI 군단의 턴 자동 명령 생성 (매 턴 시작 시 호출)
 */
export function calculateAIOrders(session, aiCountryId, excludeCorpsId = null) {
  const { units, userOrders = [], corps = [], generals = [], armies = [], sessionCategory } = session;
  
  // excludeCorpsId가 있으면 (유저가 직접 조작하는 주 군단 및 사령부는 제외)
  // 추가로: 유저가 다른 군단 유닛에 개입하여 이미 명령을 내린 경우(userOrders 존재) AI 조작에서 제외
  const aiUnits = units.filter(u => 
    u.owner === aiCountryId && 
    u.status === 'field' && 
    (!excludeCorpsId || (u.corpsId !== excludeCorpsId)) &&
    !userOrders.some(o => o.unitId === u.id)
  );
  
  const enemies = units.filter(u => u.owner !== aiCountryId && u.status === 'field');
  const enemyHQ = enemies.find(u => u.isHQ);

  const orders = [];
  const skills = [];
  const reservedTiles = userOrders.filter(o => o.type === 'move').map(o => `${o.target.x},${o.target.y}`);
  const localReserved = new Set(reservedTiles);

  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const chooseTargetByLevel = (unit, aiLevel) => {
    if (!enemies.length) return null;

    const nearest = enemies.reduce((best, e) => {
      if (!best) return e;
      return dist(unit, e) < dist(unit, best) ? e : best;
    }, null);

    if (aiLevel <= 1) return nearest;

    const lowHpInRange = enemies
      .filter(e => dist(unit, e) <= 12)
      .sort((a, b) => ((a.hp / (a.maxHp || 100)) - (b.hp / (b.maxHp || 100))))[0];

    if (aiLevel === 2) return lowHpInRange || nearest;

    const hq = enemies.find(e => e.isHQ);
    const keyThreat = enemies.find(e => e.subCategory === '포병' || e.minorCategory === '포병');
    return hq || keyThreat || lowHpInRange || nearest;
  };

  // 야전군 사령관 지능 추출
  let armyAiLevel = 1;
  const army = armies.find(a => (a.corpsIds || []).some(cid => units.some(u => u.owner === aiCountryId && u.corpsId === cid)));
  if (army && army.commanderId) {
    const armyGen = generals.find(g => g.id === army.commanderId);
    if (armyGen) armyAiLevel = parseInt(armyGen.aiLevel, 10);
  }

  // 해전에서는 제독(해군) 지능을 우선 반영
  if (sessionCategory === 'naval') {
    const admirals = generals.filter(g => (g.category || '').includes('해군') || (g.role || '').includes('제독'));
    if (admirals.length > 0) {
      armyAiLevel = Math.max(armyAiLevel, ...admirals.map(g => parseInt(g.aiLevel || 1, 10)));
    }
  }

  // AI 스킬 사용 로직 (사령관 지능 레벨 2 이상일 때)
  if (armyAiLevel >= 2 && enemies.length > 0) {
    const myFieldUnits = units.filter(u => u.owner === aiCountryId && u.status === 'field');
    const myStandbyUnits = units.filter(u => u.owner === aiCountryId && u.status === 'standby');
    const myMissiles = myStandbyUnits.filter(u => u.subCategory === '미사일' || u.minorCategory === '미사일');
    const myCas = myStandbyUnits.filter(u => u.subCategory === '근접항공지원기' || u.minorCategory === '근접항공지원기');
    
    // 고레벨일수록 핵심 표적(HQ/포병/딸피)을 먼저 선택
    const targetEnemy = enemyHQ
      || enemies.find(e => e.subCategory === '포병' || e.minorCategory === '포병')
      || enemies.slice().sort((a, b) => ((a.hp / (a.maxHp || 100)) - (b.hp / (b.maxHp || 100))))[0]
      || enemies[0];

    const casUseChance = Math.min(0.75, 0.2 + armyAiLevel * 0.15);
    const missileUseChance = Math.min(0.8, 0.2 + armyAiLevel * 0.15);

    if (myCas.length > 0 && Math.random() < casUseChance) {
      const maxAttackCas = myCas.reduce((prev, curr) => (prev.attack > curr.attack) ? prev : curr);
      skills.push({
        type: 'cas',
        target: { x: targetEnemy.x, y: targetEnemy.y },
        damage: maxAttackCas.attack || 10,
        consumerId: maxAttackCas.id,
        aircraftSpeed: Math.max(1, maxAttackCas.speed || 1),
        attackerId: aiCountryId
      });
    } else if (myMissiles.length > 0 && Math.random() < missileUseChance) {
      const missile = myMissiles[0];
      skills.push({
        type: 'missile',
        target: { x: targetEnemy.x, y: targetEnemy.y },
        damage: missile.attack || 50,
        consumerId: missile.id,
        attackerId: aiCountryId
      });
    }

    // 정찰: 레벨이 높을수록 더 자주 사용
    const reconChance = Math.min(0.9, 0.2 + armyAiLevel * 0.2);
    if (Math.random() < reconChance) {
      skills.push({ type: 'recon', attackerId: aiCountryId });
    }
  }

  aiUnits.forEach(aiUnit => {
    if (enemies.length === 0) return;

    // 사령부(HQ) 도망/이동 로직
    if (aiUnit.isHQ) {
      if (armyAiLevel >= 2) {
        // 사령부는 적과 거리를 벌리는 방향으로 도망
        let closestEnemyDist = Infinity;
        let closestEnemy = null;
        enemies.forEach(enemy => {
          const dist = Math.abs(enemy.x - aiUnit.x) + Math.abs(enemy.y - aiUnit.y);
          if (dist < closestEnemyDist) {
            closestEnemyDist = dist;
            closestEnemy = enemy;
          }
        });

        if (closestEnemyDist <= 5 && closestEnemy) {
          // 적의 반대 방향으로 1칸 도망
          let targetX = aiUnit.x;
          let targetY = aiUnit.y;
          if (aiUnit.x > closestEnemy.x) targetX = Math.min(19, targetX + 1);
          else if (aiUnit.x < closestEnemy.x) targetX = Math.max(0, targetX - 1);
          else if (aiUnit.y > closestEnemy.y) targetY = Math.min(19, targetY + 1);
          else if (aiUnit.y < closestEnemy.y) targetY = Math.max(0, targetY - 1);
          
          if (!reservedTiles.includes(`${targetX},${targetY}`)) {
            orders.push({ unitId: aiUnit.id, type: 'move', target: { x: targetX, y: targetY } });
          }
        }
      }
      return; // 사령부는 공격/후퇴 로직 없음
    }

    // 1. AI 지능 레벨 (aiLevel) 추출
    let aiLevel = 1;
    if (aiUnit.corpsId) {
      const unitCorps = corps.find(c => c.id === aiUnit.corpsId);
      const corpsCommanderId = unitCorps?.commanderId || unitCorps?.generalId;
      if (unitCorps && corpsCommanderId) {
        const general = generals.find(g => g.id === corpsCommanderId);
        if (general && general.aiLevel) {
          aiLevel = parseInt(general.aiLevel, 10);
        }
      }
    } else if (aiUnit.majorCategory === '해군' || sessionCategory === 'naval') {
      aiLevel = Math.max(aiLevel, armyAiLevel);
    }

    // 2. [Level 3 지능] 체력이 20% 미만이면 후퇴(Retreat) 결단
    const hpRatio = aiUnit.hp / (aiUnit.maxHp || 100);
    const retreatThreshold = aiLevel >= 4 ? 0.3 : (aiLevel >= 3 ? 0.2 : 0.1);
    if (aiLevel >= 3 && hpRatio < retreatThreshold) {
      orders.push({ unitId: aiUnit.id, type: 'retreat' });
      return; // 후퇴 처리 후 해당 유닛 오더 종료
    }

    const targetEnemy = chooseTargetByLevel(aiUnit, aiLevel) || enemyHQ;

    if (targetEnemy) {
      if (aiUnit.subCategory === '포병') {
        // 포병은 사거리가 무한이므로 안전하게 포격 타겟팅
        orders.push({ unitId: aiUnit.id, type: 'attack', target: { x: targetEnemy.x, y: targetEnemy.y } });
      } else {
        // 기동/보병 부대는 적을 향해 전진
        const maxSpeed = aiUnit.speed || 1;
        let targetX = aiUnit.x;
        let targetY = aiUnit.y;
        
        let dx = targetEnemy.x - aiUnit.x;
        let dy = targetEnemy.y - aiUnit.y;
        
        // 이동 가능한 최대 칸 수만큼 목표 설정
        let steps = 0;
        let tempX = targetX;
        let tempY = targetY;

        while (steps < maxSpeed && (dx !== 0 || dy !== 0)) {
          if (Math.abs(dx) > Math.abs(dy)) {
            tempX += (dx > 0 ? 1 : -1);
            dx -= (dx > 0 ? 1 : -1);
          } else {
            tempY += (dy > 0 ? 1 : -1);
            dy -= (dy > 0 ? 1 : -1);
          }

          // 유저가 가기로 예약한 타일이면 그 즉시 해당 타일 진입을 포기하고 직전 타일에서 멈춤 (양보)
          if (localReserved.has(`${tempX},${tempY}`)) {
            break; 
          }

          targetX = tempX;
          targetY = tempY;
          steps++;
        }
        
        if (targetX !== aiUnit.x || targetY !== aiUnit.y) {
          orders.push({ unitId: aiUnit.id, type: 'move', target: { x: targetX, y: targetY } });
          localReserved.add(`${targetX},${targetY}`);
        }
      }
    }
  });

  return { orders, skills };
}

/**
 * 턴 시뮬레이션 핵심 엔진 (동시 턴 처리)
 * @param {Object} session 게임 세션 (board, units, orders 등)
 */
export function resolveSimultaneousTurn(session) {
  const { board, units, orders, skillsQueue, supplyLimit } = session;
  session.resourceDeductions = session.resourceDeductions || [];

  // -2. 보급 페널티(Supply Penalty) 적용
  // 대기상태(standby)인 유닛은 보급소모를 갉아먹지 않으므로, 필드에 있는 유닛만 계산
  const fieldUnits = units.filter(u => u.status === 'field');
  const totalSupply = fieldUnits.reduce((acc, u) => acc + (u.supplyConsumption || 1), 0);
  const supplyMultiplier = (supplyLimit !== undefined && totalSupply > supplyLimit) ? 0.5 : 1.0;
  
  if (supplyMultiplier < 1.0) {
    units.forEach(u => {
      if (u.originalAttack === undefined) u.originalAttack = u.attack;
      if (u.originalDefense === undefined) u.originalDefense = u.defense;
      if (u.originalSpeed === undefined) u.originalSpeed = u.speed;
      if (u.originalMaxHp === undefined) u.originalMaxHp = (u.maxHp || 100);

      u.attack = Math.floor(u.originalAttack * supplyMultiplier);
      u.defense = Math.floor(u.originalDefense * supplyMultiplier);
      u.speed = Math.floor(u.originalSpeed * supplyMultiplier);
      u.maxHp = Math.floor(u.originalMaxHp * supplyMultiplier);
      if (u.hp > u.maxHp) u.hp = u.maxHp;
    });
  } else {
    // 페널티 해제 복구 (필요시)
    units.forEach(u => {
      if (u.originalAttack !== undefined) u.attack = u.originalAttack;
      if (u.originalDefense !== undefined) u.defense = u.originalDefense;
      if (u.originalSpeed !== undefined) u.speed = u.originalSpeed;
      if (u.originalMaxHp !== undefined) u.maxHp = u.originalMaxHp;
    });
  }

  // -1. 턴 속박(movementLock) 처리 및 턴 넘김 무시
  units.forEach(u => {
    if (u.movementLock > 0) {
      // 턴 정지 상태이므로 이 유닛의 명령은 무시됨
      const idx = orders.findIndex(o => o.unitId === u.id);
      if (idx !== -1) orders.splice(idx, 1);
      u.movementLock -= 1;
    }
  });

  // 0. EMP 스킬 사전 검증 (기계화 이동/스킬 무력화)
  const isEMPActive = skillsQueue && skillsQueue.some(s => s.type === 'emp');
  if (isEMPActive) {
    units.forEach(u => {
      if (u.subCategory === '기계화' || u.subCategory === '전차') {
        // 기계화 유닛은 EMP 발동 턴에 이동력 상실 (명령 취소)
        const orderIdx = orders.findIndex(o => o.unitId === u.id);
        if (orderIdx !== -1) orders.splice(orderIdx, 1);
      }
    });
  }

  // 1. 후퇴(Retreat) 먼저 처리 (즉각 대기 및 체력 회복 검증)
  orders.filter(o => o.type === 'retreat').forEach(order => {
    const unit = units.find(u => u.id === order.unitId);
    if (unit) {
      unit.status = 'standby'; // 대기 상태로 전환
      if (unit.hp < (unit.maxHp || 100)) {
        const max = unit.maxHp || 100;
        const missingRatio = (max - unit.hp) / max;
        
        const reqManpower = Math.floor((unit.manpowerCost || 0) * missingRatio);
        const reqWeapons = (unit.requiredWeapons || []).map(w => ({ name: w.weaponName, amount: Math.max(1, Math.floor(w.amount * missingRatio)) }));
        
        let affordableRatio = 1.0;
        if (session.countryResources) {
          const res = session.countryResources;
          if (reqManpower > 0) {
            affordableRatio = Math.min(affordableRatio, (res.manpower || 0) / reqManpower);
          }
          reqWeapons.forEach(rw => {
            if (rw.amount > 0) {
              affordableRatio = Math.min(affordableRatio, (res.weapons?.[rw.name] || 0) / rw.amount);
            }
          });
          affordableRatio = Math.max(0, Math.min(1.0, affordableRatio));
          
          if (affordableRatio > 0) {
            const consumedManpower = Math.floor(reqManpower * affordableRatio);
            const consumedWeapons = reqWeapons.map(rw => ({ name: rw.name, amount: Math.floor(rw.amount * affordableRatio) }));
            
            res.manpower = (res.manpower || 0) - consumedManpower;
            consumedWeapons.forEach(cw => {
              res.weapons[cw.name] = (res.weapons[cw.name] || 0) - cw.amount;
            });
            
            const healedRatio = missingRatio * affordableRatio;
            unit.hp = Math.min(max, unit.hp + Math.floor(max * healedRatio));
            
            session.resourceDeductions.push({
              owner: unit.owner,
              manpower: consumedManpower,
              weapons: consumedWeapons
            });
          }
        } else {
          // 리소스 제약이 없는 환경이라면 풀피 회복
          unit.hp = max;
        }
      }
    }
  });

  // 1.5 증원(Spawn) 먼저 처리 (HQ 위치에 유닛 즉시 등장)
  orders.filter(o => o.type === 'spawn').forEach(order => {
    const unit = units.find(u => u.id === order.unitId);
    if (unit && unit.status === 'standby') {
      unit.status = 'field';
      unit.x = order.target.x;
      unit.y = order.target.y;
    }
  });

  // 2. 이동(Move) 타겟 수집
  const moveOrders = orders.filter(o => o.type === 'move' && units.find(u => u.id === o.unitId)?.status === 'field');
  const targetMap = {}; 

  moveOrders.forEach(order => {
    const unit = units.find(u => u.id === order.unitId);
    if (!unit) return;
    
    const actualTarget = calculateActualPath(unit, order.target.x, order.target.y, board, units, order.isAirdrop);
    const key = `${actualTarget.x},${actualTarget.y}`;
    if (!targetMap[key]) targetMap[key] = [];
    targetMap[key].push({ order, unit });
  });

  // 3. 충돌 및 근접 교전(Melee) 처리
  Object.keys(targetMap).forEach(key => {
    const contenders = targetMap[key];
    const targetX = parseInt(key.split(',')[0]);
    const targetY = parseInt(key.split(',')[1]);
    
    // 같은 타일로 진입하려는 아군/적군 스피드 경합
    contenders.sort((a, b) => {
      if (b.unit.speed === a.unit.speed) return Math.random() - 0.5;
      return b.unit.speed - a.unit.speed;
    });

    const winner = contenders[0];
    
    // 이동 완료 처리 및 지형 디버프 부여
    winner.unit.x = targetX;
    winner.unit.y = targetY;
    applyTerrainMovementLock(winner.unit, board[targetY]?.[targetX]);

    // 도착한 곳에 적이 있다면 근접 교전 발생
    const occupant = units.find(u => u.x === targetX && u.y === targetY && u.status === 'field' && u.id !== winner.unit.id);
    if (occupant && occupant.owner !== winner.unit.owner) {
      // winner가 occupant를 공격, occupant가 winner를 반격
      if (occupant.isHQ) {
        if (winner.order && winner.order.isAirdrop && winner.unit.subCategory === '공수부대') {
           // 공수 낙하로 사령부 진입 시 무조건 패배 (즉사)
           winner.unit.hp = 0;
           winner.unit.status = 'destroyed';
        } else {
           occupant.hqHitsRemaining = (occupant.hqHitsRemaining || 2) - 1; // 사령부는 1타격만 입음
        }
      } else {
        let attackerDmg = winner.unit.attack;
        if (winner.unit.subCategory === '포병' && winner.order && winner.order.type === 'move') attackerDmg = 0;
        if (winner.unit.isHQ) attackerDmg = 0; // 사령부는 공격력 0
        const attackerEffects = applyTileEffects(winner.unit, board[winner.unit.y]?.[winner.unit.x]);
        const dmgToOccupant = calculateDamage(Math.floor(attackerDmg * attackerEffects.attackMultiplier), occupant.defense, session.penetration[winner.unit.owner] || 0);
        occupant.hp -= dmgToOccupant;
      }

      if (winner.unit.isHQ || winner.unit.hp <= 0) {
         // winner가 사령부일 경우, 적(occupant)으로부터 반격을 받아 1피격 됨 (역돌격 무적 방지)
         if (winner.unit.isHQ && occupant.status === 'field' && !occupant.isHQ) {
            winner.unit.hqHitsRemaining = (winner.unit.hqHitsRemaining || 2) - 1;
         }
      } else {
        let defenderDmg = occupant.attack;
        const occupantOrder = orders.find(o => o.unitId === occupant.id);
        if (occupant.subCategory === '포병' && occupantOrder && occupantOrder.type === 'move') defenderDmg = 0;
        const occupantEffects = applyTileEffects(occupant, board[occupant.y]?.[occupant.x]);
        const dmgToWinner = calculateDamage(Math.floor(defenderDmg * occupantEffects.attackMultiplier), winner.unit.defense, session.penetration[occupant.owner] || 0);
        winner.unit.hp -= dmgToWinner;
      }
    }
    
    // 후순위 유닛들(패자) 처리 (제자리 멈춤 및 교전)
    for (let i = 1; i < contenders.length; i++) {
      const loser = contenders[i].unit;
      const loserOrder = contenders[i].order;
      
      // 승자(winner)가 적군이라면 loser는 winner를 향해 진입하려다 막힌 것이므로 교전
      if (loser.owner !== winner.unit.owner && winner.unit.status === 'field' && loser.status === 'field') {
        if (winner.unit.isHQ) {
          if (loserOrder && loserOrder.isAirdrop && loser.subCategory === '공수부대') {
             loser.hp = 0;
             loser.status = 'destroyed';
          } else {
             winner.unit.hqHitsRemaining = (winner.unit.hqHitsRemaining || 2) - 1;
          }
        } else {
          let attackerDmg = loser.attack;
          if (loser.subCategory === '포병' && loserOrder && loserOrder.type === 'move') attackerDmg = 0;
          if (loser.isHQ) attackerDmg = 0; // 사령부는 공격력 0
          const loserEffects = applyTileEffects(loser, board[loser.y]?.[loser.x]);
          const dmgToWinner = calculateDamage(Math.floor(attackerDmg * loserEffects.attackMultiplier), winner.unit.defense, session.penetration[loser.owner] || 0);
          winner.unit.hp -= dmgToWinner;
        }

        if (loser.isHQ || loser.hp <= 0) {
           // loser가 사령부일 경우 winner로부터 반격 받음
           if (loser.isHQ && winner.unit.status === 'field' && !winner.unit.isHQ) {
              loser.hqHitsRemaining = (loser.hqHitsRemaining || 2) - 1;
           }
        } else if (winner.unit.status === 'field' && !winner.unit.isHQ) {
          let defenderDmg = winner.unit.attack;
          if (winner.unit.subCategory === '포병' && winner.order && winner.order.type === 'move') defenderDmg = 0;
          const winnerEffects = applyTileEffects(winner.unit, board[winner.unit.y]?.[winner.unit.x]);
          const dmgToLoser = calculateDamage(Math.floor(defenderDmg * winnerEffects.attackMultiplier), loser.defense, session.penetration[winner.unit.owner] || 0);
          loser.hp -= dmgToLoser;
        }
      }
    }
  });

  // 4. 포병 원거리 공격 처리
  orders.filter(o => o.type === 'attack').forEach(order => {
    const unit = units.find(u => u.id === order.unitId);
    if (unit && unit.subCategory === '포병' && unit.status === 'field') {
      const targetUnit = units.find(u => u.x === order.target.x && u.y === order.target.y && u.status === 'field' && u.owner !== unit.owner);
      if (targetUnit) {
        if (targetUnit.isHQ) {
           // 사령부는 포병 공격에 완전 면역
        } else {
          const attackerEffects = applyTileEffects(unit, board[unit.y]?.[unit.x]);
          const dmg = calculateDamage(Math.floor(unit.attack * attackerEffects.attackMultiplier), targetUnit.defense, session.penetration[unit.owner] || 0);
          targetUnit.hp -= dmg;
        }
      }
    }
  });

  // 5. HP 0 이하 또는 사령부 파괴 처리
  units.forEach(u => {
    if (u.isHQ) {
      if ((u.hqHitsRemaining !== undefined && u.hqHitsRemaining <= 0) && u.status === 'field') {
        u.status = 'destroyed';
      }
    } else if (u.hp <= 0 && u.status === 'field') {
      u.status = 'destroyed';
    }
  });

  // 5.5. 지형 효과에 의한 지속 데미지(DoT) 처리
  units.forEach(u => {
    if (u.status !== 'field' || u.isHQ) return;
    const tile = board[u.y]?.[u.x];
    if (tile) {
      const effects = applyTileEffects(u, tile, 'turnEnd');
      if (effects.hpDrainPct > 0) {
        const drainAmount = Math.max(1, Math.floor((u.maxHp || 100) * effects.hpDrainPct));
        u.hp -= drainAmount;
        if (u.hp <= 0) u.status = 'destroyed';
      }
    }
  });

  // 6. 대기 상태(Standby) 체력 회복 삭제 (기획 요구사항: 턴 넘김 시 체력 회복 없음)
  // 기존 로직: 10% 회복 (주석 처리 또는 제거됨)
  units.forEach(u => {
    // 아무것도 안함 (필드에서 소모된 상태 그대로 유지)
  });

  return session;
}

/**
 * 시야 (Fog of War) 계산
 * @param {Array} board 20x20 배열
 * @param {Array} units 유닛 배열
 * @param {string} playerId 시야를 계산할 플레이어 ID
 * @param {boolean} hasRecon 정찰 스킬 활성화 여부
 * @returns {Array} 20x20 boolean 배열 (true = 보임)
 */
export function calculateFogOfWar(board, units, playerId, hasRecon) {
  const fow = Array(20).fill().map(() => Array(20).fill(false));

  if (hasRecon) {
    return Array(20).fill().map(() => Array(20).fill(true));
  }

  // 아군 유닛의 시야 적용
  const myUnits = units.filter(u => u.owner === playerId && u.status === 'field');
  myUnits.forEach(u => {
    const vision = 1 + (u.vision || 0); // 기본 시야 1 + 관측력 스탯
    for (let dy = -vision; dy <= vision; dy++) {
      for (let dx = -vision; dx <= vision; dx++) {
        const nx = u.x + dx;
        const ny = u.y + dy;
        if (nx >= 0 && nx < 20 && ny >= 0 && ny < 20) {
          fow[ny][nx] = true;
        }
      }
    }
  });

  return fow;
}

/**
 * 사령부 스킬 이펙트 적용 (독가스 틱뎀, 미사일, 해안포격 등)
 * 동시 턴 처리 엔진에서 호출됨
 */
export function resolveCommanderSkills(session) {
  const { board, units, skillsQueue, antiAir = {} } = session;
  // skillsQueue: [{ type: 'poison', target: {x, y} }, { type: 'missile', target: {x, y}, damage: 50 }, ...]

  // 1. 독가스 필드 도트 데미지 적용 (피아 구분 없음, 지속 턴 관리)
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      if (board[y][x].poisoned && (board[y][x].poisonTurns || 0) > 0) {
        const unit = units.find(u => u.x === x && u.y === y && u.status === 'field');
        if (unit && !unit.isHQ) {
          const dmg = Math.max(1, board[y][x].poisonDamage || 1);
          unit.hp -= dmg;
        }
        board[y][x].poisonTurns -= 1;
        if (board[y][x].poisonTurns <= 0) {
          board[y][x].poisoned = false;
          board[y][x].poisonDamage = 0;
          board[y][x].poisonTurns = 0;
        }
      }
    }
  }

  if (!skillsQueue || skillsQueue.length === 0) return session;

  // EMP 발동 시 양측의 다른 모든 사령부 스킬 무력화
  let activeSkills = skillsQueue;
  const isEMPActive = activeSkills.some(s => s.type === 'emp');
  if (isEMPActive) {
    activeSkills = activeSkills.filter(s => s.type === 'emp');
  }

  // 2. 예약된 스킬들 즉발 처리
  activeSkills.forEach(skill => {
    // ---- [AA 요격 판정] 폭격, CAS, 핵투발의 경우 상대 대공능력과 다이스 경합 ----
    let intercepted = false;
    let aaChecked = false;
    if (['bombing', 'cas', 'nuke'].includes(skill.type)) {
      aaChecked = true;
      const targetUnit = units.find(u => u.x === skill.target.x && u.y === skill.target.y && u.status === 'field');
      // 타겟에 유닛이 없더라도 일단 적국의 기본 대공능력으로 방어 시도한다고 가정 (또는 타겟 유닛의 소유주)
      let defenderId = targetUnit ? targetUnit.owner : null;
      if (!defenderId) {
        const attackerId = skill.attackerId;
        defenderId = units.find(u => u.owner !== attackerId && u.status === 'field')?.owner || 'enemy';
      }
      const defenderAA = antiAir[defenderId] || 0;

      let aircraftSpeed = skill.aircraftSpeed || 3;
      intercepted = calculateAirInterception(defenderAA, aircraftSpeed);
    }
    
    // 요격당한 경우 데미지 적용 건너뜀 (폭격/CAS는 손실, 핵은 손실 없음)
    if (intercepted) {
      if (skill.consumerId && ['bombing', 'cas'].includes(skill.type)) {
        const consumer = units.find(u => u.id === skill.consumerId);
        if (consumer) {
          consumer.hp = 0;
          consumer.status = 'destroyed';
        }
      }
      console.log(`[AA 요격 성공] ${skill.type} 스킬이 요격되어 무효화되었습니다.`);
      return; 
    }

    if (skill.type === 'poison') {
      board[skill.target.y][skill.target.x].poisoned = true;
      board[skill.target.y][skill.target.x].poisonDamage = Math.max(1, skill.damage || 1);
      board[skill.target.y][skill.target.x].poisonTurns = Math.max(1, skill.duration || 1);
    } 
    else if (skill.type === 'missile' || skill.type === 'cas') {
      const unit = units.find(u => u.x === skill.target.x && u.y === skill.target.y && u.status === 'field');
      if (unit && !unit.isHQ) {
        unit.hp -= skill.damage;
      }
    }
    if (skill.type === 'nuke' || skill.type === 'nuke_missile' || skill.type === 'bombing' || skill.type === 'naval_bombardment') {
      // 범위 처리 (핵은 투입 유닛 속도 기반으로 범위 확장)
      const nukeRadius = Math.max(1, Math.min(3, parseInt(skill.radius, 10) || 1));
      const targetArea = [];
      const areaRadius = (skill.type === 'nuke' || skill.type === 'nuke_missile') ? nukeRadius : 1;
      for (let dy = -areaRadius; dy <= areaRadius; dy++) {
        for (let dx = -areaRadius; dx <= areaRadius; dx++) {
          targetArea.push({ x: skill.target.x + dx, y: skill.target.y + dy });
        }
      }

      targetArea.forEach(pos => {
        const unit = units.find(u => u.x === pos.x && u.y === pos.y && u.status === 'field');
        if (!unit || unit.isHQ) return;

        if (skill.type === 'nuke' || skill.type === 'nuke_missile') {
          unit.hp = 0; // 무조건 소실
        } else if (skill.type === 'bombing') {
          unit.hp -= skill.damage;
        } else if (skill.type === 'naval_bombardment') {
          const dmg = Math.max(1, Math.floor((unit.maxHp || unit.hp) * 0.2));
          unit.hp -= dmg;
        }
      });
    }
    
    // 소모성 스킬 사용 시 주체 유닛 파괴
    // missile: 항상 소모 / bombing, cas: 요격 실패(공격 성공) 시에는 소모 없음
    if (skill.consumerId) {
      const consumer = units.find(u => u.id === skill.consumerId);
      const shouldConsume = skill.type === 'missile' || skill.type === 'nuke' || skill.type === 'nuke_missile' || skill.type === 'poison';
      if (consumer && shouldConsume) {
        consumer.hp = 0;
        consumer.status = 'destroyed';
      }
    }
    // EMP는 턴 처리 전에 모든 기계화 이동/스킬 큐를 막는 로직으로 별도 사전 적용됨
  });

  units.forEach(u => {
    if (!u.isHQ && u.status === 'field' && u.hp <= 0) {
      u.status = 'destroyed';
    }
  });

  // 스킬 큐 비우기
  session.skillsQueue = [];
  
  return session;
}

/**
 * 폭격/CAS 발동 전 요격 여부 판정 (다이스 굴림)
 * @param {number} antiAir 적국의 대공능력
 * @param {number} aircraftSpeed 투입된 항공기(폭격기/CAS)의 속도
 * @returns {boolean} true면 요격 성공(스킬 무효화), false면 폭격 성공
 */
export function calculateAirInterception(antiAir, aircraftSpeed) {
  const total = (antiAir || 0) + (aircraftSpeed || 0);
  if (total <= 0) return false;
  
  const roll = Math.floor(Math.random() * total) + 1; // 1 ~ (대공+속도)
  // 기획: 1~속도 이내면 폭격 성공, 속도보다 크면 요격 성공 (수비측 승리)
  if (roll <= aircraftSpeed) {
    return false; // 요격 실패 (폭격기 승리)
  }
  return true; // 요격 성공 (수비 승리)
}

/**
 * 게임 종료(항복, 사령부 파괴) 시 생존 유닛들의 남은 체력 비율을 기반으로 인력/무기 손실을 계산
 */
export function calculateCasualties(units) {
  const casualties = {}; 
  
  units.forEach(u => {
    if (u.isHQ) return; // 사령부는 비용 계산에서 제외 (일반 유닛만 계산)
    if (!casualties[u.owner]) casualties[u.owner] = { manpower: 0, weapons: {} };
    
    // 사망한 유닛 또는 깎인 체력 비율 계산
    const max = u.maxHp || 100;
    const hp = u.status === 'destroyed' ? 0 : u.hp;
    const lostRatio = Math.min(1, Math.max(0, (max - hp) / max));
    
    if (lostRatio > 0) {
      casualties[u.owner].manpower += Math.floor((u.manpowerCost || 0) * lostRatio);
      (u.requiredWeapons || []).forEach(w => {
        const amt = Math.max(1, Math.floor(w.amount * lostRatio));
        if (!casualties[u.owner].weapons[w.weaponName]) casualties[u.owner].weapons[w.weaponName] = 0;
        casualties[u.owner].weapons[w.weaponName] += amt;
      });
    }
  });
  
  return casualties;
}
