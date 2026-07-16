'use client';

import React, { useState } from 'react';
import { submitCardChoice, requestMajorAerialBattle, acceptMajorAerialBattle, declineMajorAerialBattle, surrenderAerialBattle, tacticalNuclearStrike, tacticalSupplyRaid } from '@/lib/aerialCombat';
import { saveAerialBattleSession } from '@/lib/store';
import { getDataEntry, upsertDataEntry } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import AerialCardUI from '@/components/AerialCardUI';

export default function AerialBattleUI({ battleSession, countryId, onUpdate }) {
  const [loading, setLoading] = useState(false);

  const isAttacker = battleSession.attackerId === countryId;
  const isDefender = battleSession.defenderId === countryId;
  
  if (!isAttacker && !isDefender) return null;

  const myState = isAttacker ? battleSession.attackerState : battleSession.defenderState;
  const enemyState = isAttacker ? battleSession.defenderState : battleSession.attackerState;

  if (!myState || !enemyState) return <div style={{ color: 'red' }}>배틀 데이터 로드 오류: 상태 정보를 찾을 수 없습니다.</div>;

  const myHand = myState.hand || [];
  const myAA = myState.antiAircraft || [];
  const myLost = myState.lost || [];
  
  const enemyHand = enemyState.hand || [];
  const enemyAA = enemyState.antiAircraft || [];
  const enemyLost = enemyState.lost || [];
  
  const myChoice = isAttacker ? battleSession.attackerChoice : battleSession.defenderChoice;
  const enemyChoice = isAttacker ? battleSession.defenderChoice : battleSession.attackerChoice;

  const isMyTurn = battleSession.status === 'active' && !myChoice;
  
  // 공중결전 제안 상태 확인
  const isMajorRequestedByMe = (isAttacker && battleSession.majorBattleRequest === 'requested_by_attacker') || 
                               (isDefender && battleSession.majorBattleRequest === 'requested_by_defender');
  const isMajorRequestedByEnemy = (isAttacker && battleSession.majorBattleRequest === 'requested_by_defender') || 
                                  (isDefender && battleSession.majorBattleRequest === 'requested_by_attacker');
  const isMajorBattle = battleSession.isMajorBattle;
  const myRole = isAttacker ? 'attacker' : 'defender';
  const didWin = battleSession.winner === myRole;
  const hasFullAirSupremacy = battleSession.status === 'finished' && didWin && (battleSession.isMajorBattle || battleSession.majorBattleRequest === 'declined');
  const myActionKeyPrefix = `${countryId}:`;
  const alreadyNuked = (battleSession.strategicActions || []).some(a => a.actorId === countryId && a.action === 'nuclear_strike');
  const alreadyRaided = (battleSession.strategicActions || []).some(a => a.actorId === countryId && a.action === 'supply_raid');

  const myAirUnits = isAttacker ? (battleSession.attackerUnits || []) : (battleSession.defenderUnits || []);

  const getMyBombers = () => {
    return (myAirUnits || []).filter((u) => {
      const n = String(u?.name || '');
      const sub = String(u?.subCategory || u?.minorCategory || '');
      return n.includes('폭격기') || sub.includes('폭격기');
    });
  };

  const withStrategicAction = (session, actionPayload) => {
    const next = JSON.parse(JSON.stringify(session));
    if (!Array.isArray(next.strategicActions)) next.strategicActions = [];
    next.strategicActions.push(actionPayload);
    next.history.push({
      round: next.round,
      reason: actionPayload.action,
      actorId: countryId,
      ...actionPayload,
      timestamp: new Date().toISOString()
    });
    return next;
  };

  const applyNuclearStrikeToCombatSessions = async (attackerId, defenderId, baseDamage) => {
    const latest = await getDataEntry('combat_sessions', null);
    const sessions = latest?.data?.sessions || [];
    const updated = sessions.map((s) => {
      if (s?.sessionCategory !== 'land') return s;
      if (s?.status === 'game_over' || s?.phase === 'game_over') return s;

      const allPlayers = Object.keys(s?.players || {});
      if (!allPlayers.includes(attackerId) || !allPlayers.includes(defenderId)) return s;

      const enemyUnits = (s.units || []).filter(u => u.owner === defenderId && u.status === 'field' && !u.isHQ);
      if (enemyUnits.length === 0) return s;

      const pivot = enemyUnits.sort((a, b) => Number(b.hp || b.maxHp || 0) - Number(a.hp || a.maxHp || 0))[0];
      const strike = tacticalNuclearStrike(defenderId, baseDamage);
      const radius = Math.max(1, Number(strike.radius || 2));

      const nextUnits = (s.units || []).map((u) => {
        if (u.owner !== defenderId || u.status !== 'field' || u.isHQ) return u;
        const d = Math.max(Math.abs(Number(u.x || 0) - Number(pivot.x || 0)), Math.abs(Number(u.y || 0) - Number(pivot.y || 0)));
        if (d > radius) return u;
        return { ...u, hp: 0, status: 'destroyed' };
      });

      return { ...s, units: nextUnits };
    });

    await upsertDataEntry('combat_sessions', null, { sessions: updated });
  };

  const applySupplyRaidToCombatSessions = async (attackerId, defenderId, bomberAttack) => {
    const latest = await getDataEntry('combat_sessions', null);
    const sessions = latest?.data?.sessions || [];
    const raid = tacticalSupplyRaid(defenderId, bomberAttack);
    const reduction = Math.max(1, Number(raid.supplyReduction || 1));

    const updated = sessions.map((s) => {
      if (s?.sessionCategory !== 'land') return s;
      if (s?.status === 'game_over' || s?.phase === 'game_over') return s;

      const players = s?.players || {};
      const playerIds = Object.keys(players);
      if (!playerIds.includes(attackerId) || !playerIds.includes(defenderId)) return s;

      const isDefTeam1 = s?.isTeamBattle ? (s.team1 || []).includes(defenderId) : s?.host === defenderId;
      if (isDefTeam1) {
        return { ...s, supplyLimitTeam1: Math.max(0, Number(s.supplyLimitTeam1 || 0) - reduction) };
      }
      return { ...s, supplyLimitTeam2: Math.max(0, Number(s.supplyLimitTeam2 || 0) - reduction) };
    });

    await upsertDataEntry('combat_sessions', null, { sessions: updated });
    return reduction;
  };

  const tryAutoRecoverAirUnits = async (session) => {
    let modified = false;
    const unitsToRecover = [...(session.attackerUnits || []), ...(session.defenderUnits || [])]
      .filter(u => u.status === 'destroyed' && !u.recoveryAttempted);
    
    if (unitsToRecover.length === 0) return session;

    // Group by owner
    const unitsByOwner = {};
    unitsToRecover.forEach(u => {
      u.recoveryAttempted = true; // Mark as attempted whether successful or not
      modified = true;
      if (!unitsByOwner[u.owner]) unitsByOwner[u.owner] = [];
      unitsByOwner[u.owner].push(u);
    });

    for (const ownerId of Object.keys(unitsByOwner)) {
      const units = unitsByOwner[ownerId];
      if (!units.length) continue;

      try {
        const [{ data: ecoEntry }, { data: resources }] = await Promise.all([
          getDataEntry('economy', ownerId),
          supabase.from('resources').select('*').eq('country_id', ownerId)
        ]);

        let manpowerPool = Number(ecoEntry?.data?.population?.mobilized || 0);
        let ecoData = ecoEntry?.data || {};

        const resMap = {};
        if (resources) {
          resources.forEach(r => { resMap[r.resource_type] = r; });
        }

        for (const u of units) {
          const maxHp = u.maxHp || 100;
          const reqManpower = u.manpowerCost || 0; // 풀회복 비용
          const reqWeapons = (u.requiredWeapons || []).map(w => ({
            name: w.weaponName,
            amount: w.amount
          }));

          let canRecover = true;
          if (manpowerPool < reqManpower) canRecover = false;
          
          if (canRecover) {
            for (const rw of reqWeapons) {
              const resKey = `weapon:${rw.name}`;
              if (!resMap[resKey] || Number(resMap[resKey].amount) < rw.amount) {
                canRecover = false;
                break;
              }
            }
          }

          if (canRecover) {
            // 자원 차감
            manpowerPool -= reqManpower;
            for (const rw of reqWeapons) {
              const resKey = `weapon:${rw.name}`;
              resMap[resKey].amount = Number(resMap[resKey].amount) - rw.amount;
              await supabase.from('resources').update({ amount: resMap[resKey].amount }).eq('id', resMap[resKey].id);
            }
            // 유닛 복구
            u.hp = maxHp;
            u.status = 'standby';
          } else {
            // 회복 실패 시 영구 삭제
            try {
              const [{ data: unitsEntry }, { data: wingsEntry }] = await Promise.all([
                getDataEntry('military_units', ownerId),
                getDataEntry('air_wings', ownerId)
              ]);
              if (unitsEntry) {
                const nextUnits = (unitsEntry.data?.units || []).filter(mu => mu.id !== u.id);
                await upsertDataEntry('military_units', ownerId, { units: nextUnits });
              }
              if (wingsEntry) {
                const nextWings = (wingsEntry.data?.wings || []).map(w => ({
                  ...w,
                  unitIds: (w.unitIds || []).filter(uid => uid !== u.id)
                }));
                await upsertDataEntry('air_wings', ownerId, { wings: nextWings });
              }
            } catch (err) {
              console.error('Failed to permanently delete destroyed air unit:', u.id, err);
            }
          }
        }

        // 남은 인력 저장
        if (ecoEntry) {
          ecoData.population.mobilized = manpowerPool;
          await upsertDataEntry('economy', ownerId, ecoData);
        }
      } catch (err) {
        console.error('Failed to auto-recover air units for owner:', ownerId, err);
      }
    }

    return session;
  };

  const handleUpdate = async (newSession) => {
    setLoading(true);
    try {
      const finalSession = await tryAutoRecoverAirUnits(newSession);
      await saveAerialBattleSession(finalSession);
      onUpdate(finalSession);
    } catch (err) {
      console.error(err);
      alert('세션 저장 실패');
    }
    setLoading(false);
  };

  const handleChoice = (choiceData) => {
    const clone = JSON.parse(JSON.stringify(battleSession));
    const newSession = submitCardChoice(clone, countryId, choiceData);
    handleUpdate(newSession);
  };

  const handleRequestMajor = () => {
    if (!confirm('공중결전(전면전)을 제안하시겠습니까? 수락 시 항복하거나 한쪽 카드가 소진될 때까지 계속 전투가 진행되며, 승자에게 완전 제공권이 넘어갑니다. 거절 시 즉시 승리합니다.')) return;
    const clone = JSON.parse(JSON.stringify(battleSession));
    handleUpdate(requestMajorAerialBattle(clone, countryId));
  };

  const handleAcceptMajor = () => {
    const clone = JSON.parse(JSON.stringify(battleSession));
    handleUpdate(acceptMajorAerialBattle(clone));
  };

  const handleDeclineMajor = () => {
    if (!confirm('정말 공중결전을 거절하시겠습니까? 거절 즉시 패배 처리되며 상대방이 완전 제공권을 얻게 됩니다.')) return;
    const clone = JSON.parse(JSON.stringify(battleSession));
    handleUpdate(declineMajorAerialBattle(clone, countryId));
  };

  const handleSurrender = () => {
    if (!confirm('항복하시겠습니까?')) return;
    const clone = JSON.parse(JSON.stringify(battleSession));
    handleUpdate(surrenderAerialBattle(clone, countryId));
  };

  const handleNuclearStrike = async () => {
    if (!hasFullAirSupremacy) return alert('완전 제공권 상태에서만 사용 가능합니다.');
    if (alreadyNuked) return alert('핵투발은 이미 사용했습니다.');
    if (!confirm('핵투발을 실행하시겠습니까? (핵미사일 유사 광역 격파)')) return;

    const strikeBaseDamage = Math.max(...(myAirUnits || []).map(u => Number(u.attack || 1)), 1);
    const enemyCountryId = isAttacker ? battleSession.defenderId : battleSession.attackerId;
    await applyNuclearStrikeToCombatSessions(countryId, enemyCountryId, strikeBaseDamage);

    const nextSession = withStrategicAction(battleSession, {
      action: 'nuclear_strike',
      actorId: countryId,
      targetId: enemyCountryId,
      power: strikeBaseDamage
    });
    await handleUpdate(nextSession);
    alert('핵투발을 실행했습니다. (활성 육전 세션에 즉시 반영)');
  };

  const handleSupplyRaid = async () => {
    if (!hasFullAirSupremacy) return alert('완전 제공권 상태에서만 사용 가능합니다.');
    if (alreadyRaided) return alert('보급체계폭격은 이미 사용했습니다.');

    const bombers = getMyBombers();
    if (bombers.length === 0) return alert('투입 가능한 폭격기가 없습니다.');

    let selectedBomber = bombers[0];
    if (bombers.length > 1) {
      const txt = bombers.map((b, i) => `${i + 1}. ${b.name || b.id} (공격력 ${Number(b.attack || 1)})`).join('\n');
      const raw = window.prompt(`투입할 폭격기 번호를 입력하세요:\n${txt}`, '1');
      const idx = parseInt(raw || '1', 10) - 1;
      if (Number.isNaN(idx) || idx < 0 || idx >= bombers.length) return alert('잘못된 번호입니다.');
      selectedBomber = bombers[idx];
    }

    const enemyCountryId = isAttacker ? battleSession.defenderId : battleSession.attackerId;
    const bomberAttack = Math.max(1, Number(selectedBomber.attack || 1));
    const reduced = await applySupplyRaidToCombatSessions(countryId, enemyCountryId, bomberAttack);

    const nextSession = withStrategicAction(battleSession, {
      action: 'supply_raid',
      actorId: countryId,
      targetId: enemyCountryId,
      bomberId: selectedBomber.id,
      bomberName: selectedBomber.name || selectedBomber.id,
      reduction: reduced
    });
    await handleUpdate(nextSession);
    alert(`보급체계폭격 실행: 선택한 폭격기 공격력(${reduced})만큼 상대 보급한계를 감소시켰습니다.`);
  };

  return (
    <div className="card" style={{ padding: '20px', border: isMyTurn ? '2px solid var(--primary)' : '1px solid var(--border-color)', opacity: loading ? 0.6 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3>
          {battleSession.type === 'bombing' ? '💣 폭격전' : '✈️ 제공권'} (라운드 {battleSession.round})
          {isMajorBattle && <span style={{ marginLeft: '8px', color: 'red', fontWeight: 'bold' }}>[공중결전 중]</span>}
        </h3>
        <div>
          {battleSession.status === 'finished' ? (
            <span style={{ padding: '4px 8px', background: 'var(--bg-glass)', borderRadius: '4px', fontWeight: 'bold' }}>
              종료됨 ({battleSession.winner === 'draw' ? '무승부' : (battleSession.winner === (isAttacker ? 'attacker' : 'defender') ? '승리!' : '패배')})
            </span>
          ) : isMyTurn ? (
            <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>내 차례입니다</span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>상대방의 선택을 기다리는 중...</span>
          )}
        </div>
      </div>

      {isMajorRequestedByEnemy && battleSession.majorBattleRequest !== 'accepted' && battleSession.majorBattleRequest !== 'declined' && (
        <div style={{ background: 'rgba(255, 0, 0, 0.1)', border: '1px solid red', padding: '16px', borderRadius: '4px', marginBottom: '16px' }}>
          <h4 style={{ color: 'red', marginBottom: '8px' }}>⚠️ 상대방이 공중결전(전면전)을 제안했습니다!</h4>
          <p style={{ marginBottom: '12px' }}>
            수락하면 어느 한쪽이 항복하거나 패가 소진될 때까지 라운드가 계속됩니다. 승자는 완전 제공권을 가져갑니다.<br/>
            거절하면 즉시 패배 처리되며 상대가 완전 제공권을 가져갑니다.
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-danger" onClick={handleAcceptMajor}>수락 (결전 벌이기)</button>
            <button className="btn btn-secondary" onClick={handleDeclineMajor}>거절 (제공권 포기)</button>
          </div>
        </div>
      )}

      {isMajorRequestedByMe && !isMajorBattle && battleSession.majorBattleRequest !== 'declined' && (
        <div style={{ background: 'var(--bg-glass)', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>
          ⏳ 상대방이 공중결전 제안을 검토 중입니다...
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* 내 상태 */}
        <div style={{ border: '1px solid var(--primary)', padding: '12px', borderRadius: '4px' }}>
          <h4>내 상태</h4>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
            <div>패 남음: {myHand.length}</div>
            <div>대공포: {myAA.length}</div>
            <div>손실: {myLost.length}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 0' }}>
            {myHand.map(c => <AerialCardUI key={c.cardId} card={c} />)}
            {myAA.map(c => <AerialCardUI key={c.cardId} card={c} />)}
          </div>
        </div>

        {/* 적 상태 */}
        <div style={{ border: '1px solid var(--border-color)', padding: '12px', borderRadius: '4px', background: 'rgba(0,0,0,0.2)' }}>
          <h4>상대 상태</h4>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            <div>패 남음: {enemyHand.length}</div>
            <div>대공포: {enemyAA.length}</div>
            <div>손실: {enemyLost.length}</div>
          </div>
          <div style={{ marginTop: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            {enemyChoice ? "상대방이 카드를 선택했습니다." : "상대방이 아직 선택하지 않았습니다."}
          </div>
        </div>
      </div>

      {isMyTurn && !isMajorRequestedByEnemy && (
        <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '4px', marginBottom: '16px' }}>
          <p style={{ fontWeight: 'bold', marginBottom: '12px' }}>카드 출격:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {(() => {
              const groups = {};
              myHand.forEach(c => {
                const key = `${c.speed}_${c.isAce}_${c.canBlock}`;
                if (!groups[key]) groups[key] = { ...c, count: 0, cardIds: [] };
                groups[key].count++;
                groups[key].cardIds.push(c.cardId);
              });
              
              const sortedGroups = Object.values(groups).sort((a,b) => b.speed - a.speed);
              return sortedGroups.map(g => (
                <button 
                  key={g.cardIds[0]}
                  className={`btn btn-sm ${g.isAce ? 'btn-accent' : 'btn-primary'}`}
                  onClick={() => handleChoice({ cardId: g.cardIds[0], type: g.isAce ? 'ace' : 'normal' })}
                >
                  {g.isAce ? '⭐ 에이스' : '전투기'} (속도 {g.speed}) x{g.count}
                </button>
              ));
            })()}

            {myAA.length > 0 && (
              <button 
                className="btn btn-sm btn-danger"
                onClick={() => handleChoice({ cardId: myAA[0].cardId, type: 'aa' })}
              >
                🚀 대공포 x{myAA.length}
              </button>
            )}

            <button 
              className="btn btn-sm btn-warning"
              onClick={() => handleChoice({ cardId: null, type: 'pass' })}
            >
              💤 아끼기 (Pass)
            </button>
          </div>
          
          <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px', display: 'flex', gap: '12px' }}>
            {!isMajorBattle && !isMajorRequestedByMe && (
              <button className="btn btn-sm btn-danger" onClick={handleRequestMajor}>
                🔥 공중결전 제안 (전면전)
              </button>
            )}
            <button className="btn btn-sm btn-secondary" onClick={handleSurrender} style={{ marginLeft: 'auto' }}>
              🏳️ 항복
            </button>
          </div>
        </div>
      )}

      {hasFullAirSupremacy && (
        <div style={{ padding: '16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.45)', borderRadius: '4px', marginBottom: '16px' }}>
          <p style={{ fontWeight: 'bold', marginBottom: '8px', color: '#ef4444' }}>완전 제공권 전술 스킬</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn btn-danger" onClick={handleNuclearStrike} disabled={alreadyNuked}>☢️ 핵투발</button>
            <button className="btn btn-warning" onClick={handleSupplyRaid} disabled={alreadyRaided}>🛩️ 보급체계폭격</button>
          </div>
          <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            핵투발: 핵미사일 유사 광역 격파 | 보급체계폭격: 선택 폭격기 공격력만큼 상대 보급한계 감소
          </div>
        </div>
      )}

      {/* 로그 */}
      <div style={{ maxHeight: '150px', overflowY: 'auto', padding: '12px', background: 'var(--bg-glass)', borderRadius: '4px', fontSize: '0.85rem' }}>
        {battleSession.history.length === 0 && <span style={{ color: 'var(--text-muted)' }}>기록이 없습니다.</span>}
        {battleSession.history.map((log, idx) => (
          <div key={idx} style={{ marginBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>
            <span style={{ color: 'var(--primary)', marginRight: '8px' }}>[R{log.round}]</span>
            {log.reason === 'normal_combat' && <span>교전: {log.result?.description}</span>}
            {log.reason === 'antiAircraft_used' && <span>대공 방어: {log.result?.description}</span>}
            {log.reason === 'major_battle_requested' && <span style={{ color: 'red' }}>🔥 공중결전이 제안되었습니다!</span>}
            {log.reason === 'major_battle_accepted' && <span style={{ color: 'red' }}>⚔️ 공중결전이 시작되었습니다!</span>}
            {log.reason === 'major_battle_declined' && <span>🏳️ 공중결전 거절로 제공권이 넘어갔습니다.</span>}
            {log.reason === 'surrender' && <span>🏳️ 항복했습니다.</span>}
            {log.reason === 'nuclear_strike' && <span>☢️ 핵투발 발동: 전략핵 타격 실행</span>}
            {log.reason === 'supply_raid' && <span>🛩️ 보급체계폭격: {log.bomberName || '폭격기'} (감소 {log.reduction || 0})</span>}
          </div>
        )).reverse()}
      </div>
    </div>
  );
}
