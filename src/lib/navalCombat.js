/**
 * Naval combat engine (20x20)
 * - Fleet-level turn resolution
 * - Slot-based occupancy with orientation
 * - Admiral AI fallback and direct-control friendly AI routing
 */

export const NAVAL_TILE_TYPES = {
  SEA: '해역'
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
      attack: { x: target.x, y: target.y }
    };

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

  // Attack phase: hit only if target tile is occupied at attack resolution time.
  for (const ship of fieldShips) {
    const order = orderMap.get(ship.id);
    if (!order || !order.attack) continue;

    const victim = units.find(u => {
      if (u.status !== 'field' || u.owner === ship.owner || u.majorCategory !== '해군') return false;
      return getOccupiedTiles(u).some(t => t.x === order.attack.x && t.y === order.attack.y);
    });

    if (!victim) continue;

    let damage = Math.max(1, ship.attack || 1);
    if ((ship.subCategory || '').includes('구축함')) {
      damage = Math.max(1, Math.floor(damage * 0.5));
    }

    victim.hp = Math.max(0, (victim.hp || victim.maxHp || 100) - damage);
    if (victim.hp <= 0) {
      victim.status = 'destroyed';
    }
  }

  return {
    ...session,
    board,
    units,
    orders: []
  };
}
