'use client';

import React, { useState } from 'react';
import LandCombatBoard from '@/components/LandCombatBoard';
import { TILE_TYPES, createLandBoard } from '@/lib/landCombat';

export default function CombatTestPage() {
  const [board] = useState(createLandBoard());
  
  // 가상의 국가 ID
  const countryId = 'test-player';
  const enemyId = 'enemy-ai';

  // 가상의 군단 데이터
  const [corps] = useState([
    { id: 'corps-1', name: '제1야전군 (직속)', owner: countryId, aiLevel: 1 },
    { id: 'corps-2', name: '제2군단 (AI 중급)', owner: countryId, aiLevel: 2 },
    { id: 'corps-enemy', name: '적군 붉은군단', owner: enemyId, aiLevel: 3 }
  ]);

  // 장군 데이터 매핑
  const [generals] = useState([
    { id: 'gen-1', corpsId: 'corps-1', aiLevel: 1, name: '이순신' },
    { id: 'gen-2', corpsId: 'corps-2', aiLevel: 2, name: '권율' },
    { id: 'gen-enemy', corpsId: 'corps-enemy', aiLevel: 3, name: '적장' }
  ]);

  // 가상의 유닛 데이터
  const [initialUnits] = useState([
    // 내 사령부
    { id: 'u1', owner: countryId, corpsId: 'corps-1', isHQ: true, name: '본진 HQ', x: 2, y: 18, status: 'field', hp: 100, maxHp: 100 },
    // 내 보병들
    { id: 'u2', owner: countryId, corpsId: 'corps-1', subCategory: '보병', name: '보병1사단', x: 3, y: 17, status: 'field', hp: 100, maxHp: 100, attack: 30, defense: 10, speed: 2 },
    { id: 'u3', owner: countryId, corpsId: 'corps-1', subCategory: '기계화', name: '기보1여단', x: 4, y: 17, status: 'field', hp: 120, maxHp: 120, attack: 40, defense: 20, speed: 4 },
    { id: 'u4', owner: countryId, corpsId: 'corps-1', subCategory: '포병', name: '포병연대', x: 2, y: 17, status: 'field', hp: 60, maxHp: 60, attack: 80, defense: 5, speed: 1 },
    { id: 'u5', owner: countryId, corpsId: 'corps-2', subCategory: '해병대', name: '해병1사단', x: 5, y: 18, status: 'field', hp: 110, maxHp: 110, attack: 35, defense: 15, speed: 2 },
    
    // 특수 무기 (전장에 투입된 유닛, x,y가 없어도 스킬 카운트로 셈)
    { id: 's1', owner: countryId, corpsId: 'corps-1', subCategory: '폭격기', name: 'B-52', status: 'field', hp: 100, attack: 150 },
    { id: 's2', owner: countryId, corpsId: 'corps-1', subCategory: '근접항공지원기', name: 'A-10', status: 'field', hp: 100, attack: 90 },
    { id: 's3', owner: countryId, corpsId: 'corps-1', subCategory: '핵무기', name: '전술핵', status: 'field', hp: 10, attack: 9999 },
    
    // 적 사령부 및 유닛
    { id: 'e1', owner: enemyId, corpsId: 'corps-enemy', isHQ: true, name: '적 HQ', x: 17, y: 2, status: 'field', hp: 100, maxHp: 100 },
    { id: 'e2', owner: enemyId, corpsId: 'corps-enemy', subCategory: '보병', name: '적 보병1', x: 16, y: 3, status: 'field', hp: 100, maxHp: 100, attack: 25, defense: 10, speed: 2 },
    { id: 'e3', owner: enemyId, corpsId: 'corps-enemy', subCategory: '전차', name: '적 전차1', x: 15, y: 3, status: 'field', hp: 150, maxHp: 150, attack: 50, defense: 30, speed: 3 }
  ]);

  return (
    <div style={{ backgroundColor: '#000', minHeight: '100vh', padding: '20px' }}>
      <h1 style={{ color: '#fff', textAlign: 'center', marginBottom: '20px' }}>지상전 엔진 관리자 테스트 세션</h1>
      <LandCombatBoard 
        initialSession={{
          board: board,
          units: initialUnits,
          phase: 'combat',
          turn: 1
        }}
        countryId={countryId}
        corps={corps}
        generals={generals}
        onSaveSession={(res) => {
          console.log("턴 종료 후 반환된 세션 데이터:", res);
        }}
      />
    </div>
  );
}
