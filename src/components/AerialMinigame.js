'use client';

import React, { useState, useEffect } from 'react';
import { createAerialBattle, processBattleRound, aiChooseCard, surrenderAerialBattle } from '@/lib/aerialCombat';
import AerialCardUI from '@/components/AerialCardUI';

export default function AerialMinigame({ countryId, myPlanes, enemyPlanes, autoMode, onComplete }) {
  const [battle, setBattle] = useState(null);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    // 세션 초기화
    const newBattle = createAerialBattle(countryId, 'enemy', myPlanes, enemyPlanes, 10, 10);
    setBattle(newBattle);

    if (autoMode) {
      resolveAutoMode(newBattle);
    }
  }, [countryId, myPlanes, enemyPlanes, autoMode]);

  const resolveAutoMode = async (battleState) => {
    let currentBattle = JSON.parse(JSON.stringify(battleState));
    const newLogs = [];

    // 자동 전투 진행 루프 (100번 이상 도는 것 방지)
    let maxIter = 100;
    while (currentBattle.status === 'active' && maxIter-- > 0) {
      const atkCard = aiChooseCard(currentBattle.defenderState, currentBattle.attackerState);
      const defCard = aiChooseCard(currentBattle.attackerState, currentBattle.defenderState);

      currentBattle.attackerChoice = atkCard ? { cardId: atkCard.cardId, type: atkCard.canBlock ? 'aa' : (atkCard.isAce ? 'ace' : 'normal') } : { cardId: null, type: 'pass' };
      currentBattle.defenderChoice = defCard ? { cardId: defCard.cardId, type: defCard.canBlock ? 'aa' : (defCard.isAce ? 'ace' : 'normal') } : { cardId: null, type: 'pass' };

      processBattleRound(currentBattle);
      const lastResult = currentBattle.history[currentBattle.history.length - 1];
      newLogs.push(`라운드 ${currentBattle.round - 1}: ${lastResult?.description}`);
    }

    setBattle(currentBattle);
    setLogs(newLogs);
    
    // 결과 판정 (동반 전멸 시 무승부이므로 공격측(유저) 패배로 간주)
    const isWin = (currentBattle.defenderState.status === 'surrendered' || currentBattle.defenderState.hand.length === 0) 
                  && currentBattle.attackerState.hand.length > 0;
    setTimeout(() => {
      onComplete(isWin);
    }, 2000);
  };

  const handleManualChoice = (card) => {
    if (!battle || battle.status !== 'active') return;

    const currentBattle = JSON.parse(JSON.stringify(battle));
    
    // 공격측(유저) 선택
    if (card) {
      currentBattle.attackerChoice = { cardId: card.cardId, type: card.canBlock ? 'aa' : (card.isAce ? 'ace' : 'normal') };
    } else {
      currentBattle.attackerChoice = { cardId: null, type: 'pass' };
    }

    // 방어측(AI) 선택
    const defCard = aiChooseCard(currentBattle.attackerState, currentBattle.defenderState);
    currentBattle.defenderChoice = defCard ? { cardId: defCard.cardId, type: defCard.canBlock ? 'aa' : (defCard.isAce ? 'ace' : 'normal') } : { cardId: null, type: 'pass' };

    processBattleRound(currentBattle);
    
    const lastResult = currentBattle.history[currentBattle.history.length - 1];
    setLogs(prev => [...prev, `라운드 ${currentBattle.round - 1}: ${lastResult?.description}`]);
    setBattle(currentBattle);

    if (currentBattle.status === 'finished' || currentBattle.attackerState.status === 'surrendered' || currentBattle.defenderState.status === 'surrendered') {
       const isWin = (currentBattle.defenderState.status === 'surrendered' || currentBattle.defenderState.hand.length === 0) 
                     && currentBattle.attackerState.hand.length > 0;
       setTimeout(() => {
         onComplete(isWin);
       }, 2000);
    }
  };

  const handleSurrender = () => {
    if (!battle) return;
    const currentBattle = JSON.parse(JSON.stringify(battle));
    surrenderAerialBattle(currentBattle, countryId);
    setBattle(currentBattle);
    setLogs(prev => [...prev, '플레이어가 항복했습니다. 제공권 상실.']);
    setTimeout(() => {
      onComplete(false);
    }, 2000);
  };

  if (!battle) return null;

  // 그룹화 로직
  const groups = {};
  battle.attackerState.hand.forEach(c => {
    const key = `${c.speed}_${c.isAce}`;
    if (!groups[key]) groups[key] = { ...c, count: 0, cardIds: [] };
    groups[key].count++;
    groups[key].cardIds.push(c.cardId);
  });
  const groupedCards = Object.values(groups).sort((a,b) => b.speed - a.speed);

  const groupsAA = {};
  battle.attackerState.antiAircraft.filter(c => c.status === 'hand').forEach(c => {
    if (!groupsAA['aa']) groupsAA['aa'] = { ...c, count: 0, cardIds: [] };
    groupsAA['aa'].count++;
    groupsAA['aa'].cardIds.push(c.cardId);
  });

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 1000,
      display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px',
      overflowY: 'auto'
    }}>
      <h2 style={{ color: '#60a5fa', marginBottom: '8px' }}>✈️ 제공권 쟁탈 결전 (미니게임)</h2>
      <p style={{ color: '#cbd5e1', marginBottom: '24px' }}>이번 턴의 제공권을 확보하기 위해 전투기를 투입하십시오.</p>

      {autoMode ? (
        <div style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '24px' }}>🤖 AUTO 시뮬레이션 진행 중...</div>
      ) : (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: '1000px', marginBottom: '32px' }}>
          {groupedCards.map(g => (
            <div key={g.cardIds[0]} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <AerialCardUI card={g} />
              <button className="btn btn-sm btn-primary" onClick={() => handleManualChoice({ cardId: g.cardIds[0], isAce: g.isAce, canBlock: false })}>
                제출 (남은 수량: {g.count})
              </button>
            </div>
          ))}

          {groupsAA['aa'] && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <AerialCardUI card={groupsAA['aa']} />
              <button className="btn btn-sm btn-danger" onClick={() => handleManualChoice({ cardId: groupsAA['aa'].cardIds[0], isAce: false, canBlock: true })}>
                대공포 요격 (남은 수량: {groupsAA['aa'].count})
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', minWidth: '200px', alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px' }}>
            <button className="btn btn-warning" style={{ width: '100%' }} onClick={() => handleManualChoice(null)}>💤 패스 (아끼기)</button>
            <button className="btn btn-danger" style={{ width: '100%' }} onClick={handleSurrender}>🏳️ 항복 (포기)</button>
          </div>
        </div>
      )}

      <div style={{ width: '100%', maxWidth: '800px', backgroundColor: 'var(--bg-secondary)', padding: '16px', borderRadius: '8px', minHeight: '150px', maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-color)' }}>
        <h4 style={{ marginBottom: '12px' }}>📜 교전 기록</h4>
        {logs.map((log, idx) => (
          <div key={idx} style={{ fontSize: '0.9rem', marginBottom: '4px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
            {log}
          </div>
        ))}
      </div>

      {battle.status === 'finished' && (
        <div style={{ marginTop: '24px', fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--success)' }}>
          결전이 종료되었습니다! 잠시 후 지상전으로 돌아갑니다...
        </div>
      )}
    </div>
  );
}
