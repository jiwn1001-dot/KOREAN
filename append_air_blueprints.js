// append_air_blueprints.js
// 공군 청사진을 기존 데이터에 추가(병합)하는 스크립트
// 실행: node append_air_blueprints.js

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

const resMap = {
  '강철': 'steel', '고무': 'rubber', '알루미늄': 'aluminum',
  '텅스텐': 'tungsten', '크롬': 'chromium', '석유': 'oil',
  '석탄': 'coal', '목재': 'wood', '유황': 'sulfur',
};

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

function bp(name, techCategory, facility, industryCost, productionTurns, res1Str, res2Str) {
  const resources = {};
  const r1 = parseRes(res1Str);
  if (r1) resources[r1.key] = r1.amount;
  const r2 = parseRes(res2Str);
  if (r2) resources[r2.key] = r2.amount;
  return { id: generateId(), name, techCategory, facility, industryCost, productionTurns, resources };
}

// ===== 공군 청사진 (25개, 생산 1턴) =====
const airBlueprints = [
  // 전투기
  bp('1933년형 전투기', '항공', 'heavy', 1,  1, '알루미늄 1',  '강철 1'),
  bp('1936년형 전투기', '항공', 'heavy', 2,  1, '알루미늄 2',  '고무 1'),
  bp('1940년형 전투기', '항공', 'heavy', 4,  1, '알루미늄 3',  '고무 1'),
  bp('1944년형 전투기', '항공', 'heavy', 6,  1, '알루미늄 4',  '고무 2'),
  bp('1945년형 전투기', '항공', 'heavy', 10, 1, '알루미늄 5',  '텅스텐 2'),

  // 뇌격기
  bp('1933년형 뇌격기', '항공', 'heavy', 1.5, 1, '알루미늄 2',  '강철 1'),
  bp('1936년형 뇌격기', '항공', 'heavy', 2.5, 1, '알루미늄 3',  '고무 1'),
  bp('1940년형 뇌격기', '항공', 'heavy', 4.5, 1, '알루미늄 4',  '고무 1.5'),
  bp('1944년형 뇌격기', '항공', 'heavy', 7,   1, '알루미늄 6',  '고무 2'),
  bp('1945년형 뇌격기', '항공', 'heavy', 12,  1, '알루미늄 8',  '텅스텐 2'),

  // 근접항공지원기
  bp('1933년형 근접항공지원기', '항공', 'heavy', 1.5, 1, '알루미늄 1.5', '강철 1.5'),
  bp('1936년형 근접항공지원기', '항공', 'heavy', 2.5, 1, '알루미늄 2',   '강철 2'),
  bp('1940년형 근접항공지원기', '항공', 'heavy', 5,   1, '강철 3',       '알루미늄 3'),
  bp('1944년형 근접항공지원기', '항공', 'heavy', 8,   1, '알루미늄 5',   '텅스텐 1'),
  bp('1945년형 근접항공지원기', '항공', 'heavy', 12,  1, '알루미늄 6',   '텅스텐 2.5'),

  // 전술폭격기
  bp('1933년형 전술폭격기', '항공', 'heavy', 3,  1, '알루미늄 4',  '고무 1'),
  bp('1936년형 전술폭격기', '항공', 'heavy', 6,  1, '알루미늄 6',  '고무 2'),
  bp('1940년형 전술폭격기', '항공', 'heavy', 10, 1, '알루미늄 8',  '고무 3'),
  bp('1944년형 전술폭격기', '항공', 'heavy', 18, 1, '알루미늄 12', '고무 4'),
  bp('1945년형 전술폭격기', '항공', 'heavy', 25, 1, '알루미늄 15', '텅스텐 3'),

  // 전략폭격기
  bp('1933년형 전략폭격기', '항공', 'heavy', 6,  1, '알루미늄 8',  '고무 2'),
  bp('1936년형 전략폭격기', '항공', 'heavy', 12, 1, '알루미늄 12', '고무 3'),
  bp('1940년형 전략폭격기', '항공', 'heavy', 25, 1, '알루미늄 20', '고무 6'),
  bp('1944년형 전략폭격기', '항공', 'heavy', 45, 1, '알루미늄 35', '고무 10'),
  bp('1945년형 전략폭격기', '항공', 'heavy', 65, 1, '알루미늄 50', '텅스텐 12'),
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
  const existingBPs = currentData.weaponBlueprints || [];

  // 이미 있는 이름은 스킵, 없는 것만 추가
  const existingNames = new Set(existingBPs.map(b => b.name));
  const toAdd = airBlueprints.filter(b => !existingNames.has(b.name));

  console.log(`📊 기존 청사진: ${existingBPs.length}개`);
  console.log(`✈️  추가할 공군 청사진: ${toAdd.length}개 (중복 ${airBlueprints.length - toAdd.length}개 제외)`);

  const merged = [...existingBPs, ...toAdd];

  const newData = { ...currentData, weaponBlueprints: merged };

  const { data, error } = await supabase
    .from('data_entries')
    .update({ data: newData, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
    .select().single();

  if (error) { console.error('❌ 저장 실패:', error); process.exit(1); }

  console.log('\n✅ 공군 청사진 추가 완료!');
  const airSaved = (data.data.weaponBlueprints || []).filter(b => b.techCategory === '항공');
  airSaved.forEach(b => {
    const res = Object.entries(b.resources).map(([k,v])=>`${k}:${v}`).join(', ');
    console.log(`  - ${b.name} | 공업력:${b.industryCost} | ${b.productionTurns}턴 | ${res}`);
  });
  console.log(`\n🎉 전체 청사진: ${data.data.weaponBlueprints.length}개 (공군 ${airSaved.length}개 포함)`);
}

main().catch(err => { console.error('치명적 오류:', err); process.exit(1); });
