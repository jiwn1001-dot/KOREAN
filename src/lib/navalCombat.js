/**
 * Naval combat engine (20x20)
 * - Fleet-level turn resolution
 * - Slot-based occupancy with orientation
 * - Admiral AI fallback and direct-control friendly AI routing
 */

export const NAVAL_TILE_TYPES = {
  SEA: '해역'
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

export function getVisibleNavalUnits(units, viewerId) {
  const myShips = units.filter(u => u.owner === viewerId && u.status === 'field' && u.majorCategory === '해군');
  const visible = new Set();

  myShips.forEach(u => {
    const vision = Math.max(1, 1 + (u.vision || 0));
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

  const myShips = units.filter(u => u.owner === aiCountryId && u.status === 'field' && u.majorCategory === '해군');
  const aiShips = myShips.filter(u => !manualSet.has(u.id));
  const enemies = units.filter(u => u.owner !== aiCountryId && u.status === 'field' && u.majorCategory === '해군');

  const manualShips = myShips.filter(u => manualSet.has(u.id));
  const manualTiles = manualShips.flatMap(getOccupiedTiles).map(t => `${t.x},${t.y}`);

  const orders = [];
  for (const ship of aiShips) {
    const target = nearestEnemy(ship, enemies);
    if (!target) continue;

    const moved = chebyshevStep(ship.x, ship.y, target.x, target.y, ship.speed || 1);
    const moveBlockedByManual = manualTiles.includes(`${moved.x},${moved.y}`);

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

    const shipType = getShipType(ship);
    if (shipType === 'torpedo_boat' || shipType === 'submarine' || shipType === 'modern_submarine') {
      order.action.type = 'torpedo';
    }
    if (shipType === 'destroyer' || shipType === 'modern_destroyer') {
      if (Math.random() < 0.25) {
        order.action.type = 'depth_charge';
      } else if (Math.random() < 0.2) {
        order.action.type = 'mine';
        order.action.target = { x: ship.x, y: ship.y };
      } else if (Math.random() < 0.2) {
        order.action.type = 'torpedo';
      } else {
        order.action.type = 'gunfire';
      }
    }
    if (shipType === 'modern_destroyer' || shipType === 'modern_submarine') {
      if (Math.random() < 0.2) {
        order.action.type = 'missile';
      }
    }
    if (shipType === 'minelayer') {
      order.action.type = Math.random() < 0.7 ? 'mine' : 'torpedo';
      order.action.target = { x: ship.x, y: ship.y };
    }
    if (shipType === 'battleship') {
      order.action.type = 'gunfire';
    }

    if (flagshipId && ship.id === flagshipId) {
      // Flagship is still AI-controlled when not direct-controlled, but keep it slightly safer.
      if (!moveBlockedByManual && Math.random() < 0.3) {
        order.move = null;
      }
    }

    orders.push(order);
  }

  return orders;
}

export function resolveNavalTurn(session) {
  const board = session.board || createNavalBoard();
  const units = JSON.parse(JSON.stringify(session.units || []));
  const orders = session.orders || [];
  const mines = JSON.parse(JSON.stringify(session.mines || []));
  const pendingMissiles = JSON.parse(JSON.stringify(session.pendingMissiles || []));

  const orderMap = new Map();
  orders.forEach(o => orderMap.set(o.unitId, o));

  const fieldShips = units
    .filter(u => u.status === 'field' && u.majorCategory === '해군')
    .sort((a, b) => (b.speed || 1) - (a.speed || 1));

  const movedReservations = [];

  for (const ship of fieldShips) {
    const order = orderMap.get(ship.id);
    if (!order || !order.move) continue;

    const target = chebyshevStep(ship.x, ship.y, order.move.x, order.move.y, ship.speed || 1);
    const candidate = { ...ship, x: target.x, y: target.y };

    const others = units.filter(u => u.id !== ship.id && u.status === 'field' && u.majorCategory === '해군');
    const collisionWithUnits = !canPlaceNavalUnit(others, candidate, board.length || 20);
    const collisionWithReserved = movedReservations.some(t => getOccupiedTiles(candidate).some(c => c.x === t.x && c.y === t.y));

    if (!collisionWithUnits && !collisionWithReserved) {
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
    if (target) addDamage(target, ms.damage || 1);
  });
  pendingMissiles.length = 0;

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
          damage: selfAttack
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
        pendingMissiles.push({
          id: `ms_${ship.id}_${Date.now()}`,
          owner: ship.owner,
          targetShipId: action.targetShipId,
          damage: selfAttack
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
        hit = candidate.unit;
        break;
      }
      if (hit) addDamage(hit, selfAttack);
      continue;
    }

    if (action.type === 'gunfire') {
      const tx = action.target?.x;
      const ty = action.target?.y;
      const victim = enemyShips.find(u => getOccupiedTiles(u).some(t => t.x === tx && t.y === ty));
      if (!victim) continue;

      let damage = selfAttack;
      if (shipType === 'destroyer' || shipType === 'modern_destroyer') {
        damage = Math.max(1, Math.floor(selfAttack * 0.5));
      }
      addDamage(victim, damage);
    }
  }

  return {
    ...session,
    board,
    units,
    mines,
    pendingMissiles,
    orders: []
  };
}
