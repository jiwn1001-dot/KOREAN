'use client';

import React, { useState, useEffect } from 'react';
import { createLandBoard, calculateFogOfWar, resolveSimultaneousTurn, resolveCommanderSkills, calculateAIOrders, calculateAirInterception, TILE_TYPES } from '@/lib/landCombat';

export default function LandCombatBoard({ countryId, militaryUnits, corps, armies, generals, initialSession, onSaveSession }) {
  const [board, setBoard] = useState([]);
  const [unitsOnBoard, setUnitsOnBoard] = useState([]);
  const [orders, setOrders] = useState([]);
  const [fow, setFow] = useState([]);
  const [phase, setPhase] = useState('combat'); // combat, game_over, aerial_combat
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [activeSkills, setActiveSkills] = useState([]);
  const [usedSkills, setUsedSkills] = useState([]); // 세션당 1회 제한 트래킹
  const [hasAirSupremacy, setHasAirSupremacy] = useState(false); // 이번 턴 완전 제공권 여부
  const [targetingSkill, setTargetingSkill] = useState(null);
  const [hasRecon, setHasRecon] = useState(false);
  const [activeCorpsId, setActiveCorpsId] = useState(null); // 유저가 조작할 직속 군단 ID
  const [turn, setTurn] = useState(1);
  const [nukeUses, setNukeUses] = useState(0); // 핵무기/핵미사일 사용 횟수 (보유 수량만큼 제한)
  const [autoAirCombat, setAutoAirCombat] = useState(false); // 제공권 다이스 자동 위임
  const [orderMode, setOrderMode] = useState('move'); // 'move' | 'attack'

  // 보유 특수 유닛 스캔 및 공격력 추출 (보드나 투입 대기 중인 상태 등 필드에 있는 자기 유닛 기준)
  const specialUnits = React.useMemo(() => {
    const myUnits = unitsOnBoard.filter(u => u.owner === countryId);
    
    // 공격력 계산 로직 (동일 병과가 여러개면 최대 공격력 사용)
    const getMaxAttack = (subCat) => {
      const units = myUnits.filter(u => u.subCategory === subCat);
      if (units.length === 0) return { count: 0, damage: 0 };
      return { count: units.length, damage: Math.max(...units.map(u => u.attack || 0)) };
    };

    return {
      bomber: getMaxAttack('폭격기'),
      cas: getMaxAttack('근접항공지원기'),
      missile: getMaxAttack('미사일'),
      nuke: getMaxAttack('핵무기'),
      nukeMissile: getMaxAttack('핵미사일')
    };
  }, [unitsOnBoard, countryId]);

  // 초기화
  useEffect(() => {
    if (initialSession && initialSession.board) {
      setBoard(initialSession.board);
      setUnitsOnBoard(initialSession.units || []);
      setPhase(initialSession.phase || 'combat');
      setTurn(initialSession.turn || 1);
    } else {
      setBoard(createLandBoard());
    }
  }, [initialSession]);

  // 시야 계산
  useEffect(() => {
    if (board.length > 0) {
      const newFow = calculateFogOfWar(board, unitsOnBoard, countryId, hasRecon);
      setFow(newFow);
    }
  }, [board, unitsOnBoard, hasRecon, countryId]);

  const handleTileClick = (x, y) => {
    if (phase === 'combat') {
      const clickedUnit = unitsOnBoard.find(u => u.x === x && u.y === y && u.status === 'field');
      
      // 이미 유닛이 선택된 상태라면 명령(이동/공격) 예약
      if (selectedUnit) {
        if (orderMode === 'attack') {
          // 공격 예약
          setOrders(prev => [...prev.filter(o => o.unitId !== selectedUnit.id), { unitId: selectedUnit.id, type: 'attack', target: {x, y} }]);
          setSelectedUnit(null);
        } else {
          // 이동 예약
          const isAirdrop = selectedUnit.subCategory === '공수부대' && hasAirSupremacy;
          setOrders(prev => [...prev.filter(o => o.unitId !== selectedUnit.id), { unitId: selectedUnit.id, type: 'move', target: {x, y}, isAirdrop }]);
          setSelectedUnit(null);
        }
      } else {
        // 아군 유닛 선택 시 군단 권한 및 개입 5기 락 검사
        if (clickedUnit && clickedUnit.owner === countryId) {
          if (!clickedUnit.isHQ) {
            if (!activeCorpsId) {
              alert('먼저 직접 조작할 군단을 선택해주세요.');
              return;
            }
            
            // 타 군단 유닛인 경우 (개입)
            if (clickedUnit.corpsId !== activeCorpsId) {
              // 현재 명령이 내려진 타 군단 유닛 수 계산
              const otherCorpsOrdersCount = orders.filter(o => {
                const u = unitsOnBoard.find(x => x.id === o.unitId);
                return u && u.corpsId !== activeCorpsId && !u.isHQ;
              }).length;
              
              // 만약 이 유닛이 이미 명령을 받은 상태라면 선택을 허용 (명령 수정)
              const hasOrder = orders.some(o => o.unitId === clickedUnit.id);
              if (!hasOrder && otherCorpsOrdersCount >= 5) {
                alert('타 군단 개입은 한 턴에 최대 5기까지만 가능합니다! (사령부 제외 총 11기 조작 룰)');
                return;
              }
            }
          }
          setSelectedUnit(clickedUnit);
          setOrderMode(clickedUnit.subCategory === '포병' ? 'attack' : 'move'); // 포병은 기본적으로 포격 모드로 시작
        }
      }
    } else if (targetingSkill) {
       // 스킬 타겟팅 처리 (데미지도 함께 넘김)
       let skillDamage = 0;
       if (targetingSkill === 'bombing') skillDamage = specialUnits.bomber.damage;
       if (targetingSkill === 'cas') skillDamage = specialUnits.cas.damage;
       if (targetingSkill === 'missile') skillDamage = specialUnits.missile.damage;
       // 핵, 핵미사일, 해안포격, 독가스는 엔진에서 퍼센트/즉사 처리하므로 데미지 전달 생략 가능
       
       setActiveSkills(prev => [...prev, { type: targetingSkill, target: {x, y}, damage: skillDamage }]);
       
       if (['poison', 'naval_bombardment'].includes(targetingSkill)) {
         setUsedSkills(prev => [...prev, targetingSkill]); // 1회용 스킬 제한
       }
       if (['nuke', 'nuke_missile'].includes(targetingSkill)) {
         setNukeUses(prev => prev + 1); // 핵 사용 횟수 증가
       }

       setTargetingSkill(null);
       alert(`${targetingSkill} 타겟팅 완료`);
    }
  };

  const handleNextTurn = () => {
    let currentOrders = [...orders];
    
    // 1. AI 명령 산출 (현재 플레이어 소유가 아닌 유닛들, 그리고 유저가 조작하지 않는 아군 유닛들)
    const opponentIds = [...new Set(unitsOnBoard.map(u => u.owner).filter(o => o !== countryId))];
    opponentIds.forEach(oppId => {
      // AI에게 유저의 이동 명령을 전달하여 경로 양보(우회)를 계산하게 함
      const aiOrders = calculateAIOrders({ units: unitsOnBoard, userOrders: currentOrders, corps, generals }, oppId);
      currentOrders = currentOrders.concat(aiOrders);
    });

    // 아군이지만 유저가 직접 조작하지 않는 군단 유닛들도 AI가 조작
    const alliedAIOrders = calculateAIOrders({ 
      units: unitsOnBoard, 
      userOrders: currentOrders,
      corps,
      generals
    }, countryId, activeCorpsId); // activeCorpsId를 넘겨 해당 군단과 사령부는 AI에서 제외
    currentOrders = currentOrders.concat(alliedAIOrders);

    // 임시 세션 객체 구성
    const session = {
      board,
      units: JSON.parse(JSON.stringify(unitsOnBoard)), // 딥카피
      orders: currentOrders,
      skillsQueue: activeSkills,
      supplyLimit: 10,
      penetration: { [countryId]: 2, 'enemy': 2 }, // TODO: 실제 국가 스탯 연동
      antiAir: { [countryId]: 3, 'enemy': 3 }, // TODO: 실제 국가 스탯 연동
      resourceDeductions: [] // 이번 턴의 자원 소모 기록
    };
    
    let resolvedSession = resolveSimultaneousTurn(session);
    
    // 3. 턴 종료 스킬 후처리
    resolvedSession = resolveCommanderSkills(resolvedSession);
    
    // 승패(사령부 파괴) 판정
    const hqs = resolvedSession.units.filter(u => u.isHQ);
    const myHQ = hqs.find(u => u.owner === countryId);
    const enemyHQ = hqs.find(u => u.owner !== countryId);
    
    let nextPhase = phase;
    if (myHQ && myHQ.status === 'destroyed') {
      alert('아군 사령부가 파괴되었습니다! 패배!');
      nextPhase = 'game_over';
      setPhase('game_over');
    } else if (enemyHQ && enemyHQ.status === 'destroyed') {
      alert('적군 사령부를 파괴했습니다! 승리!');
      nextPhase = 'game_over';
      setPhase('game_over');
    }

    setUnitsOnBoard(resolvedSession.units);
    setBoard(resolvedSession.board);
    setOrders([]);
    setActiveSkills([]);
    setHasAirSupremacy(false); // 매 턴 시작 시 제공권 초기화 (매 턴 시도 가능)
    setTurn(t => t + 1);
    
    if (onSaveSession) {
      onSaveSession({
        board: resolvedSession.board,
        units: resolvedSession.units,
        phase: nextPhase,
        turn: turn + 1,
        resourceDeductions: resolvedSession.resourceDeductions
      });
    }
  };

  // 사이버네틱 UI 컬러 팔레트
  const uiColors = {
    glassBg: 'rgba(16, 24, 39, 0.7)',
    glassBorder: 'rgba(59, 130, 246, 0.5)',
    neonBlue: '#3b82f6',
    neonRed: '#ef4444',
    neonGreen: '#10b981',
    neonYellow: '#eab308'
  };

  // 타일 색상 반환 함수 (홀로그램 스타일)
  const getTileStyle = (type, isVisible, isSelected) => {
    if (!isVisible) return { backgroundColor: '#0f172a', border: '1px solid #1e293b' }; // 시야 밖 안개
    
    let bg = 'rgba(30, 41, 59, 0.6)';
    let border = '1px solid rgba(59, 130, 246, 0.2)';
    
    switch (type) {
      case TILE_TYPES.ROUGH: bg = 'rgba(139, 115, 85, 0.6)'; break;
      case TILE_TYPES.MOUNTAIN: bg = 'rgba(100, 116, 139, 0.8)'; border = '1px solid #94a3b8'; break;
      case TILE_TYPES.WATER: bg = 'rgba(14, 165, 233, 0.4)'; border = '1px solid #38bdf8'; break;
      case TILE_TYPES.FORTRESS: bg = 'rgba(34, 197, 94, 0.3)'; border = '1px solid #4ade80'; break;
      case TILE_TYPES.ULTIMATE_FORTRESS: bg = 'rgba(16, 185, 129, 0.6)'; border = '1px solid #34d399'; break;
      case TILE_TYPES.PEAK: bg = 'rgba(241, 245, 249, 0.9)'; border = '1px solid #fff'; break;
      default: break;
    }

    if (isSelected) {
      border = `2px solid ${uiColors.neonYellow}`;
      bg = 'rgba(234, 179, 8, 0.2)';
    }

    return { backgroundColor: bg, border, transition: 'all 0.2s ease-in-out' };
  };

  return (
    <div style={{
      padding: '24px', 
      background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)',
      minHeight: '100vh',
      color: '#e2e8f0',
      fontFamily: '"Inter", sans-serif'
    }}>
      <style>{`
        .cyber-panel {
          background: ${uiColors.glassBg};
          backdrop-filter: blur(12px);
          border: 1px solid ${uiColors.glassBorder};
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          padding: 20px;
        }
        .pulse-border {
          animation: pulseBorder 2s infinite;
        }
        @keyframes pulseBorder {
          0% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.7); }
          70% { box-shadow: 0 0 0 6px rgba(234, 179, 8, 0); }
          100% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0); }
        }
        .cyber-btn {
          background: rgba(30, 41, 59, 0.8);
          border: 1px solid #3b82f6;
          color: #60a5fa;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          font-weight: 600;
        }
        .cyber-btn:hover:not(:disabled) {
          background: #3b82f6;
          color: #fff;
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.5);
        }
        .cyber-btn:disabled {
          border-color: #475569;
          color: #475569;
          cursor: not-allowed;
          background: transparent;
        }
        .cyber-btn.active {
          background: #ef4444;
          border-color: #ef4444;
          color: #fff;
          box-shadow: 0 0 15px rgba(239, 68, 68, 0.5);
        }
      `}</style>

      <div className="cyber-panel" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, color: uiColors.neonBlue, textShadow: '0 0 10px rgba(59, 130, 246, 0.5)' }}>
              지상 작전 통제소 <span style={{ fontSize: '1rem', color: '#94a3b8' }}>| Turn {turn}</span>
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: '#cbd5e1' }}>
              {phase === 'aerial_combat' ? '공중 결전 시뮬레이션 중...' : '전술 지휘 및 교전 대기 중'}
            </p>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <select 
              style={{
                background: 'rgba(15, 23, 42, 0.8)', color: '#fff', border: `1px solid ${uiColors.glassBorder}`,
                padding: '8px 12px', borderRadius: '6px', outline: 'none'
              }}
              value={activeCorpsId || ''} 
              onChange={(e) => setActiveCorpsId(e.target.value)}
            >
              <option value="">-- 작전 통제 군단 지정 (직속 5기) --</option>
              {corps && corps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <button 
                className="cyber-btn"
                style={{ background: hasAirSupremacy ? uiColors.neonGreen : 'rgba(30,41,59,0.8)', borderColor: hasAirSupremacy ? uiColors.neonGreen : '#3b82f6', color: hasAirSupremacy ? '#fff' : '#60a5fa' }}
                onClick={() => {
                  if (autoAirCombat) {
                    const win = Math.random() > 0.5;
                    setHasAirSupremacy(win);
                  } else {
                    setPhase('aerial_combat');
                  }
                }}
              >
                {hasAirSupremacy ? '☁️ 제공권 장악' : '✈️ 제공권 시도'}
              </button>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input type="checkbox" checked={autoAirCombat} onChange={(e) => setAutoAirCombat(e.target.checked)} />
                AUTO 판정
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="cyber-panel" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.9rem', color: '#94a3b8', marginRight: '8px' }}>전술 스킬:</span>
          <button 
            className={`cyber-btn ${targetingSkill === 'bombing' ? 'active' : ''}`} 
            onClick={() => setTargetingSkill('bombing')}
            disabled={!hasAirSupremacy || specialUnits.bomber.count === 0 || activeSkills.length > 0}
            title={`보유: ${specialUnits.bomber.count}`}
          >🛩️ 폭격</button>
          
          <button 
            className={`cyber-btn ${targetingSkill === 'cas' ? 'active' : ''}`} 
            onClick={() => setTargetingSkill('cas')}
            disabled={specialUnits.cas.count === 0 || activeSkills.length > 0}
          >🛩️ CAS</button>
          
          <button 
            className={`cyber-btn ${targetingSkill === 'nuke' ? 'active' : ''}`} 
            onClick={() => setTargetingSkill('nuke')}
            disabled={!hasAirSupremacy || specialUnits.nuke.count <= nukeUses || activeSkills.length > 0}
          >☢️ 핵투발</button>

          <button 
            className={`cyber-btn ${targetingSkill === 'missile' ? 'active' : ''}`} 
            onClick={() => setTargetingSkill('missile')}
            disabled={specialUnits.missile.count === 0 || activeSkills.length > 0}
          >🚀 미사일</button>

          <button 
            className={`cyber-btn ${targetingSkill === 'nuke_missile' ? 'active' : ''}`} 
            onClick={() => setTargetingSkill('nuke_missile')}
            disabled={specialUnits.nukeMissile.count <= nukeUses || activeSkills.length > 0} 
          >☢️🚀 핵미사일</button>
          
          <button 
            className={`cyber-btn ${targetingSkill === 'poison' ? 'active' : ''}`} 
            onClick={() => setTargetingSkill('poison')}
            disabled={usedSkills.includes('poison') || activeSkills.length > 0}
          >🧪 독가스</button>
          <button 
            className={`cyber-btn ${targetingSkill === 'naval_bombardment' ? 'active' : ''}`} 
            onClick={() => setTargetingSkill('naval_bombardment')}
            disabled={usedSkills.includes('naval_bombardment') || activeSkills.length > 0}
          >🚢 해안포격</button>
          
          <button 
            className="cyber-btn"
            style={{ borderColor: uiColors.neonYellow, color: uiColors.neonYellow }}
            onClick={() => {
              setActiveSkills(prev => [...prev, { type: 'emp' }]);
              setUsedSkills(prev => [...prev, 'emp']);
              alert('EMP가 예약되었습니다. 턴 넘김 시 기계화 부대가 정지합니다.');
            }}
            disabled={usedSkills.includes('emp') || activeSkills.length > 0}
          >⚡ EMP</button>
          
          <button 
            className="cyber-btn"
            style={{ marginLeft: 'auto', borderColor: hasRecon ? uiColors.neonBlue : '#475569', background: hasRecon ? 'rgba(59,130,246,0.2)' : 'transparent' }}
            onClick={() => {
               setHasRecon(!hasRecon);
               if(!hasRecon) alert('정찰 스킬 발동! 맵 전체의 시야가 밝혀집니다.');
            }}
          >
            👁️ 정찰 {hasRecon ? 'ON' : 'OFF'}
          </button>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-danger" onClick={() => {
            if(confirm('정말 항복하시겠습니까? 남은 유닛의 손실 체력만큼 국가 자원이 소모됩니다.')) {
              setPhase('game_over');
              alert('항복했습니다! (국가 자원 차감 로직 실행됨)');
            }
          }}>🏳️ 항복</button>
          <button className="btn btn-primary" onClick={handleNextTurn} disabled={phase === 'aerial_combat'}>▶ 턴 넘김</button>
        </div>
      </div>

      {activeSkills.length > 0 && phase !== 'aerial_combat' && (
        <div className="cyber-panel" style={{ marginBottom: '20px', padding: '12px 20px', borderLeft: `4px solid ${uiColors.neonRed}` }}>
          <strong style={{ color: uiColors.neonRed, marginRight: '12px' }}>⚠️ 발사 시퀀스 대기 중: </strong>
          {activeSkills.map((s, i) => (
            <span key={i} style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: '4px 12px', borderRadius: '4px', fontSize: '0.9rem', border: '1px solid #ef4444' }}>
              {s.type === 'emp' ? 'EMP 전자기 펄스' : s.type === 'poison' ? `생화학 가스 T-(${s.target.x},${s.target.y})` : `정밀 타격 (${s.type})`}
            </span>
          ))}
        </div>
      )}

      {phase === 'game_over' ? (
        <div className="cyber-panel" style={{ textAlign: 'center', padding: '60px', marginTop: '40px' }}>
          <h2 style={{ color: uiColors.neonRed, fontSize: '2rem', textShadow: '0 0 20px rgba(239, 68, 68, 0.7)' }}>SIMULATION TERMINATED</h2>
          <p style={{ color: '#94a3b8', fontSize: '1.1rem', margin: '20px 0' }}>생존 병력 데이터가 저장되었습니다. 자원 차감 프로세스를 시작합니다.</p>
          <button className="cyber-btn" onClick={() => setPhase('combat')}>시스템 재부팅 (테스트)</button>
        </div>
      ) : phase === 'aerial_combat' ? (
        <div className="cyber-panel" style={{ textAlign: 'center', padding: '60px', marginTop: '40px', border: `1px solid ${uiColors.neonBlue}` }}>
          <h2 style={{ color: uiColors.neonBlue, fontSize: '2rem' }}>✈️ 제공권 장악 시퀀스</h2>
          <p style={{ color: '#94a3b8', fontSize: '1.1rem', margin: '20px 0 40px' }}>공중 우세를 점하기 위한 교전이 발생했습니다. 카드를 선택하십시오.</p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
            <button className="cyber-btn" style={{ borderColor: uiColors.neonYellow, color: uiColors.neonYellow }} onClick={() => {
              const intercepted = calculateAirInterception(2, 3);
              if (intercepted) {
                setActiveSkills(prev => prev.filter(s => s.type !== 'bombing'));
                setPhase('combat');
                alert('💥 다이스 요격 성공! 방어막이 활성화되었습니다.');
              } else {
                setActiveSkills(prev => prev.map(s => s.type === 'bombing' ? { ...s, pending: false, damage: 100 } : s));
                setPhase('combat');
                alert('✈️ 다이스 요격 실패! 공격 대형이 목표로 진입합니다.');
              }
            }}>🎲 다이스 자동 요격 굴림</button>
            <button className="cyber-btn" style={{ background: uiColors.neonGreen, color: '#fff', borderColor: uiColors.neonGreen }} onClick={() => { setHasAirSupremacy(true); setPhase('combat'); }}>🏆 공중전 승리 (시뮬레이션)</button>
            <button className="cyber-btn" style={{ background: uiColors.neonRed, color: '#fff', borderColor: uiColors.neonRed }} onClick={() => { setHasAirSupremacy(false); setPhase('combat'); }}>💀 공중전 패배 (시뮬레이션)</button>
          </div>
        </div>
      ) : (
      <div style={{ display: 'flex', gap: '24px' }}>
        {/* 20x20 사이버네틱 보드 렌더링 */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(20, 32px)', 
          gridTemplateRows: 'repeat(20, 32px)', 
          gap: '2px',
          background: 'rgba(15, 23, 42, 0.9)',
          padding: '8px',
          borderRadius: '12px',
          border: `2px solid ${uiColors.glassBorder}`,
          boxShadow: '0 0 30px rgba(59, 130, 246, 0.2)'
        }}>
          {board.map((row, y) => row.map((tile, x) => {
            const isVisible = fow[y] && fow[y][x];
            const unit = unitsOnBoard.find(u => u.x === x && u.y === y && u.status === 'field');
            const hasOrder = orders.find(o => o.unitId === unit?.id);
            const isSelected = selectedUnit?.id === unit?.id;
            const hpRatio = unit ? Math.max(0, unit.hp / (unit.maxHp || 100)) : 1;
            
            const style = getTileStyle(tile.type, isVisible, isSelected);

            return (
              <div 
                key={`${x}-${y}`}
                className={isSelected ? 'pulse-border' : ''}
                onClick={() => handleTileClick(x, y)}
                style={{
                  ...style,
                  position: 'relative',
                  cursor: 'crosshair',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={isVisible ? `(${x},${y}) ${tile.type}` : 'NO SIGNAL'}
              >
                {isVisible && unit && (
                  <div style={{
                    width: '24px',
                    height: '24px',
                    backgroundColor: unit.owner === countryId ? 'rgba(59, 130, 246, 0.8)' : 'rgba(239, 68, 68, 0.8)',
                    borderRadius: '4px',
                    border: `1px solid ${unit.owner === countryId ? '#60a5fa' : '#fca5a5'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: `0 0 8px ${unit.owner === countryId ? 'rgba(59, 130, 246, 0.6)' : 'rgba(239, 68, 68, 0.6)'}`
                  }}>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#fff', textShadow: '1px 1px 0 #000' }}>
                      {unit.isHQ ? 'HQ' : unit.name?.substring(0,2)}
                    </span>
                    {/* 미니 체력 바 */}
                    <div style={{ position: 'absolute', bottom: '-4px', width: '100%', height: '3px', background: '#333', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${hpRatio * 100}%`, height: '100%', background: hpRatio > 0.5 ? '#10b981' : hpRatio > 0.2 ? '#eab308' : '#ef4444' }}></div>
                    </div>
                  </div>
                )}
                
                {/* 오더(예약된 행동) 타겟 표시 */}
                {isVisible && orders.find(o => o.target && o.target.x === x && o.target.y === y) && (
                  <div style={{ 
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', 
                    width: '12px', height: '12px', border: `2px solid ${uiColors.neonYellow}`, borderRadius: '50%',
                    animation: 'pulseBorder 1.5s infinite'
                  }}></div>
                )}
              </div>
            );
          }))}
        </div>

        {/* 사이드바 HUD */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="cyber-panel" style={{ flex: 1 }}>
            <h4 style={{ color: uiColors.neonBlue, marginTop: 0, borderBottom: `1px solid ${uiColors.glassBorder}`, paddingBottom: '8px' }}>📡 텔레메트리 (선택된 유닛)</h4>
            {selectedUnit ? (
              <div>
                <h3 style={{ color: '#fff', margin: '12px 0 4px 0' }}>{selectedUnit.name} <span style={{ fontSize: '0.8rem', color: uiColors.neonYellow }}>[{selectedUnit.subCategory}]</span></h3>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0 0 16px 0' }}>{selectedUnit.isHQ ? '전략 지휘 사령부' : '지상 교전 유닛'} | 좌표: ({selectedUnit.x}, {selectedUnit.y})</p>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>INTEGRITY (HP)</div>
                    <div style={{ color: '#fff', fontWeight: 'bold' }}>{selectedUnit.hp} / {selectedUnit.maxHp || 100}</div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>MOBILITY (SPD)</div>
                    <div style={{ color: '#fff', fontWeight: 'bold' }}>{selectedUnit.speed} 칸/턴</div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>FIREPOWER (ATK)</div>
                    <div style={{ color: '#fff', fontWeight: 'bold' }}>{selectedUnit.attack}</div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>ARMOR (DEF)</div>
                    <div style={{ color: '#fff', fontWeight: 'bold' }}>{selectedUnit.defense}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {selectedUnit.subCategory === '포병' && (
                    <button className="cyber-btn" style={{ flex: 1, borderColor: uiColors.neonYellow, color: uiColors.neonYellow }} onClick={() => setOrderMode(orderMode === 'move' ? 'attack' : 'move')}>
                      모드 전환: {orderMode === 'move' ? '이동' : '포격'}
                    </button>
                  )}
                  <button className="cyber-btn" style={{ flex: 1, borderColor: uiColors.neonRed, color: uiColors.neonRed }} onClick={() => {
                    setOrders(prev => [...prev.filter(o => o.unitId !== selectedUnit.id), { unitId: selectedUnit.id, type: 'retreat' }]);
                    setSelectedUnit(null);
                  }}>🚨 전술 후퇴 (대기 전환)</button>
                  <button className="cyber-btn" style={{ flex: 1 }} onClick={() => {
                    setOrders(prev => prev.filter(o => o.unitId !== selectedUnit.id));
                    setSelectedUnit(null);
                  }}>🛑 지시 취소</button>
                </div>
              </div>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontStyle: 'italic' }}>
                전술 지도에서 유닛을 선택하여 상세 정보를 확인하십시오.
              </div>
            )}
          </div>

          <div className="cyber-panel" style={{ flex: 1 }}>
            <h4 style={{ color: uiColors.neonBlue, marginTop: 0, borderBottom: `1px solid ${uiColors.glassBorder}`, paddingBottom: '8px' }}>📋 오퍼레이션 큐 (예약된 명령)</h4>
            <ul style={{ paddingLeft: 0, listStyle: 'none', margin: 0, fontSize: '0.9rem', maxHeight: '200px', overflowY: 'auto' }}>
              {orders.length === 0 && <li style={{ color: '#475569', textAlign: 'center', padding: '20px 0' }}>대기 중인 명령이 없습니다.</li>}
              {orders.map((o, idx) => {
                const u = unitsOnBoard.find(x => x.id === o.unitId);
                return (
                  <li key={idx} style={{ background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: '4px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#e2e8f0' }}>{u?.name}</span>
                    <span style={{ color: o.type === 'attack' ? uiColors.neonRed : o.type === 'move' ? uiColors.neonBlue : uiColors.neonYellow }}>
                      {o.type === 'move' ? `➡️ 이동 (${o.target.x}, ${o.target.y})` : o.type === 'attack' ? `💥 포격 (${o.target.x}, ${o.target.y})` : '🔙 후퇴'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
