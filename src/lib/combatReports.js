import { getDataEntry, upsertDataEntry } from '@/lib/store';

export async function appendCombatReport(report) {
  const entry = await getDataEntry('combat_reports', null);
  const reports = entry?.data?.reports || [];
  const next = [{
    id: `report_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    ...report
  }, ...reports];
  await upsertDataEntry('combat_reports', null, { reports: next });
}

export function summarizeNavalLosses(units) {
  const byOwner = {};
  (units || []).forEach((u) => {
    const owner = u.owner || 'unknown';
    if (!byOwner[owner]) {
      byOwner[owner] = { shipsDestroyed: 0, shipsDamaged: 0, hpLoss: 0 };
    }

    const maxHp = u.maxHp || u.hp || 100;
    const currentHp = u.status === 'destroyed' ? 0 : Math.max(0, u.hp || 0);
    const loss = Math.max(0, maxHp - currentHp);
    if (loss > 0) {
      byOwner[owner].hpLoss += loss;
      if (u.status === 'destroyed') byOwner[owner].shipsDestroyed += 1;
      else byOwner[owner].shipsDamaged += 1;
    }
  });
  return byOwner;
}

export function decideWinnerByRemainingHp(units, owners) {
  const score = {};
  (owners || []).forEach((o) => { score[o] = 0; });

  (units || []).forEach((u) => {
    if (!score[u.owner]) score[u.owner] = 0;
    if (u.status === 'destroyed') return;
    if (u.isHQ) return;
    score[u.owner] += Math.max(0, u.hp || 0);
  });

  let bestOwner = null;
  let best = -1;
  Object.entries(score).forEach(([owner, value]) => {
    if (value > best) {
      best = value;
      bestOwner = owner;
    }
  });

  return { winner: bestOwner, score };
}
