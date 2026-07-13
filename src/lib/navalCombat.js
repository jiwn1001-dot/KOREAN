/**
 * Naval combat engine (20x20)
 * - Fleet-level turn resolution
 * - Slot-based occupancy with orientation
 * - Admiral AI fallback and direct-control friendly AI routing
 */

export const NAVAL_TILE_TYPES = {
  SEA: '해역',
  SHALLOW: '천해',
  REEF: '암초',
  ISLAND: '도서',
  STORM: '폭풍해역'
};

const DIRS = {
  N: { x: 0, y: -1 },
  NE: { x: 1, y: -1 },
  E: { x: 1, y: 0 },
  SE: { x: 1, y: 1 },
  S: { x: 0, y: 1 },
  SW: { x: -1, y: 1 },
  W: { x: -1, y: 0 },
  NW: { x: -1, y: -1 }
};

export function createNavalBoard(size = 20) {
  const board = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      row.push({ x, y, type: NAVAL_TILE_TYPES.SEA });
    }
    board.push(row);
  }
  return board;
}

export function getSlotCount(unit) {
  return Math.max(1, parseInt(unit.slotCount || unit.slot || unit.slots || 1, 10));
}

export function isSubmarine(unit) {
  const sub = unit?.subCategory || unit?.minorCategory || '';
  return sub.includes('잠수함');
}

export function getOccupiedTiles(unit) {
  const len = getSlotCount(unit);
  const orientation = unit.orientation === 'vertical' ? 'vertical' : 'horizontal';
  const tiles = [];
  for (let i = 0; i < len; i++) {
    const x = unit.x + (orientation === 'horizontal' ? i : 0);
    const y = unit.y + (orientation === 'vertical' ? i : 0);
    tiles.push({ x, y });
  }
  return tiles;
}

function inBounds(x, y, size = 20) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

function canOverlap(u1, u2) {
  // Submarines can overlap with non-submarines.
  if (!u1 || !u2) return false;
  return isSubmarine(u1) !== isSubmarine(u2);
}

export function canPlaceNavalUnit(units, candidate, size = 20) {
  const candidateTiles = getOccupiedTiles(candidate);
  if (candidateTiles.some(t => !inBounds(t.x, t.y, size))) return false;

  const fieldUnits = units.filter(u => u.status === 'field' && u.id !== candidate.id);
  for (const existing of fieldUnits) {
    const existingTiles = getOccupiedTiles(existing);
    for (const ct of candidateTiles) {
      if (existingTiles.some(et => et.x === ct.x && et.y === ct.y)) {
        if (!canOverlap(candidate, existing)) return false;
      }
    }
  }

  return true;
}

function intersectsTiles(a, b) {
  return a.some(x => b.some(y => x.x === y.x && x.y === y.y));
}

function shipTilesMap(units) {
  const map = [];
  units.forEach(u => {
    if (u.status !== 'field' || u.majorCategory !== '해군') return;
    map.push({ unit: u, tiles: getOccupiedTiles(u) });
  });
  return map;
}

function addDamage(target, amount) {
  if (!target || target.status !== 'field') return;
  const dmg = Math.max(1, parseInt(amount || 1, 10));
  target.hp = Math.max(0, (target.hp || target.maxHp || 100) - dmg);
  if (target.hp <= 0) target.status = 'destroyed';
}

function computeNavalDamage(baseDamage, actionType, attackerType, targetType) {
  let multiplier = 1;

  // Weapon vs hull class tuning.
  if (actionType === 'gunfire') {
    if (targetType === 'battleship') multiplier *= 0.85;
    if (targetType === 'carrier') multiplier *= 1.2;
    if (attackerType === 'battleship') multiplier *= 1.15;
  } else if (actionType === 'torpedo') {
    if (targetType === 'carrier' || targetType === 'battleship') multiplier *= 1.35;
    if (targetType === 'destroyer' || targetType === 'modern_destroyer') multiplier *= 0.85;
    if (attackerType === 'submarine' || attackerType === 'modern_submarine' || attackerType === 'torpedo_boat') multiplier *= 1.1;
  } else if (actionType === 'depth_charge') {
    if (targetType === 'submarine' || targetType === 'modern_submarine') multiplier *= 1.8;
    else multiplier *= 0.6;
  } else if (actionType === 'missile') {
    if (targetType === 'carrier' || targetType === 'battleship') multiplier *= 1.25;
    if (targetType === 'submarine' || targetType === 'modern_submarine') multiplier *= 0.8;
    if (attackerType === 'modern_destroyer' || attackerType === 'modern_submarine' || attackerType === 'carrier') multiplier *= 1.1;
  } else if (actionType === 'mine') {
    if (targetType === 'carrier' || targetType === 'battleship') multiplier *= 1.2;
    if (targetType === 'submarine' || targetType === 'modern_submarine') multiplier *= 0.85;
  } else if (actionType === 'torpedo_bomber') {
    if (targetType === 'carrier' || targetType === 'battleship') multiplier *= 1.3;
    if (targetType === 'modern_destroyer') multiplier *= 0.9;
  }

  return Math.max(1, Math.floor((baseDamage || 1) * multiplier));
}

function getShipType(unit) {
  const sub = unit?.subCategory || unit?.minorCategory || '';
  if (sub.includes('기뢰부설함')) return 'minelayer';
  if (sub.includes('어뢰정')) return 'torpedo_boat';
  if (sub.includes('현대잠수함')) return 'modern_submarine';
  if (sub.includes('잠수함')) return 'submarine';
  if (sub.includes('현대구축함')) return 'modern_destroyer';
  if (sub.includes('구축함')) return 'destroyer';
  if (sub.includes('전함')) return 'battleship';
  if (sub.includes('항공모함')) return 'carrier';
  return 'ship';
}

function isSubDetectedByOwner(targetSub, ownerId, units) {
  if (!isSubmarine(targetSub)) return true;
  const myShips = units.filter(u => u.owner === ownerId && u.status === 'field' && u.majorCategory === '해군');
  return myShips.some(u => {
    const detectRadius = Math.floor((u.vision || 0) / 3);
    if (detectRadius <= 0) return false;
    return getOccupiedTiles(targetSub).some(t => Math.max(Math.abs(u.x - t.x), Math.abs(u.y - t.y)) <= detectRadius);
  });
}

export function getVisibleNavalUnits(units, viewerId) {
  const myShips = units.filter(u => u.owner === viewerId && u.status === 'field' && u.majorCategory === '해군');
  const visible = new Set();

  myShips.forEach(u => {
    // 관측력 0=>3x3(9칸), 1=>5x5(25칸), 2=>7x7(49칸)
    const vision = Math.max(1, Number(u.vision || 0) + 1);
    for (let dy = -vision; dy <= vision; dy++) {
      for (let dx = -vision; dx <= vision; dx++) {
        visible.add(`${u.x + dx},${u.y + dy}`);
      }
    }
  });

  const detectedSubs = new Set();
  myShips.forEach(u => {
    const detectRadius = Math.floor((u.vision || 0) / 3);
    if (detectRadius <= 0) return;
    for (let dy = -detectRadius; dy <= detectRadius; dy++) {
      for (let dx = -detectRadius; dx <= detectRadius; dx++) {
        detectedSubs.add(`${u.x + dx},${u.y + dy}`);
      }
    }
  });

  return units.filter(u => {
    if (u.status !== 'field' || u.majorCategory !== '해군') return false;
    if (u.owner === viewerId) return true;
    const tiles = getOccupiedTiles(u);
    if (!isSubmarine(u)) {
      return tiles.some(t => visible.has(`${t.x},${t.y}`));
    }
    return tiles.some(t => detectedSubs.has(`${t.x},${t.y}`));
  });
}

function chebyshevStep(fromX, fromY, toX, toY, speed) {
  let x = fromX;
  let y = fromY;
  let left = Math.max(1, parseInt(speed || 1, 10));

  while (left-- > 0 && (x !== toX || y !== toY)) {
    if (x < toX) x += 1;
    else if (x > toX) x -= 1;

    if (y < toY) y += 1;
    else if (y > toY) y -= 1;
  }

  return { x, y };
}

function chebyshevStepAway(fromX, fromY, threatX, threatY, speed, size = 20) {
  let x = fromX;
  let y = fromY;
  let left = Math.max(1, parseInt(speed || 1, 10));

  while (left-- > 0) {
    if (x < threatX) x -= 1;
    else if (x > threatX) x += 1;

    if (y < threatY) y -= 1;
    else if (y > threatY) y += 1;

    x = Math.max(0, Math.min(size - 1, x));
    y = Math.max(0, Math.min(size - 1, y));
  }

  return { x, y };
}

function nearestEnemy(unit, enemies) {
  let best = null;
  let bestDist = Infinity;
  for (const e of enemies) {
    const d = Math.max(Math.abs(unit.x - e.x), Math.abs(unit.y - e.y));
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

export function calculateNavalAIOrders(session, aiCountryId, manualControlIds = [], flagshipId = null) {
  const units = session.units || [];
  const manualSet = new Set(manualControlIds || []);
  const manualOrderTargets = new Set((session.manualOrders || []).map(o => `${o?.action?.target?.x},${o?.action?.target?.y}`));

  const myShips = units.filter(u => u.owner === aiCountryId && u.status === 'field' && u.majorCategory === '해군');
  const aiShips = myShips.filter(u => !manualSet.has(u.id));
  const enemies = units.filter(u => u.owner !== aiCountryId && u.status === 'field' && u.majorCategory === '해군');

  const manualShips = myShips.filter(u => manualSet.has(u.id));
  const manualTiles = manualShips.flatMap(getOccupiedTiles).map(t => `${t.x},${t.y}`);
  const occupiedByAi = new Set();

  const aiLevel = Math.max(1, Math.round(
    aiShips.reduce((acc, s) => acc + parseInt(s.aiLevel || 1, 10), 0) / Math.max(1, aiShips.length)
  ));

  const hpRatio = (u) => (u.hp || 0) / (u.maxHp || 100);
  const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const getPriority = (u) => {
    const t = getShipType(u);
    if (t === 'carrier') return 5;
    if (t === 'battleship') return 4;
    if (t === 'modern_destroyer' || t === 'destroyer') return 3;
    if (t === 'modern_submarine' || t === 'submarine') return 2;
    return 1;
  };

  const chooseTarget = (ship) => {
    if (!enemies.length) return null;
    const shipType = getShipType(ship);

    if (shipType === 'carrier') {
      const prioritized = enemies.slice().sort((a, b) => {
        const pa = getPriority(a);
        const pb = getPriority(b);
        if (pb !== pa) return pb - pa;
        return distance(ship, a) - distance(ship, b);
      });
      return prioritized[0] || nearestEnemy(ship, enemies);
    }

    if (aiLevel <= 1) return nearestEnemy(ship, enemies);
    if (aiLevel === 2) {
      return enemies.slice().sort((a, b) => hpRatio(a) - hpRatio(b))[0] || nearestEnemy(ship, enemies);
    }
    return enemies.slice().sort((a, b) => {
      const pa = getPriority(a);
      const pb = getPriority(b);
      if (pb !== pa) return pb - pa;
      const da = distance(ship, a);
      const db = distance(ship, b);
      return da - db;
    })[0] || nearestEnemy(ship, enemies);
  };

  const orders = [];
  for (const ship of aiShips) {
    const shipType = getShipType(ship);
    const target = chooseTarget(ship);
    if (!target) continue;

    const d = distance(ship, target);
    const moved = shipType === 'carrier' && d <= 4
      ? chebyshevStepAway(ship.x, ship.y, target.x, target.y, ship.speed || 1)
      : chebyshevStep(ship.x, ship.y, target.x, target.y, ship.speed || 1);
    const movedKey = `${moved.x},${moved.y}`;
    const moveBlockedByManual = manualTiles.includes(movedKey) || occupiedByAi.has(movedKey);

    const order = {
      unitId: ship.id,
      move: moveBlockedByManual ? null : { x: moved.x, y: moved.y },
      action: {
        type: 'gunfire',
        target: { x: target.x, y: target.y },
        direction: target.x >= ship.x ? 'E' : 'W',
        targetShipId: target.id
      }
    };

    if (shipType === 'torpedo_boat' || shipType === 'submarine' || shipType === 'modern_submarine') {
      order.action.type = 'torpedo';
    }

    if (manualOrderTargets.has(`${order?.action?.target?.x},${order?.action?.target?.y}`)) {
      order.action = null;
    }
    if (shipType === 'destroyer' || shipType === 'modern_destroyer') {
      const subTargetNearby = enemies.some(e => isSubmarine(e) && distance(ship, e) <= 2);
      if (subTargetNearby) {
        order.action.type = 'depth_charge';
      } else if (aiLevel >= 3 && d <= 2) {
        order.action.type = 'torpedo';
      } else {
        order.action.type = 'gunfire';
      }
    }
    if (shipType === 'modern_destroyer' || shipType === 'modern_submarine') {
      if (aiLevel >= 2 && d >= 4) {
        order.action.type = 'missile';
      }
    }
    if (shipType === 'minelayer') {
      if (d <= 3) {
        order.action.type = 'torpedo';
      } else {
        order.action.type = 'mine';
        order.action.target = { x: ship.x, y: ship.y };
      }
    }
    if (shipType === 'battleship') {
      order.action.type = 'gunfire';
    }
    if (shipType === 'carrier') {
      if (d >= 4 && aiLevel >= 2) {
        order.action.type = 'missile';
      } else if (d <= 2) {
        order.action.type = 'gunfire';
      } else {
        order.action.type = aiLevel >= 3 ? 'missile' : 'gunfire';
      }
    }

    if (flagshipId && ship.id === flagshipId) {
      // Flagship is still AI-controlled when not direct-controlled, but keep it slightly safer.
      if (!moveBlockedByManual && aiLevel >= 3 && d <= 2) {
        order.move = null;
      }
    }

    if (order.move) occupiedByAi.add(`${order.move.x},${order.move.y}`);

    orders.push(order);
  }

  return orders;
}

export function resolveNavalTurn(session) {
  const board = session.board || createNavalBoard();
  const units = JSON.parse(JSON.stringify(session.units || []));
  const orders = session.orders || [];
  const skillsQueue = session.skillsQueue || [];
  const mines = JSON.parse(JSON.stringify(session.mines || []));
  const pendingMissiles = JSON.parse(JSON.stringify(session.pendingMissiles || []));
  const rammingLogs = [...(session.rammingLogs || [])];

  const isTeam1Owner = (ownerId) => {
    if (session.isTeamBattle) {
      return (session.team1 || []).includes(ownerId);
    }
    return ownerId === session.host;
  };

  const getCarrierCount = (ownerId) => units.filter(u => u.owner === ownerId && u.status === 'field' && getShipType(u) === 'carrier').length;
  const team1AirEnabled = session.allowAirTeam1 !== false;
  const team2AirEnabled = session.allowAirTeam2 !== false;
  const canUseAir = (ownerId, usedSortiesByOwner) => {
    const team1 = isTeam1Owner(ownerId);
    const enabled = team1 ? team1AirEnabled : team2AirEnabled;
    if (enabled) return true;
    const limit = getCarrierCount(ownerId);
    return (usedSortiesByOwner[ownerId] || 0) < limit;
  };

  const orderMap = new Map();
  orders.forEach(o => orderMap.set(o.unitId, o));

  const fieldShips = units
    .filter(u => u.status === 'field' && u.majorCategory === '해군')
    .sort((a, b) => (b.speed || 1) - (a.speed || 1));

  const movedReservations = [];

  for (const ship of fieldShips) {
    const order = orderMap.get(ship.id);
    if (!order || !order.move) continue;
    if (ship.status !== 'field') continue;

    const target = chebyshevStep(ship.x, ship.y, order.move.x, order.move.y, ship.speed || 1);
    const candidate = { ...ship, x: target.x, y: target.y };
    const candidateTiles = getOccupiedTiles(candidate);

    const others = units.filter(u => u.id !== ship.id && u.status === 'field' && u.majorCategory === '해군');
    const collisionWithUnits = !canPlaceNavalUnit(others, candidate, board.length || 20);
    const collisionWithReserved = movedReservations.some(t => getOccupiedTiles(candidate).some(c => c.x === t.x && c.y === t.y));

    if (!collisionWithUnits && !collisionWithReserved) {
      ship.x = target.x;
      ship.y = target.y;
      movedReservations.push(...getOccupiedTiles(ship));
      continue;
    }

    // 충각 판정: 같은 타일 점유 충돌 시 체력 높은 유닛이 생존
    const collidedUnits = others.filter(u => {
      const ot = getOccupiedTiles(u);
      return ot.some(t => candidateTiles.some(c => c.x === t.x && c.y === t.y));
    });

    if (!collidedUnits.length) continue;

    // 다중 충돌 시 현재 위치 기준으로 가까운 대상부터 처리
    collidedUnits.sort((a, b) => {
      const da = Math.max(Math.abs(a.x - target.x), Math.abs(a.y - target.y));
      const db = Math.max(Math.abs(b.x - target.x), Math.abs(b.y - target.y));
      return da - db;
    });

    let movingShipAlive = ship.status === 'field';
    for (const defender of collidedUnits) {
      if (!movingShipAlive || defender.status !== 'field') continue;

      const attackerHp = Math.max(0, Number(ship.hp || ship.maxHp || 0));
      const defenderHp = Math.max(0, Number(defender.hp || defender.maxHp || 0));

      if (attackerHp === defenderHp) {
        // 동체력은 우위가 없으므로 기존처럼 이동 실패 처리
        rammingLogs.push(`충각 실패: ${ship.name || ship.id} 와 ${defender.name || defender.id} 체력이 동일하여 밀어내지 못했습니다.`);
        movingShipAlive = false;
        break;
      }

      if (attackerHp > defenderHp) {
        defender.hp = 0;
        defender.status = 'destroyed';
        ship.hp = Math.max(0, attackerHp - defenderHp);
        rammingLogs.push(`충각 성공: ${ship.name || ship.id} 가 ${defender.name || defender.id} 를 격침 (자가 피해 ${defenderHp})`);
        if (ship.hp <= 0) {
          ship.status = 'destroyed';
          movingShipAlive = false;
          rammingLogs.push(`충각 동귀어진: ${ship.name || ship.id} 도 피해 누적으로 격침되었습니다.`);
          break;
        }
      } else {
        ship.hp = 0;
        ship.status = 'destroyed';
        defender.hp = Math.max(0, defenderHp - attackerHp);
        rammingLogs.push(`충각 실패: ${ship.name || ship.id} 가 ${defender.name || defender.id} 에 밀려 격침 (상대 피해 ${attackerHp})`);
        if (defender.hp <= 0) defender.status = 'destroyed';
        movingShipAlive = false;
        break;
      }
    }

    if (movingShipAlive && ship.status === 'field') {
      ship.x = target.x;
      ship.y = target.y;
      movedReservations.push(...getOccupiedTiles(ship));
    }
  }

  // Mine trigger phase after movement.
  fieldShips.forEach(ship => {
    if (ship.status !== 'field') return;
    const myTiles = getOccupiedTiles(ship);
    const hitMine = mines.find(m => myTiles.some(t => t.x === m.x && t.y === m.y) && m.owner !== ship.owner);
    if (!hitMine) return;

    if (isSubmarine(ship)) {
      // Submarine can sweep mine by stepping on it.
      const idx = mines.findIndex(m => m.id === hitMine.id);
      if (idx >= 0) mines.splice(idx, 1);
      return;
    }

    addDamage(ship, hitMine.damage || 1);
    const idx = mines.findIndex(m => m.id === hitMine.id);
    if (idx >= 0) mines.splice(idx, 1);
  });

  // Delayed missile hit phase (locks target ship id, guaranteed next turn).
  pendingMissiles.forEach(ms => {
    const target = units.find(u => u.id === ms.targetShipId && u.status === 'field');
    if (target) {
      const targetType = getShipType(target);
      const dmg = computeNavalDamage(ms.damage || 1, 'missile', ms.launcherType || 'ship', targetType);
      addDamage(target, dmg);
    }
  });
  pendingMissiles.length = 0;

  // Naval skill phase (torpedo bomber, etc.)
  const usedSortiesByOwner = {};
  skillsQueue.forEach(skill => {
    if (!skill || !skill.type) return;

    if (skill.type === 'torpedo_bomber') {
      const ownerId = skill.attackerId;
      if (!ownerId || !canUseAir(ownerId, usedSortiesByOwner)) return;

      const consumer = units.find(u => u.id === skill.consumerId && u.status !== 'destroyed');
      if (!consumer) return;

      const dir = DIRS[skill.direction] || DIRS.E;
      let cx = skill.target?.x;
      let cy = skill.target?.y;
      let hit = null;
      for (let i = 0; i < (board.length || 20); i++) {
        cx += dir.x;
        cy += dir.y;
        if (!inBounds(cx, cy, board.length || 20)) break;
        const candidate = units.find(u => u.status === 'field' && u.owner !== ownerId && u.majorCategory === '해군' && getOccupiedTiles(u).some(t => t.x === cx && t.y === cy));
        if (candidate) {
          hit = candidate;
          break;
        }
      }
      if (hit) {
        const dmg = computeNavalDamage(skill.damage || 1, 'torpedo_bomber', 'carrier', getShipType(hit));
        addDamage(hit, dmg);
      }

      usedSortiesByOwner[ownerId] = (usedSortiesByOwner[ownerId] || 0) + 1;
      consumer.hp = 0;
      consumer.status = 'destroyed';
    }
  });

  // Attack phase: hit only if target tile is occupied at attack resolution time.
  for (const ship of fieldShips) {
    const order = orderMap.get(ship.id);
    if (!order || !order.action) continue;

    const shipType = getShipType(ship);
    const action = order.action;
    const selfAttack = Math.max(1, ship.attack || 1);

    const enemyShips = units.filter(u => u.status === 'field' && u.owner !== ship.owner && u.majorCategory === '해군');
    const allShipsMap = shipTilesMap(units);

    const direction = DIRS[action.direction] || DIRS.E;

    if (action.type === 'mine') {
      const tx = action.target?.x ?? ship.x;
      const ty = action.target?.y ?? ship.y;
      if (inBounds(tx, ty, board.length || 20) && !mines.some(m => m.x === tx && m.y === ty)) {
        mines.push({
          id: `mine_${ship.id}_${Date.now()}`,
          owner: ship.owner,
          x: tx,
          y: ty,
          damage: computeNavalDamage(selfAttack, 'mine', shipType, null)
        });
      }
      continue;
    }

    if (action.type === 'mine_sweep') {
      const tx = action.target?.x ?? ship.x;
      const ty = action.target?.y ?? ship.y;
      const idx = mines.findIndex(m => m.x === tx && m.y === ty);
      if (idx >= 0) mines.splice(idx, 1);
      continue;
    }

    if (action.type === 'missile') {
      if (action.targetShipId) {
        const target = units.find(u => u.id === action.targetShipId && u.status === 'field');
        if (target && isSubmarine(target) && !isSubDetectedByOwner(target, ship.owner, units)) {
          continue;
        }
        pendingMissiles.push({
          id: `ms_${ship.id}_${Date.now()}`,
          owner: ship.owner,
          targetShipId: action.targetShipId,
          damage: selfAttack,
          launcherType: shipType
        });
      }
      continue;
    }

    if (action.type === 'torpedo' || action.type === 'depth_charge') {
      let cx = ship.x;
      let cy = ship.y;
      let hit = null;
      for (let i = 0; i < (board.length || 20); i++) {
        cx += direction.x;
        cy += direction.y;
        if (!inBounds(cx, cy, board.length || 20)) break;
        const candidate = allShipsMap.find(s => s.unit.owner !== ship.owner && s.unit.status === 'field' && s.tiles.some(t => t.x === cx && t.y === cy));
        if (!candidate) continue;
        if (action.type === 'depth_charge' && !isSubmarine(candidate.unit)) continue;
        if (action.type === 'torpedo' && action.onlySubmarineTargets && !isSubmarine(candidate.unit)) continue;
        if (isSubmarine(candidate.unit) && !isSubDetectedByOwner(candidate.unit, ship.owner, units) && action.type !== 'depth_charge') continue;
        hit = candidate.unit;
        break;
      }
      if (hit) {
        const dmg = computeNavalDamage(selfAttack, action.type, shipType, getShipType(hit));
        addDamage(hit, dmg);
      }
      continue;
    }

    if (action.type === 'gunfire') {
      const tx = action.target?.x;
      const ty = action.target?.y;
      const victim = enemyShips.find(u => getOccupiedTiles(u).some(t => t.x === tx && t.y === ty));
      if (!victim) continue;
      if (isSubmarine(victim)) continue; // 함포는 잠수함 타격 불가

      let damage = selfAttack;
      if (shipType === 'destroyer' || shipType === 'modern_destroyer') {
        damage = Math.max(1, Math.floor(selfAttack * 0.5));
      }
      damage = computeNavalDamage(damage, 'gunfire', shipType, getShipType(victim));
      addDamage(victim, damage);
    }
  }

  return {
    ...session,
    board,
    units,
    mines,
    pendingMissiles,
    rammingLogs: rammingLogs.slice(-40),
    skillsQueue: [],
    orders: []
  };
}
