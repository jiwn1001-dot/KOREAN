'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createNavalBoard, canPlaceNavalUnit, calculateNavalAIOrders, resolveNavalTurn, getVisibleNavalUnits } from '@/lib/navalCombat';

export default function NavalCombatBoard({ countryId, initialSession, onSaveSession }) {
  const [board, setBoard] = useState([]);
  const [unitsOnBoard, setUnitsOnBoard] = useState([]);
  const [phase, setPhase] = useState('deployment');
  const [turn, setTurn] = useState(1);
  const [selectedStandbyId, setSelectedStandbyId] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [orderMode, setOrderMode] = useState('move');
  const [actionType, setActionType] = useState('gunfire');
  const [torpedoDir, setTorpedoDir] = useState('E');
  const [ordersByUnit, setOrdersByUnit] = useState({});
  const [orientation, setOrientation] = useState('horizontal');
  const [manualControlIds, setManualControlIds] = useState([]);
  const [flagshipId, setFlagshipId] = useState('');
  const [mines, setMines] = useState([]);
  const [pendingMissiles, setPendingMissiles] = useState([]);
  const [queuedSkills, setQueuedSkills] = useState([]);
  const [pendingSkill, setPendingSkill] = useState(null);

  const isHost = initialSession?.isTeamBattle ? initialSession?.team1?.includes(countryId) : initialSession?.host === countryId;

  useEffect(() => {
    if (initialSession) {
      setBoard(initialSession.board || createNavalBoard());
      setUnitsOnBoard(initialSession.units || []);
      setPhase(initialSession.phase || (initialSession.status === 'playing' ? 'combat' : 'deployment'));
      setTurn(initialSession.turn || 1);
      setMines(initialSession.mines || []);
      setPendingMissiles(initialSession.pendingMissiles || []);
      setQueuedSkills([]);
      setPendingSkill(null);
      const p = initialSession.players?.[countryId];
      if (p?.manualControlIds) setManualControlIds(p.manualControlIds);
      if (p?.flagshipId) setFlagshipId(p.flagshipId);
    }
  }, [initialSession, countryId]);

  useEffect(() => {
    if (!initialSession?.players) return;
    if (!isHost) return;

    const nextPlayers = { ...initialSession.players };
    Object.keys(nextPlayers).forEach(pid => {
      if (nextPlayers[pid]?.isAI) nextPlayers[pid].ready = true;
    });

    const allReady = Object.values(nextPlayers).every(p => p.ready);
    if (!allReady) return;

    const allOrders = [];
    const allSkills = [];
    Object.entries(nextPlayers).forEach(([pid, player]) => {
      const playerOrders = player.orders || [];
      const playerSkills = player.skills || [];
      allOrders.push(...playerOrders);
      allSkills.push(...playerSkills);

      if (player.isAI) {
        const aiOrders = calculateNavalAIOrders({ units: unitsOnBoard, manualOrders: playerOrders }, pid, player.manualControlIds || [], player.flagshipId || null);
        allOrders.push(...aiOrders);
      }
    });

    const resolved = resolveNavalTurn({
      board,
      units: unitsOnBoard,
      orders: allOrders,
      skillsQueue: allSkills,
      mines,
      pendingMissiles,
      isTeamBattle: initialSession?.isTeamBattle,
      team1: initialSession?.team1,
      team2: initialSession?.team2,
      host: initialSession?.host,
      allowAirTeam1: initialSession?.allowAirTeam1,
      allowAirTeam2: initialSession?.allowAirTeam2
    });

    const resetPlayers = { ...nextPlayers };
    Object.keys(resetPlayers).forEach(pid => {
      resetPlayers[pid] = {
        ...resetPlayers[pid],
        ready: false,
        orders: [],
        skills: []
      };
    });

    onSaveSession?.({
      board: resolved.board,
      units: resolved.units,
      mines: resolved.mines || [],
      pendingMissiles: resolved.pendingMissiles || [],
      players: resetPlayers,
      phase: 'combat',
      status: 'playing',
      turn: (initialSession.turn || turn) + 1
    });
  }, [initialSession, isHost, unitsOnBoard, board, mines, pendingMissiles, turn, onSaveSession]);

  const visibleUnits = useMemo(() => getVisibleNavalUnits(unitsOnBoard, countryId), [unitsOnBoard, countryId]);

  const myNavalStandby = useMemo(
    () => unitsOnBoard.filter(u => u.owner === countryId && u.majorCategory === '해군' && u.status === 'standby'),
    [unitsOnBoard, countryId]
  );

  const myNavalField = useMemo(
    () => unitsOnBoard.filter(u => u.owner === countryId && u.majorCategory === '해군' && u.status === 'field'),
    [unitsOnBoard, countryId]
  );

  const handleTileClick = (x, y) => {
    if (phase === 'deployment') {
      if (!selectedStandbyId) return;
      const ship = unitsOnBoard.find(u => u.id === selectedStandbyId);
      if (!ship) return;

      const team1 = initialSession?.isTeamBattle ? initialSession?.team1?.includes(countryId) : initialSession?.host === countryId;
      if (team1 && x > 9) return alert('해전 배치 구역을 벗어났습니다. (x <= 9)');
      if (!team1 && x < 10) return alert('해전 배치 구역을 벗어났습니다. (x >= 10)');

      const candidate = { ...ship, x, y, orientation, status: 'field' };
      if (!canPlaceNavalUnit(unitsOnBoard, candidate, board.length || 20)) {
        return alert('해당 위치에는 배치할 수 없습니다. (소모칸수/방향/충돌 확인)');
      }

      setUnitsOnBoard(prev => prev.map(u => (u.id === ship.id ? candidate : u)));
      setSelectedStandbyId(null);
      return;
    }

    if (phase !== 'combat') return;

    if (pendingSkill) {
      setQueuedSkills(prev => [...prev, { ...pendingSkill, target: { x, y } }]);
      setPendingSkill(null);
      return;
    }

    const clicked = unitsOnBoard.find(u => u.x === x && u.y === y && u.status === 'field' && u.majorCategory === '해군');

    if (selectedUnit && selectedUnit.owner === countryId) {
      setOrdersByUnit(prev => {
        const current = prev[selectedUnit.id] || { unitId: selectedUnit.id };
        const next = { ...current };
        if (orderMode === 'move') {
          next.move = { x, y };
        } else {
          const baseAction = {
            type: actionType,
            target: { x, y },
            direction: torpedoDir,
            targetShipId: null
          };
          if (actionType === 'missile') {
            const targetUnit = unitsOnBoard.find(u => u.status === 'field' && u.owner !== countryId && u.majorCategory === '해군' && u.x === x && u.y === y);
            baseAction.targetShipId = targetUnit?.id || null;
          }
          next.action = baseAction;
        }
        return { ...prev, [selectedUnit.id]: next };
      });
      setSelectedUnit(null);
      return;
    }

    if (clicked && clicked.owner === countryId) {
      setSelectedUnit(clicked);
    }
  };

  const handleDeployComplete = () => {
    const nextPlayers = { ...(initialSession?.players || {}) };
    if (nextPlayers[countryId]) nextPlayers[countryId].ready = true;

    onSaveSession?.({
      units: unitsOnBoard,
      mines,
      pendingMissiles,
      players: nextPlayers,
      phase: 'deployment',
      status: 'deployment'
    });
    alert('해군 배치 완료. 상대를 기다립니다.');
  };

  const handleNextTurn = () => {
    const selectedDirect = manualControlIds.slice(0, 5);
    const directSet = new Set(selectedDirect);
    const localOrders = Object.values(ordersByUnit).filter(o => directSet.has(o.unitId));

    const aiAssistOrders = calculateNavalAIOrders(
      { units: unitsOnBoard, manualOrders: localOrders },
      countryId,
      selectedDirect,
      flagshipId || null
    );

    const nextPlayers = { ...(initialSession?.players || {}) };
    if (nextPlayers[countryId]) {
      nextPlayers[countryId] = {
        ...nextPlayers[countryId],
        ready: true,
        orders: [...localOrders, ...aiAssistOrders],
        skills: [...queuedSkills],
        manualControlIds: selectedDirect,
        flagshipId: flagshipId || null
      };
    }

    onSaveSession?.({ players: nextPlayers });
    setQueuedSkills([]);
    alert('해전 명령 하달 완료. 결산 대기 중...');
  };

  const queueTorpedoBomber = () => {
    const isTeam1Owner = (ownerId) => {
      if (initialSession?.isTeamBattle) return (initialSession.team1 || []).includes(ownerId);
      return initialSession?.host === ownerId;
    };
    const allowAir = isTeam1Owner(countryId) ? (initialSession?.allowAirTeam1 !== false) : (initialSession?.allowAirTeam2 !== false);
    if (!allowAir) {
      const carriers = unitsOnBoard.filter(u => u.owner === countryId && u.status === 'field' && u.majorCategory === '해군' && (u.subCategory || '').includes('항공모함')).length;
      const usedSorties = queuedSkills.filter(s => s.type === 'torpedo_bomber').length;
      if (usedSorties >= carriers) {
        alert(`공군 사용 제한 중입니다. 항모 ${carriers}척으로 이번 턴 출격 가능한 뇌격기 수를 모두 사용했습니다.`);
        return;
      }
    }

    const candidates = unitsOnBoard.filter(u => u.owner === countryId && u.status === 'standby' && (u.subCategory === '뇌격기' || u.minorCategory === '뇌격기'));
    if (candidates.length === 0) {
      alert('대기 상태 뇌격기가 없습니다.');
      return;
    }

    let selected = candidates[0];
    if (candidates.length > 1) {
      const opts = candidates.map((u, i) => `${i + 1}. ${u.name || u.id} (공:${u.attack || 1})`).join('\n');
      const raw = window.prompt(`사용할 뇌격기 번호를 입력하세요:\n${opts}`, '1');
      const idx = parseInt(raw || '1', 10) - 1;
      if (Number.isNaN(idx) || idx < 0 || idx >= candidates.length) {
        alert('잘못된 번호입니다.');
        return;
      }
      selected = candidates[idx];
    }

    setPendingSkill({
      type: 'torpedo_bomber',
      attackerId: countryId,
      consumerId: selected.id,
      direction: torpedoDir,
      damage: Math.max(1, selected.attack || 1)
    });
    alert('뇌격기 타겟 타일을 클릭하세요. 지정한 방향으로 최초 피격 함선에 타격합니다.');
  };

  const toggleDirectControl = (unitId) => {
    setManualControlIds(prev => {
      const exists = prev.includes(unitId);
      if (exists) return prev.filter(id => id !== unitId);
      if (prev.length >= 5) {
        alert('제독 직할은 최대 5척까지 가능합니다.');
        return prev;
      }
      return [...prev, unitId];
    });
  };

  return (
    <div className="card" style={{ padding: '20px' }}>
      <h2 style={{ marginTop: 0 }}>해전 지휘소 | Turn {turn}</h2>
      <p style={{ color: 'var(--text-muted)' }}>해전 전용 엔진: 함대 단위 이동/공격 + 제독 직할 5척 + AI 보조 운용</p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => setOrderMode('move')}>이동 지정</button>
        <button className="btn btn-warning" onClick={() => setOrderMode('attack')}>공격 지정</button>
        <button className="btn" onClick={() => setOrientation(o => (o === 'horizontal' ? 'vertical' : 'horizontal'))}>
          배치 방향: {orientation === 'horizontal' ? '가로' : '세로'}
        </button>
        {phase === 'deployment' ? (
          <button className="btn btn-success" onClick={handleDeployComplete}>배치 완료</button>
        ) : (
          <button className="btn btn-success" onClick={handleNextTurn}>턴 종료</button>
        )}
      </div>

        {phase === 'combat' && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <select className="form-select" style={{ maxWidth: '160px' }} value={actionType} onChange={(e) => setActionType(e.target.value)}>
              <option value="gunfire">함포</option>
              <option value="torpedo">어뢰</option>
              <option value="depth_charge">폭뢰</option>
              <option value="mine">기뢰 부설</option>
              <option value="mine_sweep">기뢰 소해</option>
              <option value="missile">미사일</option>
            </select>
            <select className="form-select" style={{ maxWidth: '140px' }} value={torpedoDir} onChange={(e) => setTorpedoDir(e.target.value)}>
              {['N','NE','E','SE','S','SW','W','NW'].map(d => <option key={d} value={d}>방향 {d}</option>)}
            </select>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}>
              공격 모드에서 타일 클릭 시 선택 무장으로 예약됩니다.
            </div>
            <button className="btn btn-danger" onClick={queueTorpedoBomber}>뇌격기 스킬 예약</button>
          </div>
        )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(20, 30px)', gap: '2px', marginBottom: '16px' }}>
        {board.map((row, y) => row.map((tile, x) => {
            const unit = visibleUnits.find(u => u.status === 'field' && u.majorCategory === '해군' && u.x === x && u.y === y);
            const mine = mines.find(m => m.x === x && m.y === y);
          const selected = selectedUnit?.id === unit?.id;
          return (
            <div
              key={`${x}_${y}`}
              onClick={() => handleTileClick(x, y)}
              style={{
                width: 30,
                height: 30,
                background: selected ? 'rgba(234,179,8,0.3)' : 'rgba(14,165,233,0.15)',
                border: selected ? '2px solid #eab308' : '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '10px',
                color: '#e2e8f0'
              }}
              title={`(${x},${y})`}
            >
              {mine ? '✳' : ''}
              {unit ? (unit.owner === countryId ? '⚓' : '☠') : ''}
            </div>
          );
        }))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div className="card" style={{ padding: '12px' }}>
          <h4 style={{ marginTop: 0 }}>{phase === 'deployment' ? '대기 함선' : '아군 함선(직할 선택)'}</h4>
          {(phase === 'deployment' ? myNavalStandby : myNavalField).map(u => (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span>{u.name} [{u.subCategory}]</span>
              {phase === 'deployment' ? (
                <button className="btn btn-sm" onClick={() => setSelectedStandbyId(u.id)}>
                  {selectedStandbyId === u.id ? '선택됨' : '배치 선택'}
                </button>
              ) : (
                <button className="btn btn-sm" onClick={() => toggleDirectControl(u.id)}>
                  {manualControlIds.includes(u.id) ? '직할 해제' : '직할 지정'}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: '12px' }}>
          <h4 style={{ marginTop: 0 }}>제독 직할/기함</h4>
          <div style={{ fontSize: '0.9rem', marginBottom: '8px' }}>직할 함선: {manualControlIds.length}/5</div>
          <select className="form-select" value={flagshipId} onChange={(e) => setFlagshipId(e.target.value)}>
            <option value="">-- 기함 선택 --</option>
            {myNavalField.filter(u => manualControlIds.includes(u.id)).map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>
            직할 외 함선은 AI가 자동 운용하며, 직할 함선 타일 점유를 우선 회피합니다.
          </p>
          <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>
            잠수함은 관측력 기반으로만 노출되며, 미사일은 타깃 지정 시 다음 턴 추적 타격됩니다.
          </p>
          <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>
            대기 뇌격기 스킬은 방향 관통형이며, 팀 공군 비허용 시 항모 수만큼만 출격 가능합니다.
          </p>
        </div>
      </div>

      {queuedSkills.length > 0 && (
        <div className="card" style={{ marginTop: '12px', padding: '10px' }}>
          <strong>예약된 해전 스킬:</strong>
          {queuedSkills.map((s, i) => (
            <div key={`${s.type}_${i}`} style={{ fontSize: '0.9rem', marginTop: '4px' }}>
              {s.type} {'->'} ({s.target?.x},{s.target?.y}) dir:{s.direction}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
