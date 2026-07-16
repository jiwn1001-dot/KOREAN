// insert_blueprints.js
// 무기 청사진 데이터를 Supabase game_settings에 삽입하는 스크립트
// 실행: node insert_blueprints.js

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://nzwtfbmoiugzalpgiqvu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56d3RmYm1vaXVnemFscGdpcXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MzI1NDgsImV4cCI6MjA5OTAwODU0OH0.gx6uX5prl-57TmLPw1nizYf3hkBy-Ax79f5peec2dNs';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 한글 자원명 → 영문 key 매핑
const resMap = {
  '강철': 'steel',
  '고무': 'rubber',
  '알루미늄': 'aluminum',
  '텅스텐': 'tungsten',
  '크롬': 'chromium',
  '석유': 'oil',
  '석탄': 'coal',
  '목재': 'wood',
  '유황': 'sulfur',
};

// 자원 문자열 파싱 예: "강철 0.004" → { steel: 0.004 }
function parseRes(str) {
  if (!str || str === '-') return null;
  const cleaned = str.replace(/,/g, '').trim();
  for (const [kor, eng] of Object.entries(resMap)) {
    if (cleaned.startsWith(kor)) {
      const amount = parseFloat(cleaned.replace(kor, '').trim());
      return { key: eng, amount };
    }
  }
  return null;
}

// bp 빌더 헬퍼
function bp(name, techCategory, facility, industryCost, productionTurns, res1Str, res2Str) {
  const resources = {};
  const r1 = parseRes(res1Str);
  if (r1) resources[r1.key] = r1.amount;
  const r2 = parseRes(res2Str);
  if (r2) resources[r2.key] = r2.amount;
  return {
    id: generateId(),
    name,
    techCategory,
    facility,
    industryCost,
    productionTurns,
    resources,
  };
}

// ============================================================
// 무기 청사진 데이터
// facility: 'heavy' = 중공업단지, 'shipyard' = 조선소
// productionTurns: 기본 1년, 전함/항공모함류 3년
// ============================================================

const weaponBlueprints = [

  // ===== 지상군 - 보병 장비 =====
  bp('1918년형 보병장비',  '지상군', 'heavy', 0.0005, 1, '강철 0.004',  '-'),
  bp('1936년형 보병장비',  '지상군', 'heavy', 0.001,  1, '강철 0.004',  '-'),
  bp('1939형 보병장비',    '지상군', 'heavy', 0.0015, 1, '강철 0.0045', '-'),
  bp('1942형 보병장비',    '지상군', 'heavy', 0.002,  1, '강철 0.005',  '텅스텐 0.0001'),

  // ===== 지상군 - 지원/기계화 =====
  bp('1936년형 지원장비',     '지상군', 'heavy', 0.01, 1, '강철 0.04', '알루미늄 0.01'),
  bp('1918년형 트럭',         '지상군', 'heavy', 1,    1, '강철 2',    '고무 1'),
  bp('1936년형 트럭',         '지상군', 'heavy', 2,    1, '강철 3',    '고무 2'),
  bp('1940년형 기계화장비',   '지상군', 'heavy', 4,    1, '강철 8',    '고무 3'),
  bp('1942년형 기계화장비',   '지상군', 'heavy', 6,    1, '강철 10',   '고무 4'),
  bp('1944년형 기계화장비',   '지상군', 'heavy', 8,    1, '강철 12',   '고무 5'),
  bp('1941년형 수륙양용차량', '지상군', 'heavy', 3,    1, '강철 4',    '고무 2'),
  bp('1943년형 수륙양용차량', '지상군', 'heavy', 5,    1, '강철 6',    '고무 3'),

  // ===== 지상군 - 경전차 =====
  bp('1934년형 경전차', '지상군', 'heavy', 3,  1, '강철 8',  '-'),
  bp('1936년형 경전차', '지상군', 'heavy', 4,  1, '강철 10', '-'),
  bp('1941년형 경전차', '지상군', 'heavy', 5,  1, '강철 14', '텅스텐 1'),

  // ===== 지상군 - 중형전차 =====
  bp('전간기형 전차',    '지상군', 'heavy', 5,  1, '강철 15', '-'),
  bp('1938년형 중형전차','지상군', 'heavy', 6,  1, '강철 20', '-'),
  bp('1940년형 중형전차','지상군', 'heavy', 8,  1, '강철 28', '텅스텐 2'),
  bp('1943년형 중형전차','지상군', 'heavy', 12, 1, '강철 35', '텅스텐 3'),
  bp('1세대 MBT',        '지상군', 'heavy', 20, 1, '강철 45', '텅스텐 5'),

  // ===== 지상군 - 중전차 =====
  bp('1934년형 중전차', '지상군', 'heavy', 10, 1, '강철 30',  '-'),
  bp('1940년형 중전차', '지상군', 'heavy', 15, 1, '강철 45',  '크롬 4'),
  bp('1943년형 중전차', '지상군', 'heavy', 22, 1, '강철 65',  '크롬 6'),
  bp('초중전차',        '지상군', 'heavy', 50, 1, '강철 150', '크롬 15'),

  // ===== 지상군 - 포병 =====
  bp('전간기 곡사포',  '지상군', 'heavy', 2, 1, '강철 3', '-'),
  bp('1939년형 야포',  '지상군', 'heavy', 3, 1, '강철 5', '-'),
  bp('1942년형 야포',  '지상군', 'heavy', 4, 1, '강철 8', '텅스텐 1'),

  // ===== 해군 - 소형함선 =====
  bp('기뢰정',           '해군', 'shipyard', 20,  1, '강철 500', '-'),
  bp('어뢰함',           '해군', 'shipyard', 30,  1, '강철 300', '알루미늄 20'),

  // ===== 해군 - 잠수함 =====
  bp('1922년형 잠수함', '해군', 'shipyard', 60,   1, '강철 800',  '-'),
  bp('1936년형 잠수함', '해군', 'shipyard', 80,   1, '강철 1000', '크롬 50'),
  bp('1939년형 잠수함', '해군', 'shipyard', 110,  1, '강철 1200', '크롬 80'),
  bp('1943년형 잠수함', '해군', 'shipyard', 150,  1, '강철 1800', '크롬 120'),

  // ===== 해군 - 구축함 =====
  bp('1922년형 구축함', '해군', 'shipyard', 150,  1, '강철 1200', '-'),
  bp('1936년형 구축함', '해군', 'shipyard', 200,  1, '강철 1800', '크롬 50'),
  bp('1939년형 구축함', '해군', 'shipyard', 250,  1, '강철 2200', '크롬 80'),
  bp('1943년형 구축함', '해군', 'shipyard', 350,  1, '강철 2800', '크롬 120'),

  // ===== 해군 - 순양함 =====
  bp('1922년형 순양함', '해군', 'shipyard', 500,  1, '강철 8000',  '-'),
  bp('1936년형 순양함', '해군', 'shipyard', 700,  1, '강철 10000', '크롬 400'),
  bp('1939년형 순양함', '해군', 'shipyard', 900,  1, '강철 12000', '크롬 600'),
  bp('1943년형 순양함', '해군', 'shipyard', 1200, 1, '강철 15000', '크롬 800'),

  // ===== 해군 - 전함 (3년) =====
  bp('1922년형 전함', '해군', 'shipyard', 2000,  3, '강철 28000', '-'),
  bp('1936년형 전함', '해군', 'shipyard', 3000,  3, '강철 35000', '크롬 1500'),
  bp('1939년형 전함', '해군', 'shipyard', 4000,  3, '강철 45000', '크롬 2500'),
  bp('1943년형 전함', '해군', 'shipyard', 6000,  3, '강철 55000', '크롬 3500'),
  bp('초중전함',      '해군', 'shipyard', 10000, 3, '강철 75000', '크롬 5000'),

  // ===== 해군 - 항공모함 (3년) =====
  bp('1922년형 개장함선',  '해군', 'shipyard', 1000, 3, '강철 15000', '-'),
  bp('1936년형 항공모함',  '해군', 'shipyard', 1500, 3, '강철 20000', '알루미늄 500'),
  bp('1939년형 항공모함',  '해군', 'shipyard', 2000, 3, '강철 25000', '알루미늄 800'),
  bp('1943년형 항공모함',  '해군', 'shipyard', 3000, 3, '강철 32000', '알루미늄 1200'),
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
    console.error('❌ 조회 오류:', fetchError);
    process.exit(1);
  }

  const currentData = existing?.data || {};
  console.log('📊 기존 청사진 수:', (currentData.weaponBlueprints || []).length);
  console.log('📝 삽입할 청사진 수:', weaponBlueprints.length);

  const newData = {
    ...currentData,
    weaponBlueprints: weaponBlueprints,
  };

  let result;
  if (existing) {
    console.log('🔄 기존 game_settings 업데이트 중...');
    const { data, error } = await supabase
      .from('data_entries')
      .update({ data: newData, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) { console.error('❌ 업데이트 실패:', error); process.exit(1); }
    result = data;
  } else {
    console.log('➕ 새 game_settings 삽입 중...');
    const { data, error } = await supabase
      .from('data_entries')
      .insert({ category: 'game_settings', country_id: null, data: newData })
      .select()
      .single();
    if (error) { console.error('❌ 삽입 실패:', error); process.exit(1); }
    result = data;
  }

  console.log('\n✅ 성공! 저장된 청사진 목록:');
  const bps = result.data.weaponBlueprints || [];
  const byCategory = {};
  bps.forEach(bp => {
    if (!byCategory[bp.techCategory]) byCategory[bp.techCategory] = [];
    byCategory[bp.techCategory].push(bp);
  });
  for (const [cat, items] of Object.entries(byCategory)) {
    console.log(`\n  [${cat}] ${items.length}개`);
    items.forEach(b => {
      const res = Object.entries(b.resources).map(([k,v])=>`${k}:${v}`).join(', ');
      console.log(`    - ${b.name} | 공업력:${b.industryCost} | ${b.productionTurns}턴 | ${res || '자원없음'}`);
    });
  }
  console.log(`\n🎉 총 ${bps.length}개의 청사진이 저장되었습니다.`);
}

main().catch(err => {
  console.error('치명적 오류:', err);
  process.exit(1);
});
