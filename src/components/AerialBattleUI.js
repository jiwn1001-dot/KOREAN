'use client';

import React, { useState } from 'react';
import { submitCardChoice, requestMajorAerialBattle, acceptMajorAerialBattle, declineMajorAerialBattle, surrenderAerialBattle } from '@/lib/aerialCombat';
import { saveAerialBattleSession } from '@/lib/store';
import AerialCardUI from '@/components/AerialCardUI';

export default function AerialBattleUI({ battleSession, countryId, onUpdate }) {
  const [loading, setLoading] = useState(false);

  const isAttacker = battleSession.attackerId === countryId;
  const isDefender = battleSession.defenderId === countryId;
  
  if (!isAttacker && !isDefender) return null;

  const myState = isAttacker ? battleSession.attackerState : battleSession.defenderState;
  const enemyState = isAttacker ? battleSession.defenderState : battleSession.attackerState;
  
  const myChoice = isAttacker ? battleSession.attackerChoice : battleSession.defenderChoice;
  const enemyChoice = isAttacker ? battleSession.defenderChoice : battleSession.attackerChoice;

  const isMyTurn = battleSession.status === 'active' && !myChoice;
  
  // 공중결전 제안 상태 확인
  const isMajorRequestedByMe = (isAttacker && battleSession.majorBattleRequest === 'requested_by_attacker') || 
                               (isDefender && battleSession.majorBattleRequest === 'requested_by_defender');
  const isMajorRequestedByEnemy = (isAttacker && battleSession.majorBattleRequest === 'requested_by_defender') || 
                                  (isDefender && battleSession.majorBattleRequest === 'requested_by_attacker');
  const isMajorBattle = battleSession.isMajorBattle;

  const handleUpdate = async (newSession) => {
    setLoading(true);
    try {
      await saveAerialBattleSession(newSession);
      onUpdate(newSession);
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
            <div>패 남음: {myState.hand.length}</div>
            <div>대공포: {myState.antiAircraft.length}</div>
            <div>손실: {myState.lost.length}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 0' }}>
            {myState.hand.map(c => <AerialCardUI key={c.cardId} card={c} />)}
            {myState.antiAircraft.map(c => <AerialCardUI key={c.cardId} card={c} />)}
          </div>
        </div>

        {/* 적 상태 */}
        <div style={{ border: '1px solid var(--border-color)', padding: '12px', borderRadius: '4px', background: 'rgba(0,0,0,0.2)' }}>
          <h4>상대 상태</h4>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            <div>패 남음: {enemyState.hand.length}</div>
            <div>대공포: {enemyState.antiAircraft.length}</div>
            <div>손실: {enemyState.lost.length}</div>
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
              myState.hand.forEach(c => {
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

            {myState.antiAircraft.length > 0 && (
              <button 
                className="btn btn-sm btn-danger"
                onClick={() => handleChoice({ cardId: myState.antiAircraft[0].cardId, type: 'aa' })}
              >
                🚀 대공포 x{myState.antiAircraft.length}
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
          </div>
        )).reverse()}
      </div>
    </div>
  );
}
