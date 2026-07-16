// insert_unit_templates.js
// 유닛 편제 템플릿 데이터를 Supabase game_settings에 삽입하는 스크립트
// 실행: node insert_unit_templates.js

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://nzwtfbmoiugzalpgiqvu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56d3RmYm1vaXVnemFscGdpcXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MzI1NDgsImV4cCI6MjA5OTAwODU0OH0.gx6uX5prl-57TmLPw1nizYf3hkBy-Ax79f5peec2dNs';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// 연료 한글→value 매핑
const fuelMap = { '없음': 'none', '석유': 'oil', '석탄': 'coal', '목재': 'wood' };

// "무기이름:수량" 문자열 파싱 → [{ weaponName, amount }]
function parseWeapons(str) {
  if (!str || str.trim() === '-') return [];
  return str.split(',').map(s => s.trim()).filter(Boolean).map(pair => {
    const colonIdx = pair.lastIndexOf(':');
    if (colonIdx === -1) return null;
    const weaponName = pair.substring(0, colonIdx).trim();
    const amount = parseInt(pair.substring(colonIdx + 1).trim()) || 0;
    return { weaponName, amount };
  }).filter(Boolean);
}

// "공/방/체/속" 문자열 파싱
function parseStats(str) {
  const parts = str.split('/').map(s => parseFloat(s.trim()) || 0);
  return { attack: parts[0] || 0, defense: parts[1] || 0, hp: parts[2] || 0, speed: parts[3] || 0 };
}

// 유닛 빌더 (육군)
function landUnit(name, minorCategory, statsStr, combatWidth, manpower, fuelKor, fuelPerTurn, supply, weaponsStr) {
  const stats = parseStats(statsStr);
  return {
    id: generateId(), name,
    majorCategory: '육군', minorCategory,
    attack: stats.attack, defense: stats.defense, hp: stats.hp, speed: stats.speed,
    combatWidth, slotSize: 0, carrierCapacity: 0, effectDuration: 0,
    manpowerCost: manpower,
    fuelType: fuelMap[fuelKor] || 'none',
    fuelPerTurn, supplyConsumption: supply,
    requiredWeapons: parseWeapons(weaponsStr),
    image: '',
  };
}

// 유닛 빌더 (해군)
function navalUnit(name, minorCategory, statsStr, slotSize, carrierCap, manpower, fuelKor, fuelPerTurn, supply, weaponsStr) {
  const stats = parseStats(statsStr);
  return {
    id: generateId(), name,
    majorCategory: '해군', minorCategory,
    attack: stats.attack, defense: stats.defense, hp: stats.hp, speed: stats.speed,
    combatWidth: 0, slotSize, carrierCapacity: carrierCap, effectDuration: 0,
    manpowerCost: manpower,
    fuelType: fuelMap[fuelKor] || 'oil',
    fuelPerTurn, supplyConsumption: supply,
    requiredWeapons: parseWeapons(weaponsStr),
    image: '',
  };
}

// 유닛 빌더 (공군)
function airUnit(name, minorCategory, statsStr, manpower, fuelKor, fuelPerTurn, supply, weaponsStr) {
  const stats = parseStats(statsStr);
  return {
    id: generateId(), name,
    majorCategory: '공군', minorCategory,
    attack: stats.attack, defense: stats.defense, hp: stats.hp, speed: stats.speed,
    combatWidth: 0, slotSize: 0, carrierCapacity: 0, effectDuration: 0,
    manpowerCost: manpower,
    fuelType: fuelMap[fuelKor] || 'oil',
    fuelPerTurn, supplyConsumption: supply,
    requiredWeapons: parseWeapons(weaponsStr),
    image: '',
  };
}

// ============================================================
// 유닛 템플릿 데이터
// ============================================================

const unitTemplates = [

  // ===== 육군 - 보병 =====
  landUnit('1918년형 보병사단',  '보병', '8 / 3 / 20 / 1',   2, 10000, '없음', 0,   1,   '1918년형 보병장비:10000'),
  landUnit('1936년형 보병사단',  '보병', '15 / 5 / 30 / 1',  2, 10000, '없음', 0,   2,   '1936년형 보병장비:10000'),
  landUnit('1939년형 보병사단',  '보병', '22 / 7 / 35 / 1',  2, 10000, '없음', 0,   2.5, '1939형 보병장비:10000'),
  landUnit('1942년형 보병사단',  '보병', '35 / 12 / 45 / 1', 2, 10000, '없음', 0,   3,   '1942형 보병장비:10000'),

  // ===== 육군 - 산악부대 =====
  landUnit('1936년형 산악사단',  '산악부대', '18 / 6 / 35 / 1',  2, 10000, '없음', 0, 2.5, '1936년형 보병장비:8000, 1936년형 지원장비:2000'),
  landUnit('1939년형 산악사단',  '산악부대', '25 / 8 / 40 / 1',  2, 10000, '없음', 0, 3,   '1939형 보병장비:8000, 1936년형 지원장비:2000'),
  landUnit('1942년형 산악사단',  '산악부대', '40 / 13 / 50 / 1', 2, 10000, '없음', 0, 3.5, '1942형 보병장비:8000, 1936년형 지원장비:2000'),

  // ===== 육군 - 해병대 =====
  landUnit('1936년형 해병대사단', '해병대', '20 / 7 / 35 / 1',  2, 10000, '없음', 0, 2.5, '1936년형 보병장비:8000, 1936년형 지원장비:2000'),
  landUnit('1941년형 해병대사단', '해병대', '30 / 10 / 42 / 1', 2, 10000, '없음', 0, 3.5, '1939형 보병장비:7000, 1941년형 수륙양용차량:1000, 1936년형 지원장비:1000'),
  landUnit('1943년형 해병대사단', '해병대', '45 / 15 / 52 / 1', 2, 10000, '없음', 0, 4.5, '1942형 보병장비:7000, 1943년형 수륙양용차량:1000, 1936년형 지원장비:1000'),

  // ===== 육군 - 공수부대 =====
  landUnit('1936년형 공수사단',  '공수부대', '14 / 5 / 25 / 1', 2, 8000, '없음', 0, 2,   '1936년형 보병장비:7000, 1936년형 지원장비:1000'),
  landUnit('1939년형 공수사단',  '공수부대', '20 / 7 / 30 / 1', 2, 8000, '없음', 0, 2.5, '1939형 보병장비:7000, 1936년형 지원장비:1000'),
  landUnit('1942년형 공수사단',  '공수부대', '32 / 11 / 40 / 1', 2, 8000, '없음', 0, 3,  '1942형 보병장비:7000, 1936년형 지원장비:1000'),

  // ===== 육군 - 특전사 =====
  landUnit('1936년형 특전사',  '특전사', '25 / 8 / 35 / 1',  2, 6000, '없음', 0, 2.5, '1936년형 보병장비:4000, 1936년형 지원장비:2000'),
  landUnit('1939년형 특전사',  '특전사', '35 / 12 / 45 / 1', 2, 6000, '없음', 0, 3,   '1939형 보병장비:4000, 1936년형 지원장비:2000'),
  landUnit('1942년형 특전사',  '특전사', '50 / 17 / 55 / 1', 2, 6000, '없음', 0, 4,   '1942형 보병장비:4000, 1936년형 지원장비:2000'),

  // ===== 육군 - 기계화 (차량화/기계화보병) =====
  landUnit('1918년형 차량화사단',  '기계화', '12 / 4 / 25 / 2',   2, 10000, '석유', 40,  2,  '1918년형 트럭:1000, 1918년형 보병장비:5000'),
  landUnit('1936년형 차량화사단',  '기계화', '20 / 7 / 35 / 3',   2, 10000, '석유', 60,  3,  '1936년형 트럭:1000, 1936년형 보병장비:5000'),
  landUnit('1940년형 기계화사단',  '기계화', '35 / 12 / 55 / 3',  2, 10000, '석유', 100, 6,  '1940년형 기계화장비:1000, 1939형 보병장비:5000'),
  landUnit('1942년형 기계화사단',  '기계화', '45 / 15 / 65 / 3',  2, 10000, '석유', 120, 7,  '1942년형 기계화장비:1000, 1942형 보병장비:5000'),
  landUnit('1944년형 기계화사단',  '기계화', '55 / 18 / 75 / 3',  2, 10000, '석유', 150, 8,  '1944년형 기계화장비:1000, 1942형 보병장비:5000'),

  // ===== 육군 - 기계화 (경전차) =====
  landUnit('1934년형 경전차사단', '기계화', '30 / 10 / 45 / 4', 3, 8000, '석유', 80,  5,  '1934년형 경전차:300, 1918년형 트럭:500'),
  landUnit('1936년형 경전차사단', '기계화', '40 / 14 / 55 / 4', 3, 8000, '석유', 100, 6,  '1936년형 경전차:300, 1936년형 트럭:500'),
  landUnit('1941년형 경전차사단', '기계화', '55 / 18 / 60 / 4', 3, 8000, '석유', 120, 7,  '1941년형 경전차:300, 1940년형 기계화장비:500'),

  // ===== 육군 - 기계화 (중형전차) =====
  landUnit('전간기형 기갑사단',   '기계화', '35 / 12 / 50 / 2', 3, 8000, '석유', 120, 6,  '전간기형 전차:300, 1918년형 트럭:500'),
  landUnit('1938년형 기갑사단',   '기계화', '50 / 18 / 65 / 3', 3, 8000, '석유', 150, 8,  '1938년형 중형전차:300, 1936년형 트럭:500'),
  landUnit('1940년형 기갑사단',   '기계화', '70 / 25 / 80 / 3', 3, 8000, '석유', 200, 10, '1940년형 중형전차:300, 1940년형 기계화장비:500'),
  landUnit('1943년형 기갑사단',   '기계화', '100 / 35 / 100 / 3', 3, 8000, '석유', 250, 13, '1943년형 중형전차:300, 1942년형 기계화장비:500'),
  landUnit('1세대 MBT 기갑사단', '기계화', '160 / 55 / 130 / 3', 3, 8000, '석유', 350, 18, '1세대 MBT:300, 1944년형 기계화장비:500'),

  // ===== 육군 - 기계화 (중전차) =====
  landUnit('1934년형 중전차사단', '기계화', '60 / 25 / 75 / 2',   3, 8000, '석유', 220, 10, '1934년형 중전차:200, 1936년형 트럭:500'),
  landUnit('1940년형 중전차사단', '기계화', '100 / 40 / 95 / 2',  3, 8000, '석유', 280, 13, '1940년형 중전차:200, 1940년형 기계화장비:500'),
  landUnit('1943년형 중전차사단', '기계화', '140 / 50 / 115 / 2', 3, 8000, '석유', 350, 16, '1943년형 중전차:200, 1942년형 기계화장비:500'),
  landUnit('초중전차사단',        '기계화', '190 / 70 / 150 / 1', 3, 8000, '석유', 500, 24, '초중전차:100, 1944년형 기계화장비:500'),

  // ===== 육군 - 포병 =====
  landUnit('전간기 곡사포여단', '포병', '35 / 1 / 10 / 1', 1, 3000, '없음', 0, 3, '전간기 곡사포:72'),
  landUnit('1939년형 야포여단', '포병', '60 / 1 / 12 / 1', 1, 3000, '없음', 0, 4, '1939년형 야포:72'),
  landUnit('1942년형 야포여단', '포병', '100 / 2 / 15 / 1', 1, 3000, '없음', 0, 6, '1942년형 야포:72'),

  // ===== 해군 - 기뢰부설함/어뢰정 =====
  navalUnit('기뢰정',  '기뢰부설함', '40 / 2 / 80 / 5',   1, 0, 100,  '석유', 10,  2,  '기뢰정:1'),
  navalUnit('어뢰함',  '어뢰정',     '60 / 2 / 90 / 5',   1, 0, 100,  '석유', 15,  3,  '어뢰함:1'),

  // ===== 해군 - 잠수함 =====
  navalUnit('1922년형 잠수함', '잠수함', '80 / 4 / 50 / 4',   1, 0, 50, '석유', 5,  2, '1922년형 잠수함:1'),
  navalUnit('1936년형 잠수함', '잠수함', '120 / 5 / 70 / 4',  1, 0, 50, '석유', 8,  3, '1936년형 잠수함:1'),
  navalUnit('1939년형 잠수함', '잠수함', '160 / 7 / 90 / 4',  1, 0, 50, '석유', 12, 4, '1939년형 잠수함:1'),
  navalUnit('1943년형 잠수함', '잠수함', '220 / 10 / 130 / 4', 1, 0, 50, '석유', 15, 6, '1943년형 잠수함:1'),

  // ===== 해군 - 구축함 =====
  navalUnit('1922년형 구축함', '구축함', '50 / 5 / 150 / 4',   2, 0, 300,  '석유', 40,  4,  '1922년형 구축함:1'),
  navalUnit('1936년형 구축함', '구축함', '80 / 8 / 220 / 4',   2, 0, 300,  '석유', 50,  6,  '1936년형 구축함:1'),
  navalUnit('1939년형 구축함', '구축함', '110 / 12 / 300 / 4', 2, 0, 300,  '석유', 60,  8,  '1939년형 구축함:1'),
  navalUnit('1943년형 구축함', '구축함', '150 / 15 / 400 / 4', 2, 0, 300,  '석유', 70,  10, '1943년형 구축함:1'),

  // ===== 해군 - 순양함 =====
  navalUnit('1922년형 순양함', '구축함', '100 / 15 / 450 / 3', 3, 0, 1000, '석유', 150, 10, '1922년형 순양함:1'),
  navalUnit('1936년형 순양함', '구축함', '150 / 20 / 600 / 3', 3, 0, 1000, '석유', 180, 13, '1936년형 순양함:1'),
  navalUnit('1939년형 순양함', '구축함', '200 / 25 / 800 / 3', 3, 0, 1000, '석유', 220, 16, '1939년형 순양함:1'),
  navalUnit('1943년형 순양함', '구축함', '260 / 35 / 1000 / 3', 3, 0, 1000, '석유', 260, 20, '1943년형 순양함:1'),

  // ===== 해군 - 전함 =====
  navalUnit('1922년형 전함', '전함', '250 / 40 / 1500 / 2',   4, 0, 2000, '석유', 400,  24, '1922년형 전함:1'),
  navalUnit('1936년형 전함', '전함', '400 / 60 / 2000 / 2',   4, 0, 2000, '석유', 500,  32, '1936년형 전함:1'),
  navalUnit('1939년형 전함', '전함', '550 / 80 / 2500 / 2',   4, 0, 2000, '석유', 600,  40, '1939년형 전함:1'),
  navalUnit('1943년형 전함', '전함', '750 / 100 / 3000 / 2',  4, 0, 2000, '석유', 750,  50, '1943년형 전함:1'),
  navalUnit('초중전함',      '전함', '1000 / 150 / 4000 / 1', 5, 0, 2500, '석유', 1000, 70, '초중전함:1'),

  // ===== 해군 - 항공모함 =====
  navalUnit('1922년형 개장함선',  '항공모함', '50 / 10 / 800 / 2',   4, 1, 1500, '석유', 250, 16, '1922년형 개장함선:1'),
  navalUnit('1936년형 항공모함',  '항공모함', '100 / 15 / 1200 / 3', 4, 2, 2000, '석유', 350, 24, '1936년형 항공모함:1'),
  navalUnit('1939년형 항공모함',  '항공모함', '150 / 20 / 1600 / 3', 4, 3, 2500, '석유', 450, 30, '1939년형 항공모함:1'),
  navalUnit('1943년형 항공모함',  '항공모함', '250 / 25 / 2000 / 3', 4, 4, 3000, '석유', 550, 40, '1943년형 항공모함:1'),

  // ===== 공군 - 전투기 =====
  airUnit('1933년형 전투비행단', '전투기', '5 / 3 / 10 / 350',   1000, '석유', 25,  2, '1933년형 전투기:100'),
  airUnit('1936년형 전투비행단', '전투기', '10 / 5 / 15 / 450',  1000, '석유', 35,  2, '1936년형 전투기:100'),
  airUnit('1940년형 전투비행단', '전투기', '15 / 7 / 20 / 580',  1000, '석유', 45,  3, '1940년형 전투기:100'),
  airUnit('1944년형 전투비행단', '전투기', '20 / 10 / 30 / 720', 1000, '석유', 60,  4, '1944년형 전투기:100'),
  airUnit('1945년형 전투비행단', '전투기', '30 / 12 / 40 / 880', 1000, '석유', 150, 5, '1945년형 전투기:100'),

  // ===== 공군 - 뇌격기 =====
  airUnit('1933년형 뇌격비행단', '뇌격기', '25 / 5 / 15 / 220',  1000, '석유', 40,  2, '1933년형 뇌격기:100'),
  airUnit('1936년형 뇌격비행단', '뇌격기', '40 / 7 / 20 / 300',  1000, '석유', 55,  3, '1936년형 뇌격기:100'),
  airUnit('1940년형 뇌격비행단', '뇌격기', '75 / 12 / 30 / 420', 1000, '석유', 70,  4, '1940년형 뇌격기:100'),
  airUnit('1944년형 뇌격비행단', '뇌격기', '120 / 15 / 45 / 550', 1000, '석유', 100, 6, '1944년형 뇌격기:100'),
  airUnit('1945년형 뇌격비행단', '뇌격기', '160 / 20 / 60 / 650', 1000, '석유', 180, 7, '1945년형 뇌격기:100'),

  // ===== 공군 - 근접항공지원기 =====
  airUnit('1933년형 CAS비행단', '근접항공지원기', '25 / 5 / 15 / 220',  1000, '석유', 40,  2, '1933년형 근접항공지원기:100'),
  airUnit('1936년형 CAS비행단', '근접항공지원기', '40 / 7 / 20 / 300',  1000, '석유', 55,  3, '1936년형 근접항공지원기:100'),
  airUnit('1940년형 CAS비행단', '근접항공지원기', '75 / 12 / 30 / 420', 1000, '석유', 70,  4, '1940년형 근접항공지원기:100'),
  airUnit('1944년형 CAS비행단', '근접항공지원기', '120 / 15 / 45 / 550', 1000, '석유', 100, 6, '1944년형 근접항공지원기:100'),
  airUnit('1945년형 CAS비행단', '근접항공지원기', '160 / 20 / 60 / 650', 1000, '석유', 180, 7, '1945년형 근접항공지원기:100'),

  // ===== 공군 - 전술폭격기 =====
  airUnit('1933년형 전술폭격비행단', '폭격기', '60 / 10 / 30 / 180',   1200, '석유', 80,  4,  '1933년형 전술폭격기:100'),
  airUnit('1936년형 전술폭격비행단', '폭격기', '120 / 15 / 45 / 250',  1200, '석유', 120, 6,  '1936년형 전술폭격기:100'),
  airUnit('1940년형 전술폭격비행단', '폭격기', '250 / 20 / 65 / 350',  1200, '석유', 180, 8,  '1940년형 전술폭격기:100'),
  airUnit('1944년형 전술폭격비행단', '폭격기', '450 / 30 / 100 / 450', 1200, '석유', 250, 12, '1944년형 전술폭격기:100'),
  airUnit('1945년형 전술폭격비행단', '폭격기', '600 / 50 / 150 / 550', 1200, '석유', 400, 16, '1945년형 전술폭격기:100'),

  // ===== 공군 - 전략폭격기 =====
  airUnit('1933년형 전략폭격비행단', '폭격기', '80 / 15 / 40 / 150',   1500, '석유', 300,  6,  '1933년형 전략폭격기:100'),
  airUnit('1936년형 전략폭격비행단', '폭격기', '160 / 20 / 60 / 200',  1500, '석유', 500,  10, '1936년형 전략폭격기:100'),
  airUnit('1940년형 전략폭격비행단', '폭격기', '300 / 30 / 90 / 280',  1500, '석유', 800,  14, '1940년형 전략폭격기:100'),
  airUnit('1944년형 전략폭격비행단', '폭격기', '500 / 40 / 130 / 380', 1500, '석유', 1500, 20, '1944년형 전략폭격기:100'),
  airUnit('1945년형 전략폭격비행단', '폭격기', '800 / 60 / 200 / 450', 1500, '석유', 2500, 30, '1945년형 전략폭격기:100'),
];

async function main() {
  console.log('🔍 현재 game_settings 조회 중...');

  const { data: existing, error: fetchError } = await supabase
    .from('data_entries')
    .select('id, data')
    .eq('category', 'game_settings')
    .is('country_id', null)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('❌ 조회 오류:', fetchError); process.exit(1);
  }

  const currentData = existing?.data || {};
  console.log('📊 기존 유닛 템플릿 수:', (currentData.unitTemplates || []).length);
  console.log('📝 삽입할 유닛 템플릿 수:', unitTemplates.length);

  const newData = { ...currentData, unitTemplates };

  const { data, error } = await supabase
    .from('data_entries')
    .update({ data: newData, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
    .select().single();

  if (error) { console.error('❌ 저장 실패:', error); process.exit(1); }

  console.log('\n✅ 유닛 템플릿 저장 완료!');
  const saved = data.data.unitTemplates || [];
  const byMajor = {};
  saved.forEach(u => {
    if (!byMajor[u.majorCategory]) byMajor[u.majorCategory] = {};
    if (!byMajor[u.majorCategory][u.minorCategory]) byMajor[u.majorCategory][u.minorCategory] = [];
    byMajor[u.majorCategory][u.minorCategory].push(u.name);
  });
  for (const [major, minors] of Object.entries(byMajor)) {
    console.log(`\n  [${major}]`);
    for (const [minor, names] of Object.entries(minors)) {
      console.log(`    ${minor}: ${names.length}개`);
      names.forEach(n => console.log(`      - ${n}`));
    }
  }
  console.log(`\n🎉 총 ${saved.length}개의 유닛 템플릿이 저장되었습니다.`);
}

main().catch(err => { console.error('치명적 오류:', err); process.exit(1); });
