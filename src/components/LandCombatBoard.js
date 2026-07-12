'use client';

import React, { useState, useEffect } from 'react';
import { createLandBoard, calculateFogOfWar, resolveSimultaneousTurn, resolveCommanderSkills, calculateAIOrders, calculateAirInterception, calculateCasualties, TILE_TYPES, deployAIUnits } from '@/lib/landCombat';
import AerialMinigame from '@/components/AerialMinigame';
import { applyCombatCasualties } from '@/lib/store';

export default function LandCombatBoard({ countryId, militaryUnits, corps, armies, generals, initialSession, onSaveSession }) {
  const isTeam1 = initialSession?.isTeamBattle ? initialSession.team1?.includes(countryId) : (initialSession?.host === countryId);
  const mySupplyLimit = isTeam1 ? (initialSession?.supplyLimitTeam1 || 10) : (initialSession?.supplyLimitTeam2 || 10);

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
  const [autoMode, setAutoMode] = useState(false); // 전투 AI 위임 (Auto)
  const [orderMode, setOrderMode] = useState('move'); // 'move' | 'attack'
  const [selectedStandbyUnitId, setSelectedStandbyUnitId] = useState(null);

  const hasMainSkillQueued = activeSkills.some(s => s.type !== 'recon');

  const getStandbySkillUnits = React.useCallback((skillType) => {
    const myStandbyUnits = unitsOnBoard.filter(u => u.owner === countryId && u.status === 'standby');

    if (skillType === 'poison') {
      return myStandbyUnits.filter(u => u.minorCategory === '독가스' || u.subCategory === '독가스');
    }
    if (skillType === 'bombing') {
      return myStandbyUnits.filter(u => u.minorCategory === '폭격기' || u.subCategory === '폭격기');
    }
    if (skillType === 'cas') {
      return myStandbyUnits.filter(u => u.minorCategory === '근접항공지원기' || u.subCategory === '근접항공지원기');
    }
    if (skillType === 'missile') {
      return myStandbyUnits.filter(u => u.minorCategory === '미사일' || u.subCategory === '미사일');
    }
    if (skillType === 'nuke') {
      return myStandbyUnits.filter(u => u.minorCategory === '핵무기' || u.subCategory === '핵무기');
    }
    if (skillType === 'nuke_missile') {
      return myStandbyUnits.filter(u => u.minorCategory === '핵미사일' || u.subCategory === '핵미사일');
    }
    return [];
  }, [unitsOnBoard, countryId]);

  const pickSkillConsumer = React.useCallback((skillType) => {
    const candidates = getStandbySkillUnits(skillType);
    if (!candidates.length) {
      alert('해당 스킬을 사용할 수 있는 대기 상태 유닛이 없습니다.');
      return null;
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    const optionsText = candidates
      .map((u, idx) => `${idx + 1}. ${u.name || u.id} (공:${u.attack || 0}, 속:${u.speed || 1}, 유효:${u.effectDuration || 1})`)
      .join('\n');
    const raw = window.prompt(`사용할 ${skillType} 유닛 번호를 입력하세요:\n${optionsText}`, '1');
    if (!raw) return null;
    const idx = parseInt(raw, 10) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= candidates.length) {
      alert('잘못된 번호입니다.');
      return null;
    }

    return candidates[idx];
  }, [getStandbySkillUnits]);

  const beginSkillTargeting = React.useCallback((skillType) => {
    if (!hasAirSupremacy && ['bombing', 'cas', 'nuke', 'nuke_missile', 'poison'].includes(skillType)) {
      alert('제공권 확보 후 사용할 수 있는 스킬입니다.');
      return;
    }
    if (hasMainSkillQueued) {
      alert('정찰을 제외한 스킬은 턴당 1종류만 사용할 수 있습니다.');
      return;
    }

    const selected = pickSkillConsumer(skillType);
    if (!selected) return;

    const radius = (skillType === 'nuke' || skillType === 'nuke_missile')
      ? Math.max(1, Math.min(3, parseInt(selected.speed || 1, 10)))
      : 1;

    const skillData = {
      type: skillType,
      consumerId: selected.id,
      damage: Math.max(1, selected.attack || 1),
      duration: Math.max(1, selected.effectDuration || 1),
      aircraftSpeed: Math.max(1, selected.speed || 1),
      radius
    };

    setTargetingSkill(skillData);
  }, [hasAirSupremacy, hasMainSkillQueued, pickSkillConsumer]);

  // 보유 특수 유닛 스캔 및 공격력 추출 (보드나 투입 대기 중인 상태 등 필드에 있는 자기 유닛 기준)
  const specialUnits = React.useMemo(() => {
    const myUnits = unitsOnBoard.filter(u => u.owner === countryId);
    
    // 공격력 계산 로직 (동일 병과가 여러개면 최대 공격력 사용)
    const getMaxAttack = (minorCat) => {
      const units = myUnits.filter(u => u.minorCategory === minorCat || u.subCategory === minorCat);
      if (units.length === 0) return { count: 0, damage: 0, units: [] };
      return { count: units.length, damage: Math.max(...units.map(u => u.attack || 0)), units: units };
    };

    return {
      bomber: getMaxAttack('폭격기'),
      cas: getMaxAttack('근접항공지원기'),
      missile: getMaxAttack('미사일'),
      nuke: getMaxAttack('핵무기'),
      nukeMissile: getMaxAttack('핵미사일'),
      chemical: getMaxAttack('독가스')
    };
  }, [unitsOnBoard, countryId]);

  // 초기화
  useEffect(() => {
    if (initialSession && initialSession.board) {
      setBoard(initialSession.board);
      setUnitsOnBoard(initialSession.units || []);
      
      let computedPhase = initialSession.phase || 'deployment';
      if (initialSession.status === 'playing') computedPhase = 'combat';
      
      setPhase(computedPhase);
      setTurn(initialSession.turn || 1);
      setUsedSkills(initialSession.usedSkills || []);
      setNukeUses(initialSession.nukeUses || 0);
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

  // 동시 턴 동기화 훅
  useEffect(() => {
    if (!initialSession) return;

    // 게임 종료 및 항복 동기화 로직
    if (initialSession.phase === 'game_over' && phase !== 'game_over') {
      if (initialSession.surrendered && initialSession.surrendered !== countryId) {
        alert('상대방이 전술적 항복을 선언했습니다! 아군의 승리입니다!');
      }
      setPhase('game_over');
      return;
    }

    if ((phase !== 'combat' && phase !== 'aerial_combat') || !initialSession.players) return;

    // 참가자 동기화 로직 (turn이 올랐을 때)
    if (initialSession.turn && initialSession.turn > turn) {
      setBoard(initialSession.board);
      setUnitsOnBoard(initialSession.units);
      setTurn(initialSession.turn);
      setPhase(initialSession.phase || 'combat');
      setOrders([]);
      setActiveSkills([]);
      setHasAirSupremacy(false);
      setHasRecon(false);
      return;
    }

    // Host 전용 로직 (AI 혹은 멀티플레이 결산)
    const isTeam1 = initialSession.isTeamBattle ? initialSession.team1?.includes(countryId) : (initialSession.host === countryId);
    if (!isTeam1) return; // 호스트만 연산

    let nextPlayers = { ...initialSession.players };
    
    // 모든 AI 플레이어는 항상 준비된 상태로 간주
    Object.values(nextPlayers).forEach(player => {
      if (player?.isAI) {
        player.ready = true;
      }
    });

    const allReady = Object.values(nextPlayers).every(p => p.ready);
    
    if (allReady && (!initialSession.turn || initialSession.turn === turn)) {
      resolveHostTurn(nextPlayers);
    }
  }, [initialSession, phase, turn, unitsOnBoard, countryId]);

  const handleTileClick = (x, y) => {
    if (phase === 'deployment') {
      const existingFieldUnit = unitsOnBoard.find(u => u.x === x && u.y === y && u.status === 'field' && u.owner === countryId);
      
      // 이미 필드에 있는 내 유닛을 클릭하면 다시 대기 상태로 돌림
      if (existingFieldUnit) {
        setUnitsOnBoard(unitsOnBoard.map(u => u.id === existingFieldUnit.id ? { ...u, status: 'standby' } : u));
        return;
      }

      if (!selectedStandbyUnitId) {
        alert('배치할 대기 사단을 먼저 선택해주세요. (필드에 배치된 아군 유닛을 클릭하면 대기열로 되돌릴 수 있습니다.)');
        return;
      }
      
      // Check deployment zone
      const isTeam1 = initialSession?.isTeamBattle ? initialSession.team1.includes(countryId) : (initialSession?.host === countryId);
      const isTeam2 = initialSession?.isTeamBattle ? initialSession.team2.includes(countryId) : (initialSession?.opponent === countryId);
      const isSiegeDefense = initialSession?.battleMode === 'siege' && initialSession?.status === 'defense_prep' && isTeam2;
      
      if (!isSiegeDefense) {
        if (isTeam1 && x > 9) return alert('배치 구역을 벗어났습니다. (x <= 9)');
        if (!isTeam1 && x < 10) return alert('배치 구역을 벗어났습니다. (x >= 10)');
      }

      // Check if tile is empty
      if (unitsOnBoard.some(u => u.x === x && u.y === y && u.status === 'field')) {
        return alert('이미 유닛이 있는 자리입니다.');
      }

      const unitToDeploy = unitsOnBoard.find(u => u.id === selectedStandbyUnitId);
      if (!unitToDeploy) return;

      // Check supply limit (HQ is 0, Air units in standby also consume supply)
      const currentSupply = unitsOnBoard.filter(u => u.owner === countryId && (u.status === 'field' || (u.status === 'standby' && u.majorCategory === '공군'))).reduce((acc, u) => acc + (u.supplyConsumption || 0), 0);
      if (currentSupply + (unitToDeploy.supplyConsumption || 0) > mySupplyLimit) {
        return alert(`보급 한계(${mySupplyLimit})를 초과하여 배치할 수 없습니다.`);
      }

      const updatedUnits = unitsOnBoard.map(u => {
        if (u.id === selectedStandbyUnitId) {
          return { ...u, x, y, status: 'field' };
        }
        return u;
      });
      
      setUnitsOnBoard(updatedUnits);
      setSelectedStandbyUnitId(null);
    } else if (phase === 'combat') {
      if (selectedStandbyUnitId) {
        const validX = isTeam1 ? 0 : 19;
        
        if (x !== validX) return alert('전투 중 예비대 투입은 아군 진영의 맨 끝 줄에만 가능합니다.');
        if (unitsOnBoard.some(u => u.x === x && u.y === y && u.status === 'field')) return alert('이미 유닛이 있는 자리입니다.');

        const unitToDeploy = unitsOnBoard.find(u => u.id === selectedStandbyUnitId);
        const currentSupply = unitsOnBoard.filter(u => u.owner === countryId && (u.status === 'field' || (u.status === 'standby' && u.majorCategory === '공군'))).reduce((acc, u) => acc + (u.supplyConsumption || 0), 0);
        const queuedSpawns = orders.filter(o => o.type === 'spawn').reduce((acc, o) => {
          const su = unitsOnBoard.find(u => u.id === o.unitId);
          return acc + (su?.supplyConsumption || 0);
        }, 0);

        if (currentSupply + queuedSpawns + (unitToDeploy?.supplyConsumption || 0) > mySupplyLimit) {
          return alert(`보급 한계(${mySupplyLimit})를 초과하여 투입할 수 없습니다.`);
        }

        setOrders(prev => [...prev.filter(o => o.unitId !== selectedStandbyUnitId), { unitId: selectedStandbyUnitId, type: 'spawn', target: {x, y} }]);
        setSelectedStandbyUnitId(null);
        return;
      }
      
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
    } else if (targetingSkill?.type) {
       if (targetingSkill.type === 'missile') {
         const targetUnit = unitsOnBoard.find(u => u.x === x && u.y === y && u.status === 'field' && u.owner !== countryId && !u.isHQ);
         if (!targetUnit) {
           alert('미사일은 적 유닛이 있는 타일에만 사용할 수 있습니다.');
           return;
         }
       }

       setActiveSkills(prev => [...prev, { ...targetingSkill, target: {x, y} }]);

       if (['poison', 'naval_bombardment'].includes(targetingSkill.type)) {
         setUsedSkills(prev => [...prev, targetingSkill.type]);
       }
       if (['nuke', 'nuke_missile'].includes(targetingSkill.type)) {
         setNukeUses(prev => prev + 1);
       }

       setTargetingSkill(null);
       alert(`${targetingSkill.type} 타겟팅 완료`);
    }
  };

  const handleDeployComplete = () => {
    let updatedUnits = [...unitsOnBoard];
    const myHQ = updatedUnits.find(u => u.owner === countryId && u.isHQ);
    const isTeam1 = initialSession?.isTeamBattle ? initialSession.team1.includes(countryId) : (initialSession?.host === countryId);
    const isTeam2 = initialSession?.isTeamBattle ? initialSession.team2.includes(countryId) : (initialSession?.opponent === countryId);
    const isSiegeDefense = initialSession?.battleMode === 'siege' && initialSession?.status === 'defense_prep' && isTeam2;

    // HQ 강제 배치 로직
    if (myHQ && myHQ.status === 'standby') {
      let hqPlaced = false;
      const xRange = isTeam1 ? [0, 9] : [10, 19];
      // 빈 자리 찾기
      for (let x = xRange[0]; x <= xRange[1] && !hqPlaced; x++) {
        for (let y = 0; y < 20 && !hqPlaced; y++) {
          if (!updatedUnits.some(u => u.x === x && u.y === y && u.status === 'field')) {
            myHQ.x = x;
            myHQ.y = y;
            myHQ.status = 'field';
            hqPlaced = true;
          }
        }
      }
      
      // 구역 내 빈 자리가 전혀 없다면, 랜덤하게 유닛 하나를 대기로 돌리고 강제 스폰
      if (!hqPlaced) {
        const myDeployedUnits = updatedUnits.filter(u => u.owner === countryId && u.status === 'field' && !u.isHQ);
        if (myDeployedUnits.length > 0) {
          const victim = myDeployedUnits[Math.floor(Math.random() * myDeployedUnits.length)];
          victim.status = 'standby';
          myHQ.x = victim.x;
          myHQ.y = victim.y;
          myHQ.status = 'field';
          alert(`사령부 배치를 위해 ${victim.name} 유닛이 대기 상태로 강제 전환되었습니다.`);
        }
      } else {
        alert('사령부를 배치하지 않아 시스템이 무작위 빈 공간에 사령부를 강제 배치했습니다.');
      }
    }

    // AI 자동 배치 호출 (적군 및 아군 AI)
    // AI의 배치를 위해 업데이트된 unitsOnBoard를 넘김
    updatedUnits = deployAIUnits(updatedUnits, initialSession, countryId);

    setUnitsOnBoard(updatedUnits);
    setSelectedStandbyUnitId(null);

    let nextPlayers = { ...initialSession.players };
    if (nextPlayers[countryId]) {
      nextPlayers[countryId].ready = true;
    }

    // AI 상대방 처리 (AI는 항상 ready로 간주)
    if (initialSession.opponent === 'AI' && nextPlayers['AI']) {
      nextPlayers['AI'].ready = true;
    }

    const allReady = Object.values(nextPlayers).every(p => p.ready);
    let nextStatus = initialSession.status;
    let nextPhase = 'deployment';
    
    if (allReady) {
      nextStatus = 'playing';
      nextPhase = 'combat';
      alert('모든 플레이어가 배치를 완료하여 1턴이 시작됩니다!');
    } else {
      if (isSiegeDefense) {
        alert('사전 방어 배치가 완료되었습니다. 로비로 이동하여 침공을 대기하십시오.');
      } else {
        alert('배치가 완료되었습니다. 상대방을 기다립니다...');
      }
    }

    if (onSaveSession) {
      onSaveSession({
        units: updatedUnits,
        players: nextPlayers,
        status: nextStatus,
        phase: nextPhase
      });
    }
  };

  const handleNextTurn = () => {
    let nextPlayers = { ...initialSession.players };
    
    // 내 클라이언트 소유의 AI 명령 산출 (위임했거나 선택되지 않은 군단)
    const excludeCorps = autoMode ? null : activeCorpsId;
    const { orders: alliedAIOrders, skills: alliedAISkills } = calculateAIOrders({ 
      units: unitsOnBoard, 
      userOrders: orders,
      corps,
      generals,
      armies
    }, countryId, excludeCorps); 
    
    const finalOrders = [...orders, ...alliedAIOrders];
    const finalSkills = [...activeSkills, ...alliedAISkills];

    if (nextPlayers[countryId]) {
      nextPlayers[countryId].ready = true;
      nextPlayers[countryId].orders = finalOrders;
      nextPlayers[countryId].skills = finalSkills;
    }
    if (onSaveSession) {
      onSaveSession({ players: nextPlayers });
    }
    alert('명령이 하달되었습니다. 상대방의 지시를 기다리는 중입니다...');
  };

  const resolveHostTurn = async (playersData) => {
    let currentOrders = [];
    let aiSkillsCombined = [];

    // 1. Gather all user orders & skills
    Object.keys(playersData).forEach(pId => {
      if (playersData[pId].orders) currentOrders = currentOrders.concat(playersData[pId].orders);
      if (playersData[pId].skills) aiSkillsCombined = aiSkillsCombined.concat(playersData[pId].skills);
    });

    // 2. Generate AI orders for any AI-controlled player
    Object.keys(playersData).forEach(pId => {
      const player = playersData[pId];
      if (player && player.isAI) {
        const { orders: aiOrders, skills: aiSkills } = calculateAIOrders({ units: unitsOnBoard, userOrders: currentOrders, corps, generals, armies }, pId);
        currentOrders = currentOrders.concat(aiOrders);
        aiSkillsCombined = aiSkillsCombined.concat(aiSkills);
      }
    });

    // (삭제됨: 아군 AI 연산은 이제 각 클라이언트의 handleNextTurn에서 개별적으로 산출되어 서버로 전달됨)

    // 3. Extract Stats
    const countryStatsMap = {};
    if (initialSession && initialSession.players) {
      Object.keys(initialSession.players).forEach(pId => {
        countryStatsMap[pId] = initialSession.players[pId].stats || { penetration: 0, antiAir: 0, vision: 0 };
      });
    }
    if (!countryStatsMap['enemy']) countryStatsMap['enemy'] = { penetration: 0, antiAir: 0, vision: 0 };

    const session = {
      board,
      units: JSON.parse(JSON.stringify(unitsOnBoard)),
      orders: currentOrders,
      skillsQueue: [...aiSkillsCombined], // combined all skills
      supplyLimitTeam1: initialSession?.supplyLimitTeam1 || 10,
      supplyLimitTeam2: initialSession?.supplyLimitTeam2 || 10,
      penetration: { [countryId]: countryStatsMap[countryId]?.penetration || 0, 'enemy': countryStatsMap['enemy']?.penetration || 0 }, 
      antiAir: { [countryId]: countryStatsMap[countryId]?.antiAir || 0, 'enemy': countryStatsMap['enemy']?.antiAir || 0 }, 
      vision: { [countryId]: countryStatsMap[countryId]?.vision || 0, 'enemy': countryStatsMap['enemy']?.vision || 0 },
      resourceDeductions: []
    };
    
    let resolvedSession = resolveSimultaneousTurn(session);
    resolvedSession = resolveCommanderSkills(resolvedSession);
    
    const hqs = resolvedSession.units.filter(u => u.isHQ);
    const myHQ = hqs.find(u => u.owner === countryId);
    const enemyHQ = hqs.find(u => u.owner !== countryId);
    
    let nextPhase = phase;
    let casualties = null;
    let isGameOver = false;

    if (myHQ && myHQ.status === 'destroyed') {
      alert('아군 사령부가 파괴되었습니다! 패배!');
      nextPhase = 'game_over';
      isGameOver = true;
      resolvedSession.winner = enemyHQ ? enemyHQ.owner : initialSession.opponent;
    } else if (enemyHQ && enemyHQ.status === 'destroyed') {
      alert('적군 사령부를 파괴했습니다! 승리!');
      nextPhase = 'game_over';
      isGameOver = true;
      resolvedSession.winner = countryId;
    }

    if (isGameOver) {
      casualties = calculateCasualties(resolvedSession.units);
      await applyCombatCasualties(casualties);
    }

    // Reset players ready state and orders
    let nextPlayers = { ...playersData };
    Object.keys(nextPlayers).forEach(pId => {
      nextPlayers[pId].ready = false;
      nextPlayers[pId].orders = [];
      nextPlayers[pId].skills = [];
    });

    if (onSaveSession) {
      const saveData = {
        board: resolvedSession.board,
        units: resolvedSession.units,
        phase: nextPhase,
        turn: turn + 1,
        players: nextPlayers,
        resourceDeductions: resolvedSession.resourceDeductions,
        casualties
      };
      if (isGameOver) saveData.winner = resolvedSession.winner;
      
      onSaveSession(saveData);
    }
  };

  const handleSurrender = async () => {
    if (window.confirm("정말로 항복하시겠습니까? 남은 병력의 체력에 비례해 자원이 크게 소실됩니다.")) {
      const casualties = calculateCasualties(unitsOnBoard);
      await applyCombatCasualties(casualties);
      alert('항복했습니다. 전투를 종료합니다.');
      setPhase('game_over');
      if (onSaveSession) {
        onSaveSession({
          board,
          units: unitsOnBoard,
          phase: 'game_over',
          turn,
          resourceDeductions: [],
          casualties
        });
      }
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
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="cyber-btn"
              onClick={handleNextTurn}
              disabled={phase === 'aerial_combat' || phase === 'game_over' || initialSession?.players?.[countryId]?.ready}
            >
              {initialSession?.players?.[countryId]?.ready ? '⏳ 상대방 대기 중...' : '▶ 턴 넘기기 (명령 하달)'}
            </button>
            <button
              className="cyber-btn"
              style={{ background: 'rgba(239, 68, 68, 0.8)', borderColor: '#ef4444', color: '#fff', marginLeft: 'auto' }}
              onClick={handleSurrender}
              disabled={phase === 'game_over'}
            >
              🏳️ 항복하기
            </button>
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
              <option value="">-- 작전 통제 군단 지정 (직속 5기 이하) --</option>
              {corps && corps.map(c => {
                const overLimit = unitsOnBoard.filter(u => u.corpsId === c.id && !u.isHQ).length > 5;
                return (
                  <option key={c.id} value={c.id} disabled={overLimit}>
                    {c.name} {overLimit ? '(6개 이상 불가)' : ''}
                  </option>
                );
              })}
            </select>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <button 
                className="cyber-btn"
                style={{ background: hasAirSupremacy ? uiColors.neonGreen : 'rgba(30,41,59,0.8)', borderColor: hasAirSupremacy ? uiColors.neonGreen : '#3b82f6', color: hasAirSupremacy ? '#fff' : '#60a5fa' }}
                onClick={() => {
                  // If autoAirCombat is enabled, resolve locally. Otherwise require opponent readiness before opening aerial UI.
                  if (autoAirCombat) {
                    const win = Math.random() > 0.5;
                    setHasAirSupremacy(win);
                    alert(win ? '자동 주사위 판정 승리! 제공권을 장악했습니다.' : '자동 주사위 판정 패배. 제공권 확보에 실패했습니다.');
                    return;
                  }

                  // If there's a multiplayer session, require all players to be ready before starting the aerial minigame.
                  const players = initialSession?.players;
                  const allReady = players ? Object.values(players).every(p => p.ready) : true;
                  if (!allReady) {
                    alert('상대방이 아직 준비되지 않았습니다. 상대의 선택을 기다려 주세요.');
                    return;
                  }

                  setPhase('aerial_combat');
                }}
              >
                {hasAirSupremacy ? '☁️ 제공권 장악' : '✈️ 제공권 시도'}
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" id="autoAirToggle" checked={autoAirCombat} onChange={e => setAutoAirCombat(e.target.checked)} />
              <label htmlFor="autoAirToggle" style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>공중전 자동 결전</label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
              <input type="checkbox" id="autoModeToggle" checked={autoMode} onChange={e => {
                setAutoMode(e.target.checked);
                if (e.target.checked) setOrders([]); // 위임 시 유저가 내린 명령 취소
              }} />
              <label htmlFor="autoModeToggle" style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>전투 AI 위임 (Auto)</label>
            </div>
            </div>
          </div>
        </div>
      </div>

      <div className="cyber-panel" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.9rem', color: '#94a3b8', marginRight: '8px' }}>전술 스킬:</span>
          <button 
            className={`cyber-btn ${targetingSkill?.type === 'bombing' ? 'active' : ''}`} 
            onClick={() => beginSkillTargeting('bombing')}
            disabled={!hasAirSupremacy || getStandbySkillUnits('bombing').length === 0 || hasMainSkillQueued}
            title={`대기 보유: ${getStandbySkillUnits('bombing').length}`}
          >🛩️ 폭격</button>
          
          <button 
            className={`cyber-btn ${targetingSkill?.type === 'cas' ? 'active' : ''}`} 
            onClick={() => beginSkillTargeting('cas')}
            disabled={!hasAirSupremacy || getStandbySkillUnits('cas').length === 0 || hasMainSkillQueued}
          >🛩️ CAS</button>
          
          <button 
            className={`cyber-btn ${targetingSkill?.type === 'nuke' ? 'active' : ''}`} 
            onClick={() => beginSkillTargeting('nuke')}
            disabled={!hasAirSupremacy || getStandbySkillUnits('nuke').length === 0 || hasMainSkillQueued}
          >☢️ 핵투발</button>

          <button 
            className={`cyber-btn ${targetingSkill?.type === 'missile' ? 'active' : ''}`} 
            onClick={() => beginSkillTargeting('missile')}
            disabled={getStandbySkillUnits('missile').length === 0 || hasMainSkillQueued}
          >🚀 미사일</button>

          <button 
            className={`cyber-btn ${targetingSkill?.type === 'nuke_missile' ? 'active' : ''}`} 
            onClick={() => beginSkillTargeting('nuke_missile')}
            disabled={!hasAirSupremacy || getStandbySkillUnits('nuke_missile').length === 0 || hasMainSkillQueued} 
          >☢️🚀 핵미사일</button>
          
          <button 
            className={`cyber-btn ${targetingSkill?.type === 'poison' ? 'active' : ''}`} 
            onClick={() => beginSkillTargeting('poison')}
            disabled={!hasAirSupremacy || getStandbySkillUnits('poison').length === 0 || usedSkills.includes('poison') || hasMainSkillQueued}
          >🧪 독가스</button>
          <button 
            className={`cyber-btn ${targetingSkill?.type === 'naval_bombardment' ? 'active' : ''}`} 
            onClick={() => {
              if(!initialSession.allowNavalBombardment) {
                alert('관리자에 의해 해안포격 스킬 사용이 금지된 전장입니다.');
                return;
              }
              if (hasMainSkillQueued) {
                alert('정찰을 제외한 스킬은 턴당 1종류만 사용할 수 있습니다.');
                return;
              }
              setTargetingSkill({ type: 'naval_bombardment', damage: 0, duration: 1, radius: 1 });
            }}
            disabled={!initialSession.allowNavalBombardment || usedSkills.includes('naval_bombardment') || hasMainSkillQueued}
          >🚢 해안포격</button>
          
          <button 
            className="cyber-btn"
            style={{ borderColor: uiColors.neonYellow, color: uiColors.neonYellow }}
            onClick={() => {
              if (hasMainSkillQueued) {
                alert('정찰을 제외한 스킬은 턴당 1종류만 사용할 수 있습니다.');
                return;
              }
              setActiveSkills(prev => [...prev, { type: 'emp' }]);
              setUsedSkills(prev => [...prev, 'emp']);
              alert('EMP가 예약되었습니다. 턴 넘김 시 양측 기계화 부대 정지 및 상대방의 스킬이 모두 무력화됩니다.');
            }}
            disabled={usedSkills.includes('emp') || hasMainSkillQueued}
          >⚡ EMP</button>
          
          <button 
            className="cyber-btn"
            style={{ marginLeft: 'auto', borderColor: hasRecon ? uiColors.neonBlue : '#475569', background: hasRecon ? 'rgba(59,130,246,0.2)' : 'transparent' }}
            onClick={() => {
               setHasRecon(true);
               setActiveSkills(prev => prev.some(s => s.type === 'recon') ? prev : [...prev, { type: 'recon' }]);
               alert('정찰 스킬 발동! 이번 턴 동안 맵 전체의 시야가 밝혀집니다.');
            }}
            disabled={!hasAirSupremacy || hasRecon}
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
        </div>
      ) : phase === 'aerial_combat' ? (
        <AerialMinigame
          countryId={countryId}
          myPlanes={unitsOnBoard.filter(u => u.owner === countryId && u.majorCategory === '공군')}
          enemyPlanes={unitsOnBoard.filter(u => u.owner !== countryId && u.majorCategory === '공군')}
          autoMode={autoAirCombat}
          onComplete={(isWin) => {
            setHasAirSupremacy(isWin);
            setPhase('combat');
          }}
        />
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
            
            let isMoveTarget = false;
            if (isVisible && selectedUnit && selectedUnit.owner === countryId && orderMode === 'move') {
              const dist = Math.abs(selectedUnit.x - x) + Math.abs(selectedUnit.y - y);
              if (dist <= (selectedUnit.speed || 1)) {
                isMoveTarget = true;
              }
            }

            let isDirectControl = false;
            if (unit && unit.owner === countryId && !unit.isHQ) {
              const unitCorps = corps?.find(c => c.id === unit.corpsId);
              if (!unitCorps || unitCorps.units?.length <= 5) {
                isDirectControl = true;
              }
            }

            const style = getTileStyle(tile.type, isVisible, isSelected);
            if (isMoveTarget && !isSelected) {
              style.backgroundColor = 'rgba(56, 189, 248, 0.25)';
              style.border = '1px solid rgba(56, 189, 248, 0.6)';
            }

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
                    backgroundImage: unit.image ? `url(${unit.image})` : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    borderRadius: '4px',
                    border: isDirectControl ? '2px solid #fbbf24' : `1px solid ${unit.owner === countryId ? '#60a5fa' : '#fca5a5'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: isDirectControl ? '0 0 12px rgba(251, 191, 36, 0.8)' : `0 0 8px ${unit.owner === countryId ? 'rgba(59, 130, 246, 0.6)' : 'rgba(239, 68, 68, 0.6)'}`
                  }}>
                    {!unit.image && (
                      <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#fff', textShadow: '1px 1px 0 #000' }}>
                        {unit.isHQ ? 'HQ' : unit.name?.substring(0,2)}
                      </span>
                    )}
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
            {phase === 'deployment' ? (
              <>
                <h4 style={{ color: uiColors.neonBlue, marginTop: 0, borderBottom: `1px solid ${uiColors.glassBorder}`, paddingBottom: '8px' }}>🛠️ 부대 배치 (대기 사단)</h4>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '8px' }}>
                    보급 사용량: 
                    <span style={{ color: unitsOnBoard.filter(u => u.owner === countryId && (u.status === 'field' || (u.status === 'standby' && u.majorCategory === '공군'))).reduce((a, b) => a + (b.supplyConsumption || 0), 0) >= mySupplyLimit ? uiColors.neonRed : '#fff', fontWeight: 'bold', marginLeft: '8px' }}>
                      {unitsOnBoard.filter(u => u.owner === countryId && (u.status === 'field' || (u.status === 'standby' && u.majorCategory === '공군'))).reduce((a, b) => a + (b.supplyConsumption || 0), 0)} / {mySupplyLimit}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    {initialSession?.battleMode === 'siege' && initialSession?.status === 'defense_prep' ? 
                      '🛡️ 방어전 사전 배치 페이즈입니다. 맵 전체에 유닛을 자유롭게 주둔시키세요!' : 
                      '내 진영 반경에 유닛을 배치하세요.'}
                    사령부(HQ) 배치는 필수입니다.
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                  {unitsOnBoard.filter(u => u.owner === countryId && u.status === 'standby').map(u => {
                    const isAir = u.majorCategory === '공군';
                    return (
                    <div 
                      key={u.id}
                      onClick={() => {
                        if (!isAir) setSelectedStandbyUnitId(u.id);
                      }}
                      style={{
                        padding: '12px',
                        backgroundColor: selectedStandbyUnitId === u.id ? 'rgba(59, 130, 246, 0.4)' : 'rgba(0,0,0,0.4)',
                        border: `1px solid ${selectedStandbyUnitId === u.id ? uiColors.neonBlue : '#334155'}`,
                        borderRadius: '6px',
                        cursor: isAir ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        opacity: isAir ? 0.6 : 1
                      }}
                    >
                      <div>
                        <div style={{ color: '#fff', fontWeight: 'bold' }}>{u.isHQ ? '⭐ 야전사령부 (HQ)' : u.name} <span style={{fontSize:'0.7rem', color: uiColors.neonYellow}}>[{u.subCategory}]</span></div>
                        <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>보급 소모: {u.supplyConsumption || 0} {isAir && '(비행장 대기)'}</div>
                      </div>
                      <div style={{ color: uiColors.neonYellow, fontSize: '0.8rem' }}>대기 중</div>
                    </div>
                  )})}
                  {unitsOnBoard.filter(u => u.owner === countryId && u.status === 'standby').length === 0 && (
                    <div style={{ color: '#64748b', textAlign: 'center', padding: '20px 0' }}>대기 중인 유닛이 없습니다.</div>
                  )}
                </div>
                {initialSession?.players?.[countryId]?.ready ? (
                  <div style={{ marginTop: '20px', padding: '12px', textAlign: 'center', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid #10b981', borderRadius: '6px', fontWeight: 'bold' }}>
                    배치 완료됨. 상대방을 기다리는 중...
                  </div>
                ) : (
                  <button 
                    className="btn btn-primary" 
                    style={{ width: '100%', marginTop: '20px' }}
                    onClick={handleDeployComplete}
                  >
                    배치 완료 (전투 시작)
                  </button>
                )}
              </>
            ) : (
              <>
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
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontStyle: 'italic', paddingBottom: '20px' }}>
                전술 지도에서 유닛을 선택하여 상세 정보를 확인하십시오.
              </div>
            )}

            {/* 대기 유닛 리스트 (전투 중 재투입) */}
            <h4 style={{ color: uiColors.neonGreen, marginTop: '20px', borderBottom: `1px solid ${uiColors.glassBorder}`, paddingBottom: '8px' }}>🔄 예비대 투입 대기열</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', paddingRight: '8px' }}>
              {unitsOnBoard.filter(u => u.owner === countryId && u.status === 'standby' && !u.isHQ).map(u => {
                const isQueued = orders.some(o => o.type === 'spawn' && o.unitId === u.id);
                const isAir = u.majorCategory === '공군';
                return (
                <div 
                  key={u.id}
                  onClick={() => {
                    if (!isQueued && !isAir) {
                      setSelectedStandbyUnitId(selectedStandbyUnitId === u.id ? null : u.id);
                      setSelectedUnit(null);
                    }
                  }}
                  style={{
                    padding: '8px',
                    backgroundColor: selectedStandbyUnitId === u.id ? 'rgba(59, 130, 246, 0.4)' : isQueued ? 'rgba(16, 185, 129, 0.2)' : 'rgba(0,0,0,0.4)',
                    border: `1px solid ${selectedStandbyUnitId === u.id ? uiColors.neonBlue : isQueued ? uiColors.neonGreen : '#334155'}`,
                    borderRadius: '6px',
                    cursor: (isQueued || isAir) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    opacity: isAir ? 0.6 : 1
                  }}
                >
                  <div>
                    <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.9rem' }}>{u.name} <span style={{fontSize:'0.7rem', color: uiColors.neonYellow}}>[{u.subCategory}]</span></div>
                    <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>보급: {u.supplyConsumption || 0} | 체력: {u.hp}/{u.maxHp || 100} {isAir && '(비행장 대기)'}</div>
                  </div>
                  <div style={{ color: isQueued ? uiColors.neonGreen : uiColors.neonYellow, fontSize: '0.8rem' }}>
                    {isQueued ? '투입 대기' : '대기 중'}
                  </div>
                </div>
              )})}
              {unitsOnBoard.filter(u => u.owner === countryId && u.status === 'standby' && !u.isHQ).length === 0 && (
                <div style={{ color: '#64748b', textAlign: 'center', padding: '10px 0', fontSize: '0.9rem' }}>대기 중인 유닛이 없습니다.</div>
              )}
            </div>
            </>
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
                    <span style={{ color: o.type === 'attack' ? uiColors.neonRed : o.type === 'move' ? uiColors.neonBlue : o.type === 'spawn' ? uiColors.neonGreen : uiColors.neonYellow }}>
                      {o.type === 'move' ? `➡️ 이동 (${o.target.x}, ${o.target.y})` : o.type === 'attack' ? `💥 포격 (${o.target.x}, ${o.target.y})` : o.type === 'spawn' ? `✨ 증원 스폰` : '🔙 후퇴'}
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
