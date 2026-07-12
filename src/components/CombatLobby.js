'use client';

import React, { useState, useEffect } from 'react';
import { getDataEntry, upsertDataEntry, getCountries } from '@/lib/store';
import { deployAIUnits } from '@/lib/landCombat';
import LandCombatBoard from '@/components/LandCombatBoard';
import NavalCombatBoard from '@/components/NavalCombatBoard';

function cloneUnitForAI(unit, aiOwnerId, isTeam1, aiLevel = 2) {
  const uniqueId = `${unit.id || 'unit'}_ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    ...unit,
    id: uniqueId,
    owner: aiOwnerId,
    status: 'standby',
    x: isTeam1 ? 0 : 19,
    y: unit.y !== undefined ? unit.y : 10,
    corpsId: unit.corpsId ? `AI_${unit.corpsId}` : 'AI_corps',
    aiLevel,
    isHQ: unit.isHQ || false,
    hp: unit.hp || unit.maxHp || 100,
    maxHp: unit.maxHp || unit.hp || 100,
    vision: unit.vision || 0,
    supplyConsumption: unit.supplyConsumption || 1,
    attack: unit.attack || 0,
    defense: unit.defense || 0,
    speed: unit.speed || 0,
    majorCategory: unit.majorCategory || unit.subCategory || '육군',
    minorCategory: unit.minorCategory || unit.subCategory || '보병',
    subCategory: unit.subCategory || '보병'
  };
}

function buildAIUnitsFromArmy(units, aiOwnerId, isTeam1, aiLevel = 2) {
  return units.map(unit => cloneUnitForAI(unit, aiOwnerId, isTeam1, aiLevel));
}

function buildAIPlayerData(sourceUnits, isTeam1) {
  return {
    armyId: null,
    ready: true,
    isAI: true,
    orders: [],
    skills: [],
    stats: { penetration: 0, antiAir: 0, vision: 0 },
    units: buildAIUnitsFromArmy(sourceUnits, 'AI', isTeam1, 2)
  };
}

export default function CombatLobby({ countryId, militaryUnits, corps, armies, navalFleets = [], airWings = [], generals, admin, countryStats, unitTemplates = [] }) {
  const [maps, setMaps] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [countries, setCountries] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  
  // Create Session Form
  const [showCreate, setShowCreate] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [selectedMapId, setSelectedMapId] = useState('');
  const [sessionCategory, setSessionCategory] = useState('land');
  const [sessionMode, setSessionMode] = useState('human_vs_ai');
  const [supplyLimit, setSupplyLimit] = useState(10);
  const [opponentId, setOpponentId] = useState('');
  const [selectedArmyId, setSelectedArmyId] = useState('');
  const [selectedFleetId, setSelectedFleetId] = useState('');
  const [selectedAirWingId, setSelectedAirWingId] = useState('');
  const [allowNavalBombardment, setAllowNavalBombardment] = useState(false);

  const applySpiritToUnit = (unit) => {
    const e = countryStats?.spiritEffects || {};
    const atkPct = Number(e.unitAttackPct || 0);
    const defPct = Number(e.unitDefensePct || 0);
    const hpPct = Number(e.unitHpPct || 0);
    const aaPct = Number(e.unitAntiAirPct || 0);
    const obPct = Number(e.unitObservationPct || 0);
    const penPct = Number(e.unitPenetrationPct || 0);

    const baseMaxHp = Number(unit.maxHp || unit.hp || 100);
    const nextMaxHp = Math.max(1, Math.floor(baseMaxHp * (1 + hpPct / 100)));
    const baseHp = Number(unit.hp || baseMaxHp);
    const hpRatio = baseMaxHp > 0 ? (baseHp / baseMaxHp) : 1;
    const nextHp = Math.max(1, Math.min(nextMaxHp, Math.floor(nextMaxHp * hpRatio)));

    return {
      ...unit,
      attack: Math.max(0, Math.floor(Number(unit.attack || 0) * (1 + atkPct / 100))),
      defense: Math.max(0, Math.floor(Number(unit.defense || 0) * (1 + defPct / 100))),
      maxHp: nextMaxHp,
      hp: nextHp,
      antiAir: Math.max(0, Math.floor(Number(unit.antiAir || 0) * (1 + aaPct / 100))),
      vision: Math.max(0, Math.floor(Number(unit.vision || 0) * (1 + obPct / 100))),
      penetration: Math.max(0, Math.floor(Number(unit.penetration || 0) * (1 + penPct / 100)))
    };
  };

  const buildUnitsFromFleet = (fleet, session = null) => {
    const myUnits = [];
    (fleet?.shipIds || []).forEach(uid => {
      const u = militaryUnits.find(mu => mu.id === uid);
      if (!u) return;
      const tmpl = unitTemplates.find(t => t.id === u.templateId) || {};
      const major = tmpl.majorCategory || u.majorCategory;
      if (major !== '해군') return;

      const isTeam1 = session
        ? (session.isTeamBattle ? session.team1.includes(countryId) : (session.host === countryId))
        : true;
      const startX = isTeam1 ? 0 : 19;

      myUnits.push(applySpiritToUnit({
        ...u,
        name: u.customName || tmpl.name || u.name || '함선',
        image: tmpl.image || u.image || null,
        attack: u.attack || tmpl.attack || 0,
        defense: u.defense || tmpl.defense || 0,
        speed: u.speed || tmpl.speed || 0,
        maxHp: u.maxHp || u.hp || tmpl.hp || 100,
        hp: u.hp || u.maxHp || tmpl.hp || 100,
        vision: (u.vision || tmpl.vision || 0) + (countryStats?.vision || 0),
        supplyConsumption: u.supplyConsumption || tmpl.supplyConsumption || 1,
        majorCategory: '해군',
        minorCategory: tmpl.minorCategory || u.minorCategory,
        subCategory: tmpl.subCategory || u.subCategory,
        slotCount: tmpl.slotCount || u.slotCount || 1,
        x: startX,
        y: startX,
        status: 'standby',
        owner: countryId,
        fleetId: fleet.id,
        aiLevel: generals.find(g => g.id === fleet.admiralId)?.aiLevel || 1
      }));
    });

    return myUnits;
  };

  const buildUnitsFromAirWing = (wing, session = null) => {
    const myUnits = [];
    (wing?.unitIds || []).forEach(uid => {
      const u = militaryUnits.find(mu => mu.id === uid);
      if (!u) return;
      const tmpl = unitTemplates.find(t => t.id === u.templateId) || {};
      const major = tmpl.majorCategory || u.majorCategory;
      if (major !== '공군') return;

      const isTeam1 = session
        ? (session.isTeamBattle ? session.team1.includes(countryId) : (session.host === countryId))
        : true;
      const startX = isTeam1 ? 0 : 19;

      myUnits.push(applySpiritToUnit({
        ...u,
        name: u.customName || tmpl.name || u.name || '항공기',
        image: tmpl.image || u.image || null,
        attack: u.attack || tmpl.attack || 0,
        defense: u.defense || tmpl.defense || 0,
        speed: u.speed || tmpl.speed || 0,
        maxHp: u.maxHp || u.hp || tmpl.hp || 100,
        hp: u.hp || u.maxHp || tmpl.hp || 100,
        vision: (u.vision || tmpl.vision || 0) + (countryStats?.vision || 0),
        supplyConsumption: u.supplyConsumption || tmpl.supplyConsumption || 1,
        majorCategory: '공군',
        minorCategory: tmpl.minorCategory || u.minorCategory,
        subCategory: tmpl.subCategory || u.subCategory,
        x: startX,
        y: startX,
        status: 'standby',
        owner: countryId,
        wingId: wing.id,
        aiLevel: generals.find(g => g.id === wing.commanderId)?.aiLevel || 1
      }));
    });

    return myUnits;
  };

  const applyFormationLossesFromSession = async (sessionData) => {
    const units = sessionData?.units || [];
    if (!units.length) return;

    const countryIds = new Set((countries || []).map(c => c.id));
    if (countryId) countryIds.add(countryId);
    const destroyedByOwner = {};
    const survivorHpByOwner = {};
    units.forEach((u) => {
      if (!u || u.owner === 'AI') return;
      if (!countryIds.has(u.owner) && u.owner !== countryId) return;

      if (u.status !== 'destroyed') {
        if (!survivorHpByOwner[u.owner]) survivorHpByOwner[u.owner] = {};
        survivorHpByOwner[u.owner][u.id] = {
          hp: Number(u.hp || 0),
          maxHp: Number(u.maxHp || u.hp || 100)
        };
      }

      if (u?.status !== 'destroyed') return;
      if (!destroyedByOwner[u.owner]) destroyedByOwner[u.owner] = new Set();
      destroyedByOwner[u.owner].add(u.id);
    });

    const owners = [...new Set([...Object.keys(destroyedByOwner), ...Object.keys(survivorHpByOwner)])];
    for (const ownerId of owners) {
      const destroyed = destroyedByOwner[ownerId] || new Set();
      const survivorHp = survivorHpByOwner[ownerId] || {};

      const [unitsEntry, corpsEntry, fleetsEntry, wingsEntry] = await Promise.all([
        getDataEntry('military_units', ownerId),
        getDataEntry('corps', ownerId),
        getDataEntry('naval_fleets', ownerId),
        getDataEntry('air_wings', ownerId)
      ]);

      const srcUnits = unitsEntry?.data?.units || [];
      const nextUnits = srcUnits
        .filter(u => !destroyed.has(u.id))
        .map((u) => {
          const s = survivorHp[u.id];
          if (!s) return u;
          const maxHp = Number.isFinite(s.maxHp) && s.maxHp > 0 ? s.maxHp : Number(u.maxHp || u.hp || 100);
          const hp = Math.max(0, Math.min(maxHp, Number.isFinite(s.hp) ? s.hp : Number(u.hp || maxHp)));
          return { ...u, hp, maxHp };
        });
      if (JSON.stringify(nextUnits) !== JSON.stringify(srcUnits)) {
        await upsertDataEntry('military_units', ownerId, { units: nextUnits });
      }

      const srcCorps = corpsEntry?.data?.corps || [];
      const nextCorps = srcCorps.map(c => ({ ...c, units: (c.units || []).filter(uid => !destroyed.has(uid)) }));
      if (JSON.stringify(nextCorps) !== JSON.stringify(srcCorps)) {
        await upsertDataEntry('corps', ownerId, { corps: nextCorps });
      }

      const srcFleets = fleetsEntry?.data?.fleets || [];
      const nextFleets = srcFleets.map(f => ({
        ...f,
        shipIds: (f.shipIds || []).filter(uid => !destroyed.has(uid)),
        manualControlIds: (f.manualControlIds || []).filter(uid => !destroyed.has(uid)),
        flagshipId: destroyed.has(f.flagshipId) ? null : (f.flagshipId || null)
      }));
      if (JSON.stringify(nextFleets) !== JSON.stringify(srcFleets)) {
        await upsertDataEntry('naval_fleets', ownerId, { fleets: nextFleets });
      }

      const srcWings = wingsEntry?.data?.wings || [];
      const nextWings = srcWings.map(w => ({ ...w, unitIds: (w.unitIds || []).filter(uid => !destroyed.has(uid)) }));
      if (JSON.stringify(nextWings) !== JSON.stringify(srcWings)) {
        await upsertDataEntry('air_wings', ownerId, { wings: nextWings });
      }
    }
  };

  // Supply Limit Negotiation
  const [editingSupplyFor, setEditingSupplyFor] = useState(null);
  const [newSupplyLimit, setNewSupplyLimit] = useState('');

  useEffect(() => {
    loadLobbyData();
    const interval = setInterval(loadLobbyData, 5000); // Poll for sessions
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeSession && sessions.length > 0) {
      const updated = sessions.find(s => s.id === activeSession.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(activeSession)) {
        setActiveSession(updated);
      }
    }
  }, [sessions]);

  const loadLobbyData = async () => {
    try {
      const mapEntry = await getDataEntry('combat_maps', null);
      if (mapEntry?.data?.maps) setMaps(mapEntry.data.maps);

      const cSessions = await getDataEntry('combat_sessions');
      const latestSessions = cSessions?.data?.sessions || [];
      setSessions(latestSessions);
      
      // Update activeSession with real-time data
      if (activeSession) {
         const updatedActive = latestSessions.find(s => s.id === activeSession.id);
         if (updatedActive) {
            const prevTurn = activeSession?.turn || 1;
            const nextTurn = updatedActive?.turn || 1;
            const prevGameOver = activeSession?.phase === 'game_over' || activeSession?.status === 'game_over';
            if (prevGameOver && nextTurn <= prevTurn) {
              setActiveSession(activeSession);
            } else if (nextTurn >= prevTurn) {
              setActiveSession(updatedActive);
            }
         }
      }
      
      const clist = await getCountries();
      setCountries(clist || []);
    } catch (err) {
      console.error(err);
    }
  };

  const mergeSessionForSave = (baseSession, patch) => {
    const base = baseSession || {};
    const next = { ...base, ...(patch || {}) };
    const baseTurn = base?.turn || 1;
    const patchTurn = patch?.turn || 0;
    next.turn = Math.max(baseTurn, patchTurn);

    const baseGameOver = base?.phase === 'game_over' || base?.status === 'game_over';
    const patchGameOver = patch?.phase === 'game_over' || patch?.status === 'game_over';
    if (baseGameOver && !patchGameOver) {
      next.phase = 'game_over';
      next.status = 'game_over';
      next.winner = base?.winner || next?.winner;
      next.reportLogged = base?.reportLogged || next?.reportLogged;
    }

    return next;
  };

  const saveActiveSessionPatch = async (patch) => {
    if (!activeSession?.id) return;

    const latest = await getDataEntry('combat_sessions', null);
    const latestSessions = latest?.data?.sessions || sessions;
    const latestActive = latestSessions.find(s => s.id === activeSession.id) || activeSession;
    const merged = mergeSessionForSave(latestActive, patch);

    if ((merged?.units || []).length > 0) {
      await applyFormationLossesFromSession(merged);
    }

    let nextSessions = [];
    if (latestSessions.some(s => s.id === activeSession.id)) {
      nextSessions = latestSessions.map(s => s.id === activeSession.id ? merged : s);
    } else {
      nextSessions = [...latestSessions, merged];
    }

    setSessions(nextSessions);
    await upsertDataEntry('combat_sessions', null, { sessions: nextSessions });
    setActiveSession(merged);
  };

  const handleCreateSession = async () => {
    if (!sessionName || !selectedMapId) {
      return alert('세션 이름과 맵을 선택해주세요.');
    }

    if (sessionCategory === 'naval' && !selectedFleetId) {
      return alert('해전 세션 생성 시 투입할 함대를 선택해주세요.');
    }
    if (sessionCategory === 'bombing' && !selectedAirWingId) {
      return alert('폭격전 세션 생성 시 투입할 비행단을 선택해주세요.');
    }
    if (sessionCategory !== 'naval' && sessionCategory !== 'bombing' && !selectedArmyId) {
      return alert('해전 이외 세션 생성 시 투입할 야전군을 선택해주세요.');
    }

    let myUnits = [];
    if (sessionCategory === 'naval') {
      const fleet = navalFleets.find(f => f.id === selectedFleetId);
      if (!fleet) return alert('함대를 찾을 수 없습니다.');
      myUnits = buildUnitsFromFleet(fleet);
    } else if (sessionCategory === 'bombing') {
      const wing = airWings.find(w => w.id === selectedAirWingId);
      if (!wing) return alert('비행단을 찾을 수 없습니다.');
      myUnits = buildUnitsFromAirWing(wing);
    } else {
      const army = armies.find(a => a.id === selectedArmyId);
      if (!army) return alert('야전군을 찾을 수 없습니다.');

      army.corpsIds.forEach(cid => {
        const c = corps.find(co => co.id === cid);
        if (c) {
          c.units.forEach(uid => {
            const u = militaryUnits.find(mu => mu.id === uid);
            if (u) {
              const tmpl = unitTemplates.find(t => t.id === u.templateId) || {};
              myUnits.push(applySpiritToUnit({
                ...u,
                name: u.customName || tmpl.name || u.name || '유닛',
                image: tmpl.image || u.image || null,
                attack: u.attack || tmpl.attack || 0,
                defense: u.defense || tmpl.defense || 0,
                speed: u.speed || tmpl.speed || 0,
                hp: u.hp || tmpl.hp || 100,
                maxHp: u.maxHp || u.hp || tmpl.hp || 100,
                vision: u.vision || tmpl.vision || 0,
                supplyConsumption: u.supplyConsumption || tmpl.supplyConsumption || 1,
                majorCategory: tmpl.majorCategory || u.majorCategory || '육군',
                minorCategory: tmpl.minorCategory || u.minorCategory || tmpl.minorCategory || '보병',
                subCategory: tmpl.subCategory || u.subCategory || '보병',
                x: 0,
                y: 0,
                status: 'standby',
                owner: countryId,
                corpsId: c.id,
                aiLevel: generals.find(g => g.id === c.commanderId)?.aiLevel || 1,
                isHQ: false
              }));
            }
          });
        }
      });

      myUnits.push({
        id: 'hq_' + countryId,
        name: '야전사령부',
        subCategory: 'HQ',
        x: 0,
        y: 0,
        status: 'standby',
        owner: countryId,
        isHQ: true,
        hp: 100,
        maxHp: 100,
        vision: countryStats?.vision || 0,
        supplyConsumption: 0
      });
    }

    const hostIsAI = sessionMode === 'ai_vs_ai';
    const finalOpponent = sessionMode === 'ai_vs_ai'
      ? 'AI'
      : (opponentId === 'AI' ? 'AI' : (opponentId || (sessionMode === 'human_vs_ai' ? 'AI' : null)));
    const isAIEnemy = finalOpponent === 'AI';
    const aiPlayer = isAIEnemy ? buildAIPlayerData(myUnits, false) : null;

    const hostPlayerData = {
      armyId: (sessionCategory === 'naval' || sessionCategory === 'bombing') ? null : selectedArmyId,
      fleetId: sessionCategory === 'naval' ? selectedFleetId : null,
      airWingId: sessionCategory === 'bombing' ? selectedAirWingId : null,
      ready: hostIsAI ? true : false,
      isAI: hostIsAI,
      orders: [],
      skills: [],
      units: hostIsAI ? buildAIUnitsFromArmy(myUnits, countryId, true, 2) : myUnits,
      stats: countryStats
    };

    const newSession = {
      id: 'session_' + Date.now(),
      name: sessionName,
      mapId: selectedMapId,
      supplyLimitTeam1: parseInt(supplyLimit) || 10,
      supplyLimitTeam2: parseInt(supplyLimit) || 10,
      host: countryId,
      opponent: finalOpponent,
      sessionMode,
      sessionCategory,
      allowNavalBombardment,
      status: (sessionMode === 'human_vs_human' || (sessionMode === 'human_vs_ai' && !isAIEnemy))
        ? 'waiting'
        : 'deployment',
      phase: undefined,
      players: {
        [countryId]: hostPlayerData,
        ...(isAIEnemy ? { AI: aiPlayer } : {})
      },
      board: maps.find(m => m.id === selectedMapId)?.board,
      units: isAIEnemy ? [...hostPlayerData.units, ...aiPlayer.units] : [...hostPlayerData.units],
      createdAt: new Date().toISOString()
    };

    if (sessionMode === 'ai_vs_ai' && sessionCategory !== 'naval') {
      const deployedUnits = deployAIUnits(newSession.units, { ...newSession, armies, generals }, null);
      newSession.units = deployedUnits;
      newSession.players[countryId].units = deployedUnits.filter(u => u.owner === countryId);
      if (newSession.players.AI) {
        newSession.players.AI.units = deployedUnits.filter(u => u.owner === 'AI');
      }
      newSession.status = 'playing';
      newSession.phase = 'combat';
      newSession.turn = 1;
      newSession.players[countryId].ready = true;
      if (newSession.players.AI) newSession.players.AI.ready = true;
    }

    const updatedSessions = [...sessions, newSession];
    setSessions(updatedSessions);
    await upsertDataEntry('combat_sessions', null, { sessions: updatedSessions });
    
    setShowCreate(false);
    if (sessionMode === 'ai_vs_ai') {
      alert('AI 대 AI 세션이 생성되었습니다. 즉시 전투를 개시할 수 있습니다.');
    } else {
      alert('전투 세션이 생성되었습니다. 상대방의 수락을 기다립니다.');
    }
  };

  const handleJoinSession = async (session) => {
    if (session.battleMode === 'siege' && session.status === 'defense_prep') {
      const isTeam1 = session.isTeamBattle ? session.team1.includes(countryId) : (session.host === countryId);
      if (isTeam1) {
        return alert('현재 수비측(방어팀)이 전선을 사전 배치 중입니다. 관리자가 침공을 허가할 때까지 대기해주세요.');
      }
    }

    const isNavalSession = session.sessionCategory === 'naval';
    const isBombingSession = session.sessionCategory === 'bombing';
    const assignedArmyId = session?.players?.[countryId]?.armyId || '';
    const assignedFleetId = session?.players?.[countryId]?.fleetId || '';
    const assignedAirWingId = session?.players?.[countryId]?.airWingId || '';
    const effectiveArmyId = selectedArmyId || assignedArmyId;
    const effectiveFleetId = selectedFleetId || assignedFleetId;
    const effectiveAirWingId = selectedAirWingId || assignedAirWingId;

    if (!isNavalSession && !isBombingSession && !effectiveArmyId) {
      return alert('참여하기 전 투입할 야전군을 선택해주세요.');
    }
    if (isNavalSession && !effectiveFleetId) {
      return alert('해전 참여 전 투입할 함대를 선택해주세요.');
    }
    if (isBombingSession && !effectiveAirWingId) {
      return alert('폭격전 참여 전 투입할 비행단을 선택해주세요.');
    }

    let myUnits = [];
    if (isNavalSession) {
      const fleet = navalFleets.find(f => f.id === effectiveFleetId);
      if (!fleet) return alert('함대를 찾을 수 없습니다.');
      myUnits = buildUnitsFromFleet(fleet, session);
    } else if (isBombingSession) {
      const wing = airWings.find(w => w.id === effectiveAirWingId);
      if (!wing) return alert('비행단을 찾을 수 없습니다.');
      myUnits = buildUnitsFromAirWing(wing, session);
    } else {
      const army = armies.find(a => a.id === effectiveArmyId);
      if (!army) return alert('야전군을 찾을 수 없습니다.');

      army.corpsIds.forEach(cid => {
        const c = corps.find(co => co.id === cid);
        if (c) {
          c.units.forEach(uid => {
            const u = militaryUnits.find(mu => mu.id === uid);
            if (u) {
              const tmpl = unitTemplates.find(t => t.id === u.templateId) || {};
              const major = tmpl.majorCategory || u.majorCategory;
              const isAir = major === '공군';
              if (session.sessionCategory === 'bombing' && !isAir) return;
              if (session.sessionCategory === 'land' && major !== '육군' && !isAir) return;

              const isTeam1 = session.isTeamBattle ? session.team1.includes(countryId) : (session.host === countryId);
              const startX = isTeam1 ? 0 : 19;
              myUnits.push(applySpiritToUnit({
                ...u,
                name: u.customName || tmpl.name || '알 수 없는 유닛',
                image: tmpl.image || null,
                attack: tmpl.attack || 0,
                defense: tmpl.defense || 0,
                speed: tmpl.speed || 0,
                maxHp: tmpl.hp || 100,
                hp: tmpl.hp || 100,
                vision: (tmpl.vision || 0) + (countryStats?.vision || 0),
                supplyConsumption: tmpl.supplyConsumption || 1,
                majorCategory: major,
                minorCategory: tmpl.minorCategory,
                subCategory: tmpl.subCategory,
                x: startX,
                y: startX,
                status: 'standby',
                owner: countryId,
                corpsId: c.id,
                aiLevel: generals.find(g => g.id === c.commanderId)?.aiLevel || 1,
                isHQ: false
              }));
            }
          });
        }
      });
    }

    const isTeam1 = session.isTeamBattle ? session.team1.includes(countryId) : (session.host === countryId);
    const startX = isTeam1 ? 0 : 19;

    if (!isNavalSession) {
      myUnits.push({
        id: 'hq_' + countryId,
        name: '야전사령부',
        subCategory: 'HQ',
        x: startX,
        y: startX,
        status: 'standby',
        owner: countryId,
        isHQ: true,
        hp: 100,
        vision: (countryStats?.vision || 0),
        supplyConsumption: 0
      });
    }

    const updatedSession = { ...session };
    
    // In team battles, the armyId is already pre-assigned by the admin, but we update the units
    if (!updatedSession.players[countryId]) {
      updatedSession.players[countryId] = {};
    }
    
    updatedSession.players[countryId] = {
      ...updatedSession.players[countryId],
      armyId: (isNavalSession || isBombingSession) ? null : effectiveArmyId,
      fleetId: isNavalSession ? effectiveFleetId : null,
      airWingId: isBombingSession ? effectiveAirWingId : null,
      ready: false,
      orders: [],
      units: myUnits,
      stats: countryStats
    };

    // 공성전 수비 사전배치 페이즈에서는 상태를 유지해야 한다.
    const isDefensePrepJoin = session.battleMode === 'siege' && session.status === 'defense_prep';
    if (isDefensePrepJoin) {
      updatedSession.status = 'defense_prep';
    } else if (!session.isTeamBattle) {
      updatedSession.status = 'deployment';
    } else {
      updatedSession.status = 'deployment';
    }

    // 기존 내 유닛은 치환하고, 타국 유닛은 유지한다.
    updatedSession.units = [
      ...(session.units || []).filter(u => u.owner !== countryId),
      ...myUnits
    ];

    const updatedSessions = sessions.map(s => s.id === session.id ? updatedSession : s);
    setSessions(updatedSessions);
    await upsertDataEntry('combat_sessions', null, { sessions: updatedSessions });
    
    setActiveSession(updatedSession);
  };

  const handleDeleteSession = async (sessionId) => {
    const updatedSessions = sessions.filter(s => s.id !== sessionId);
    setSessions(updatedSessions);
    await upsertDataEntry('combat_sessions', null, { sessions: updatedSessions });
  };

  const handleUpdateSupply = async (session) => {
    const parsedLimit = parseInt(newSupplyLimit, 10);
    if (isNaN(parsedLimit) || parsedLimit <= 0) return alert('유효한 보급 한계를 입력하세요.');
    
    const updatedSession = { ...session, supplyLimitTeam1: parsedLimit, supplyLimitTeam2: parsedLimit };
    const updatedSessions = sessions.map(s => s.id === session.id ? updatedSession : s);
    setSessions(updatedSessions);
    await upsertDataEntry('combat_sessions', null, { sessions: updatedSessions });
    setEditingSupplyFor(null);
  };

  if (activeSession) {
    return (
      <div>
        <button className="btn btn-secondary" style={{ marginBottom: '16px' }} onClick={() => setActiveSession(null)}>
          ⬅️ 로비로 돌아가기
        </button>
        {activeSession.sessionCategory === 'naval' ? (
          <NavalCombatBoard
            countryId={countryId}
            initialSession={activeSession}
            onSaveSession={saveActiveSessionPatch}
          />
        ) : (
          <LandCombatBoard 
            countryId={countryId} 
            militaryUnits={militaryUnits} 
            corps={corps} 
            armies={armies} 
            generals={generals}
            initialSession={activeSession}
            onSaveSession={saveActiveSessionPatch}
          />
        )}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0 }}>⚔️ 전투 로비</h2>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? '취소' : '➕ 세션 만들기'}
        </button>
      </div>

      {showCreate && (
        <div className="card" style={{ padding: '16px', marginBottom: '24px', backgroundColor: 'var(--bg-glass)' }}>
          <h3 style={{ marginBottom: '16px' }}>새 전투 방 생성</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">세션 이름</label>
              <input type="text" className="form-input" value={sessionName} onChange={e => setSessionName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">맵 선택</label>
              <select className="form-select" value={selectedMapId} onChange={e => setSelectedMapId(e.target.value)}>
                <option value="">-- 맵 선택 --</option>
                {maps.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">세션 카테고리</label>
              <select className="form-select" value={sessionCategory} onChange={e => setSessionCategory(e.target.value)}>
                <option value="land">육전</option>
                <option value="naval">해전</option>
                <option value="bombing">폭격전</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">전투 타입</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label><input type="radio" name="sessionMode" value="human_vs_human" checked={sessionMode === 'human_vs_human'} onChange={() => setSessionMode('human_vs_human')} /> 유저 vs 유저</label>
                <label><input type="radio" name="sessionMode" value="human_vs_ai" checked={sessionMode === 'human_vs_ai'} onChange={() => setSessionMode('human_vs_ai')} /> 유저 vs AI</label>
                <label><input type="radio" name="sessionMode" value="ai_vs_ai" checked={sessionMode === 'ai_vs_ai'} onChange={() => setSessionMode('ai_vs_ai')} /> AI vs AI</label>
              </div>
            </div>
            {sessionMode !== 'ai_vs_ai' && (
              <div className="form-group">
                <label className="form-label">상대방 (선택)</label>
                <select className="form-select" value={opponentId} onChange={e => setOpponentId(e.target.value)}>
                  <option value="">누구나 (또는 AI)</option>
                  <option value="AI">AI 자동 상대</option>
                  {countries.filter(c => c.id !== countryId).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">보급 한계</label>
              <input type="number" className="form-input" value={supplyLimit} onChange={e => setSupplyLimit(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">투입할 야전군 ({sessionCategory === 'land' ? '필수' : '선택'})</label>
            <select className="form-select" value={selectedArmyId} onChange={e => setSelectedArmyId(e.target.value)}>
              <option value="">-- 내 야전군 선택 --</option>
              {armies.map(a => (
                <option key={a.id} value={a.id}>{a.name} (소속 군단: {a.corpsIds.length}개)</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">해전 참여용 함대 ({sessionCategory === 'naval' ? '필수' : '선택'})</label>
            <select className="form-select" value={selectedFleetId} onChange={e => setSelectedFleetId(e.target.value)}>
              <option value="">-- 내 함대 선택 --</option>
              {navalFleets.map(f => (
                <option key={f.id} value={f.id}>{f.name} (선박: {(f.shipIds || []).length}척)</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">폭격전 참여용 비행단 ({sessionCategory === 'bombing' ? '필수' : '선택'})</label>
            <select className="form-select" value={selectedAirWingId} onChange={e => setSelectedAirWingId(e.target.value)}>
              <option value="">-- 내 비행단 선택 --</option>
              {airWings.map(w => (
                <option key={w.id} value={w.id}>{w.name} (항공기: {(w.unitIds || []).length}기)</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">특수 룰 (관리자 옵션)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" id="allowNaval" checked={allowNavalBombardment} onChange={e => setAllowNavalBombardment(e.target.checked)} />
              <label htmlFor="allowNaval">해안포격 스킬 허용</label>
            </div>
          </div>
          <button className="btn btn-success" onClick={handleCreateSession}>방 만들기</button>
        </div>
      )}

      {!showCreate && (
        <div className="form-group" style={{ marginBottom: '24px' }}>
          <label className="form-label">미리 투입할 야전군 선택 (참여용)</label>
          <select className="form-select" value={selectedArmyId} onChange={e => setSelectedArmyId(e.target.value)}>
            <option value="">-- 내 야전군 선택 --</option>
            {armies.map(a => (
              <option key={a.id} value={a.id}>{a.name} (소속 군단: {a.corpsIds.length}개)</option>
            ))}
          </select>
          <label className="form-label" style={{ marginTop: '10px' }}>미리 투입할 함대 선택 (해전 참여용)</label>
          <select className="form-select" value={selectedFleetId} onChange={e => setSelectedFleetId(e.target.value)}>
            <option value="">-- 내 함대 선택 --</option>
            {navalFleets.map(f => (
              <option key={f.id} value={f.id}>{f.name} (선박: {(f.shipIds || []).length}척)</option>
            ))}
          </select>
          <label className="form-label" style={{ marginTop: '10px' }}>미리 투입할 비행단 선택 (폭격전 참여용)</label>
          <select className="form-select" value={selectedAirWingId} onChange={e => setSelectedAirWingId(e.target.value)}>
            <option value="">-- 내 비행단 선택 --</option>
            {airWings.map(w => (
              <option key={w.id} value={w.id}>{w.name} (항공기: {(w.unitIds || []).length}기)</option>
            ))}
          </select>
        </div>
      )}

      <h3>대기 중인 전투</h3>
      {sessions.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>현재 진행 중이거나 대기 중인 세션이 없습니다.</p>
      ) : (
        <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
          {sessions.filter(s => s.isActive !== false).map(s => {
            const hostName = countries.find(c => c.id === s.host)?.name || s.host;
            const oppName = s.opponent && s.opponent !== 'AI' ? countries.find(c => c.id === s.opponent)?.name || s.opponent : '누구나 (또는 AI)';
            const mapName = maps.find(m => m.id === s.mapId)?.name || '알 수 없는 맵';
            
            const isHost = s.host === countryId;
            const isTeamBattle = s.isTeamBattle;
            const isTeam1 = isTeamBattle ? s.team1.includes(countryId) : (s.host === countryId);
            const isTeam2 = isTeamBattle ? s.team2.includes(countryId) : (s.opponent === countryId);
            const isAssigned = isTeam1 || isTeam2;
            const isOpponent = s.opponent === countryId || !s.opponent;
            
            // 입장 허용 조건 판단
            let canJoin = false;
            let waitingMessage = '';
            
            if (!s.players[countryId]?.ready && (isOpponent || isAssigned)) {
              if (s.battleMode === 'siege' && s.status === 'defense_prep') {
                if (isTeam2) canJoin = true; // 수비측은 사전배치를 위해 진입 가능
                else waitingMessage = '대기 중 (수비측 사전 배치 중)'; // 공격측 대기
              } else if (s.status === 'waiting') {
                canJoin = true;
              } else if (isTeamBattle) {
                canJoin = true;
              }
            }
            
            const isPlaying = s.players[countryId]?.ready;

            return (
              <div key={s.id} className="card" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: isPlaying ? '4px solid var(--success)' : '4px solid var(--warning)' }}>
                <div>
                  <h4 style={{ margin: '0 0 8px 0' }}>{s.name} <span className={`badge ${isPlaying ? 'badge-success' : 'badge-warning'}`}>{isPlaying ? '진행/참여 중' : '대기 중'}</span></h4>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {isTeamBattle ? '팀전 (다대다)' : `방장: ${hostName} vs 상대: ${oppName}`} | 맵: {mapName} | 보급 한계:{' '}
                    {editingSupplyFor === s.id ? (
                      <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                        <input type="number" value={newSupplyLimit} onChange={e => setNewSupplyLimit(e.target.value)} style={{ width: '60px', padding: '2px 4px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid #475569', borderRadius: '4px' }} />
                        <button className="btn btn-success" style={{ padding: '2px 6px', fontSize: '0.8rem', minWidth: 'auto' }} onClick={() => handleUpdateSupply(s)}>✔️</button>
                        <button className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '0.8rem', minWidth: 'auto' }} onClick={() => setEditingSupplyFor(null)}>❌</button>
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        T1(공격): {s.supplyLimitTeam1 || s.supplyLimit || 10} / T2(수비): {s.supplyLimitTeam2 || s.supplyLimit || 10}
                        {s.status === 'waiting' && !isTeamBattle && (
                          <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px', marginLeft: '4px' }} onClick={() => { setEditingSupplyFor(s.id); setNewSupplyLimit(s.supplyLimitTeam1 || s.supplyLimit); }}>✏️</button>
                        )}
                      </span>
                    )}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {waitingMessage && (
                    <span style={{ color: 'var(--warning)', fontSize: '0.9rem', marginRight: '8px' }}>⏳ {waitingMessage}</span>
                  )}
                  {isPlaying && (
                    <button className="btn btn-primary" onClick={() => setActiveSession(s)}>⚔️ 전투 입장</button>
                  )}
                  {canJoin && (
                    <button className="btn btn-success" onClick={() => handleJoinSession(s)}>
                      {s.battleMode === 'siege' && s.status === 'defense_prep' ? '방어 준비 (사전 배치)' : '입장하기 (부대 투입)'}
                    </button>
                  )}
                  {(isHost && !isPlaying && (s.sessionMode === 'ai_vs_ai' || (s.status === 'waiting' && !isTeamBattle))) && (
                    <button className="btn btn-primary" onClick={() => setActiveSession(s)}>
                      ⚔️ 입장 {s.sessionMode === 'ai_vs_ai' ? '(AI 대 AI)' : '(대기/AI 플레이)'}
                    </button>
                  )}
                  {admin && (
                    <button className="btn btn-danger" onClick={() => handleDeleteSession(s.id)}>삭제</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
