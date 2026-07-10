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
      effects.hpDrainPct = (1 / 20) / 2;
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
  const sub = unit.subCategory || '보병';
  if (!tile || tile.type === TILE_TYPES.NORMAL || tile.type === TILE_TYPES.PEAK || tile.type === TILE_TYPES.FORTRESS || tile.type === TILE_TYPES.ULTIMATE_FORTRESS) return;

  if (tile.type === TILE_TYPES.ROUGH) {
    if (!['해병대', '산악부대', '공수부대', '특전사'].includes(sub)) {
      unit.movementLock = 1;
    }
  } else if (tile.type === TILE_TYPES.MOUNTAIN) {
    if (sub === '산악부대') {
      // 면역
    } else if (['해병대', '공수부대', '특전사'].includes(sub)) {
      unit.movementLock = 1;
    } else {
      unit.movementLock = 2;
    }
  } else if (tile.type === TILE_TYPES.WATER) {
    if (sub === '해병대') {
      // 면역
    } else if (['산악부대', '특전사', '공수부대'].includes(sub)) {
      unit.movementLock = 1;
    } else {
      unit.movementLock = 2;
    }
  }
}

/**
 * 경로(Path)상 장애물이나 적을 만났을 때 실제 최종 도착지 반환 (Bresenham 알고리즘 기반)
 */
function calculateActualPath(unit, targetX, targetY, board, allUnits) {
  let x0 = unit.x;
  let y0 = unit.y;
  let x1 = targetX;
  let y1 = targetY;

  const isMechanized = unit.subCategory === '기계화' || unit.subCategory === '전차';
  let currentX = x0;
  let currentY = y0;
  let lastValidX = x0;
  let lastValidY = y0;

  // Bresenham for 8-way, Manhattan stepping for 4-way
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  let sx = (x0 < x1) ? 1 : -1;
  let sy = (y0 < y1) ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (currentY < 0 || currentY >= 20 || currentX < 0 || currentX >= 20) {
      return { x: lastValidX, y: lastValidY };
    }

    const tile = board[currentY][currentX];
    if (tile.type === TILE_TYPES.PEAK) return { x: lastValidX, y: lastValidY };
    if (tile.type === TILE_TYPES.WATER && !['해병대', '공수부대', '특전사'].includes(unit.subCategory)) {
      return { x: lastValidX, y: lastValidY };
    }

    if (currentX !== x0 || currentY !== y0) {
      const occupant = allUnits.find(u => u.x === currentX && u.y === currentY && u.status === 'field');
      if (occupant) {
        if (occupant.owner === unit.owner) {
          // 아군을 넘을 수 없으므로 직전 타일에서 멈춤
          return { x: lastValidX, y: lastValidY };
        } else {
          // 적을 만나면 충돌/교전을 위해 해당 타일까지만 진입
          return { x: currentX, y: currentY };
        }
      }
    }

    lastValidX = currentX;
    lastValidY = currentY;

    if (currentX === x1 && currentY === y1) break;

    if (isMechanized) {
      // 기계화는 십자 이동 (대각선 불가)
      if (dx > dy) {
        currentX += sx;
        dx--;
      } else {
        currentY += sy;
        dy--;
      }
    } else {
      // 보병 등은 8방향 이동 (Bresenham)
      let e2 = 2 * err;
      if (e2 > -dy) { err -= dy; currentX += sx; }
      if (e2 < dx) { err += dx; currentY += sy; }
    }
  }

  return { x: lastValidX, y: lastValidY };
}

/**
 * AI 군단의 턴 자동 명령 생성 (매 턴 시작 시 호출)
 */
export function calculateAIOrders(session, aiCountryId, excludeCorpsId = null) {
  const { units, userOrders = [], corps = [], generals = [] } = session;
  
  // excludeCorpsId가 있으면 (유저가 직접 조작하는 주 군단 및 사령부는 제외)
  // 추가로: 유저가 다른 군단 유닛에 개입하여 이미 명령을 내린 경우(userOrders 존재) AI 조작에서 제외
  const aiUnits = units.filter(u => 
    u.owner === aiCountryId && 
    u.status === 'field' && 
    (!excludeCorpsId || (u.corpsId !== excludeCorpsId && !u.isHQ)) &&
    !userOrders.some(o => o.unitId === u.id)
  );
  const enemies = units.filter(u => u.owner !== aiCountryId && u.status === 'field');

  const orders = [];
  const reservedTiles = userOrders.filter(o => o.type === 'move').map(o => `${o.target.x},${o.target.y}`);

  aiUnits.forEach(aiUnit => {
    if (enemies.length === 0) return;

    // 1. AI 지능 레벨 (aiLevel) 추출
    let aiLevel = 1;
    if (aiUnit.corpsId) {
      const unitCorps = corps.find(c => c.id === aiUnit.corpsId);
      if (unitCorps && unitCorps.generalId) {
        const general = generals.find(g => g.id === unitCorps.generalId);
        if (general && general.aiLevel) {
          aiLevel = parseInt(general.aiLevel, 10);
        }
      }
    }

    // 2. [Level 3 지능] 체력이 20% 미만이면 후퇴(Retreat) 결단
    const hpRatio = aiUnit.hp / (aiUnit.maxHp || 100);
    if (aiLevel >= 3 && hpRatio < 0.2) {
      orders.push({ unitId: aiUnit.id, type: 'retreat' });
      return; // 후퇴 처리 후 해당 유닛 오더 종료
    }

    // 3. 타겟 선정 로직 (Level에 따라 분기)
    let targetEnemy = null;

    if (aiLevel >= 2) {
      // [Level 2 이상] 딸피(가장 체력 비율이 낮은) 적을 우선적으로 점사 (Focus Fire)
      // 거리가 너무 멀면 곤란하므로, 일정 거리 이내의 적 중 체력이 가장 낮은 적 탐색
      let lowestHpEnemy = null;
      let lowestHpRatio = Infinity;
      let minDistance = Infinity;

      enemies.forEach(enemy => {
        const dist = Math.abs(enemy.x - aiUnit.x) + Math.abs(enemy.y - aiUnit.y);
        const enemyHpRatio = enemy.hp / (enemy.maxHp || 100);
        
        // 거리가 10칸 이내인 적 중에서 체력 비율이 가장 낮은 적을 타겟팅
        if (dist <= 10 && enemyHpRatio < lowestHpRatio) {
          lowestHpRatio = enemyHpRatio;
          lowestHpEnemy = enemy;
        }
        
        // 백업용 최단거리 적 (주변 10칸에 아무도 없을 경우 대비)
        if (dist < minDistance) {
          minDistance = dist;
          targetEnemy = enemy;
        }
      });

      if (lowestHpEnemy) {
        targetEnemy = lowestHpEnemy;
      }
    } else {
      // [Level 1 기본] 가장 가까운 적(최단 거리)에게 무지성 돌격
      let minDistance = Infinity;
      enemies.forEach(enemy => {
        const dist = Math.abs(enemy.x - aiUnit.x) + Math.abs(enemy.y - aiUnit.y);
        if (dist < minDistance) {
          minDistance = dist;
          targetEnemy = enemy;
        }
      });
    }

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
          if (reservedTiles.includes(`${tempX},${tempY}`)) {
            break; 
          }

          targetX = tempX;
          targetY = tempY;
          steps++;
        }
        
        orders.push({ unitId: aiUnit.id, type: 'move', target: { x: targetX, y: targetY } });
      }
    }
  });

  return orders;
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
      if (u.originalAttack) u.attack = u.originalAttack;
      if (u.originalDefense) u.defense = u.originalDefense;
      if (u.originalSpeed) u.speed = u.originalSpeed;
      if (u.originalMaxHp) u.maxHp = u.originalMaxHp;
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

  // 1. 후퇴(Retreat) 먼저 처리 (즉각 대기 및 체력 100% 회복 청구)
  orders.filter(o => o.type === 'retreat').forEach(order => {
    const unit = units.find(u => u.id === order.unitId);
    if (unit) {
      unit.status = 'standby'; // 대기 상태로 전환
      if (unit.hp < (unit.maxHp || 100)) {
        const max = unit.maxHp || 100;
        const missingRatio = (max - unit.hp) / max;
        unit.hp = max; // 일단 풀피 회복
        
        // 회복 비용 청구서 (UI에 넘김 - UI에서 자원 부족시 취소 처리 로직 필요)
        session.resourceDeductions.push({
          owner: unit.owner,
          manpower: Math.floor((unit.manpowerCost || 0) * missingRatio),
          weapons: (unit.requiredWeapons || []).map(w => ({ name: w.weaponName, amount: Math.max(1, Math.floor(w.amount * missingRatio)) }))
        });
      }
    }
  });

  // 2. 이동(Move) 타겟 수집
  const moveOrders = orders.filter(o => o.type === 'move' && units.find(u => u.id === o.unitId)?.status === 'field');
  const targetMap = {}; 

  moveOrders.forEach(order => {
    const unit = units.find(u => u.id === order.unitId);
    if (!unit) return;
    
    const actualTarget = calculateActualPath(unit, order.target.x, order.target.y, board, units);
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
        occupant.hqHitsRemaining = (occupant.hqHitsRemaining || 2) - 1; // 사령부는 1타격만 입음
      } else {
        const dmgToOccupant = calculateDamage(winner.unit.attack, occupant.defense, session.penetration[winner.unit.owner] || 0);
        occupant.hp -= dmgToOccupant;
      }

      if (winner.unit.isHQ) {
         // 사령부는 공격력이 없으므로 반격 피해 없음
      } else {
        const dmgToWinner = calculateDamage(occupant.attack, winner.unit.defense, session.penetration[occupant.owner] || 0);
        winner.unit.hp -= dmgToWinner;
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
          const dmg = calculateDamage(unit.attack, targetUnit.defense, session.penetration[unit.owner] || 0);
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

  // 6. 대기 상태(Standby) 체력 회복 및 자원 소모 청구
  units.forEach(u => {
    const hasOrder = orders.some(o => o.unitId === u.id);
    if (!hasOrder && u.status === 'field' && u.hp < (u.maxHp || 100)) {
      const max = u.maxHp || 100;
      const healAmount = Math.max(1, Math.floor(max * 0.1)); // 10% 회복
      u.hp = Math.min(max, u.hp + healAmount);
      
      // 회복 비용 청구서 (UI에 넘김)
      session.resourceDeductions.push({
        owner: u.owner,
        manpower: Math.floor((u.manpowerCost || 0) * 0.1),
        weapons: (u.requiredWeapons || []).map(w => ({ name: w.weaponName, amount: Math.max(1, Math.floor(w.amount * 0.1)) }))
      });
    }
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

  // 1. 독가스 필드 도트 데미지 적용 (피아 구분 없음)
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      if (board[y][x].poisoned) {
        const unit = units.find(u => u.x === x && u.y === y && u.status === 'field');
        if (unit && !unit.isHQ) {
          // 최대체력의 10% (1할) 깎아먹음
          const dmg = Math.max(1, Math.floor((unit.maxHp || unit.hp) * 0.1));
          unit.hp -= dmg;
        }
      }
    }
  }

  if (!skillsQueue || skillsQueue.length === 0) return session;

  // 2. 예약된 스킬들 즉발 처리
  skillsQueue.forEach(skill => {
    // ---- [AA 요격 판정] 폭격, CAS, 핵투발의 경우 상대 대공능력과 다이스 경합 ----
    let intercepted = false;
    if (['bombing', 'cas', 'nuke'].includes(skill.type)) {
      const targetUnit = units.find(u => u.x === skill.target.x && u.y === skill.target.y && u.status === 'field');
      // 타겟에 유닛이 없더라도 일단 적국의 기본 대공능력으로 방어 시도한다고 가정 (또는 타겟 유닛의 소유주)
      const defenderId = targetUnit ? targetUnit.owner : 'enemy'; 
      const defenderAA = antiAir[defenderId] || 0;
      
      let aircraftSpeed = 3; // 기본 항공기 속도
      const myAircrafts = units.filter(u => u.owner !== defenderId && u.status === 'field');
      
      if (skill.type === 'bombing' || skill.type === 'nuke') {
        const bomber = myAircrafts.find(u => u.subCategory === '폭격기' || u.subCategory === '핵무기');
        if (bomber && bomber.speed) aircraftSpeed = bomber.speed;
      } else if (skill.type === 'cas') {
        const casUnit = myAircrafts.find(u => u.subCategory === '근접항공지원기');
        if (casUnit && casUnit.speed) aircraftSpeed = casUnit.speed;
      }
      
      intercepted = calculateAirInterception(defenderAA, aircraftSpeed);
    }
    
    // 요격당한 경우 데미지 적용 건너뜀
    if (intercepted) {
      console.log(`[AA 요격 성공] ${skill.type} 스킬이 요격되어 무효화되었습니다.`);
      return; 
    }

    if (skill.type === 'poison') {
      board[skill.target.y][skill.target.x].poisoned = true;
    } 
    else if (skill.type === 'missile' || skill.type === 'cas') {
      const unit = units.find(u => u.x === skill.target.x && u.y === skill.target.y && u.status === 'field');
      if (unit && !unit.isHQ) {
        unit.hp -= skill.damage;
      }
    }
    else if (skill.type === 'nuke' || skill.type === 'nuke_missile' || skill.type === 'bombing' || skill.type === 'naval_bombardment') {
      // 3x3 범위 처리
      const targetArea = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
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
    // EMP는 턴 처리 전에 모든 기계화 이동/스킬 큐를 막는 로직으로 별도 사전 적용됨
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
