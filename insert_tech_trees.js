// insert_tech_trees.js
// 기술 테크트리 데이터를 Supabase game_settings에 삽입하는 스크립트
// 실행: node insert_tech_trees.js

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://nzwtfbmoiugzalpgiqvu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56d3RmYm1vaXVnemFscGdpcXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MzI1NDgsImV4cCI6MjA5OTAwODU0OH0.gx6uX5prl-57TmLPw1nizYf3hkBy-Ax79f5peec2dNs';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 이름 → 시대 매핑 (전간기 없음)
function getEra(name) {
  const match = name.match(/(\d{4})/);
  if (!match) {
    // 연도 없는 경우: 전간기형/초중 → 2차대전기, 기타 → 2차대전기
    return '2차대전기';
  }
  const year = parseInt(match[1]);
  if (year <= 1918) return '1차대전기';
  // 1919~1935 (전간기) → 2차대전기로 통합
  if (year <= 1945) return '2차대전기';
  if (year <= 1960) return '냉전기';
  return '현대';
}

// category를 인자로 받아 공학(과학기술)만 3턴, 나머지 2턴
function getTurns(category) {
  return category === '공학' ? 3 : 2;
}

function makeLevels(levelNames, category) {
  return levelNames.map((name, i) => ({
    name: name.trim(),
    level: i + 1,
    era: getEra(name.trim()),
    turns: getTurns(category),
    effect: 'none',
    effectValue: 0,
  }));
}

const techTreesRaw = [
  // ===== 지상군 (육군 + 기갑 + 포병) =====
  {
    name: '보병 장비',
    category: '지상군',
    levelNames: ['1918년형 보병장비', '1936년형 보병장비', '1939형 보병장비', '1942형 보병장비'],
  },
  {
    name: '트럭 / 기계화',
    category: '지상군',
    levelNames: ['1918년형 트럭', '1936년형 트럭', '1940년형 기계화장비', '1942년형 기계화장비', '1944년형 기계화장비'],
  },
  {
    name: '지원 / 수륙양용',
    category: '지상군',
    levelNames: ['1936년형 지원장비', '1941년형 수륙양용차량', '1943년형 수륙양용차량'],
  },
  {
    name: '중형 전차',
    category: '지상군',
    levelNames: ['전간기형 전차', '1938년형 중형전차', '1940년형 중형전차', '1943년형 중형전차', '1세대 MBT'],
  },
  {
    name: '경전차',
    category: '지상군',
    levelNames: ['1934년형 경전차', '1936년형 경전차', '1941년형 경전차'],
  },
  {
    name: '중전차',
    category: '지상군',
    levelNames: ['1934년형 중전차', '1940년형 중전차', '1943년형 중전차', '초중전차'],
  },
  {
    name: '야포 / 곡사포',
    category: '지상군',
    levelNames: ['전간기 곡사포', '1939년형 야포', '1942년형 야포'],
  },
  {
    name: '대공포',
    category: '지상군',
    levelNames: ['1936년형 대공포', '1940년형 대공포', '1943년형 대공포'],
  },
  {
    name: '대전차포',
    category: '지상군',
    levelNames: ['1936년형 대전차포', '1940년형 대전차포', '1943년형 대전차포'],
  },

  // ===== 해군 =====
  {
    name: '기뢰정',
    category: '해군',
    levelNames: ['기뢰정'],
  },
  {
    name: '어뢰함',
    category: '해군',
    levelNames: ['어뢰함'],
  },
  {
    name: '구축함',
    category: '해군',
    levelNames: ['1922년형 구축함', '1936년형 구축함', '1939년형 구축함', '1943년형 구축함'],
  },
  {
    name: '순양함',
    category: '해군',
    levelNames: ['1922년형 순양함', '1936년형 순양함', '1939년형 순양함', '1943년형 순양함'],
  },
  {
    name: '전함',
    category: '해군',
    levelNames: ['1922년형 전함', '1936년형 전함', '초중전함', '1939년형 전함', '1943년형 전함'],
  },
  {
    name: '항공모함 / 개장함선',
    category: '해군',
    levelNames: ['1922년형 개장함선', '1936년형 항공모함', '1939년형 항공모함', '1943년형 항공모함'],
  },
  {
    name: '잠수함',
    category: '해군',
    levelNames: ['1922년형 잠수함', '1936년형 잠수함', '1939년형 잠수함', '1943년형 잠수함'],
  },

  // ===== 항공 (공군) =====
  {
    name: '전투기',
    category: '항공',
    levelNames: ['1933년형 전투기', '1936년형 전투기', '1940년형 전투기', '1944년형 전투기', '1945년형 전투기'],
  },
  {
    name: '뇌격기',
    category: '항공',
    levelNames: ['1933년형 뇌격기', '1936년형 뇌격기', '1940년형 뇌격기', '1944년형 뇌격기', '1945년형 뇌격기'],
  },
  {
    name: '근접항공지원기',
    category: '항공',
    levelNames: ['1933년형 근접항공지원기', '1936년형 근접항공지원기', '1940년형 근접항공지원기', '1944년형 근접항공지원기', '1945년형 근접항공지원기'],
  },
  {
    name: '전술폭격기',
    category: '항공',
    levelNames: ['1933년형 전술폭격기', '1936년형 전술폭격기', '1940년형 전술폭격기', '1944년형 전술폭격기', '1945년형 전술폭격기'],
  },
  {
    name: '전략폭격기',
    category: '항공',
    levelNames: ['1933년형 전략폭격기', '1936년형 전략폭격기', '1940년형 전략폭격기', '1944년형 전략폭격기', '1945년형 전략폭격기'],
  },

  // ===== 공학 (과학기술) =====
  {
    name: '전자공학',
    category: '공학',
    levelNames: ['기초 전자공학', '개선된 전자공학', '고급 전자공학', '발전된 전자공학', '최고급 전자공학'],
  },
  {
    name: '레이더',
    category: '공학',
    levelNames: ['기초 레이더', '개선된 레이더', '발전된 레이더'],
  },

  // ===== 산업 =====
  {
    name: '중공업',
    category: '산업',
    levelNames: ['기초 중공업', '개선된 중공업', '발전된 중공업', '고급 중공업', '최고급 중공업'],
  },
  {
    name: '경공업',
    category: '산업',
    levelNames: ['기초 경공업', '개선된 경공업', '발전된 경공업', '고급 경공업'],
  },
  {
    name: '광업',
    category: '산업',
    levelNames: ['기초 광업', '개선된 광업', '발전된 광업', '고급 광업'],
  },
  {
    name: '화학',
    category: '산업',
    levelNames: ['기초 화학', '개선된 화학', '발전된 화학', '고급 화학', '최고급 화학'],
  },
  {
    name: '농업',
    category: '산업',
    levelNames: ['기초 농업', '개선된 농업', '발전된 농업', '고급 농업'],
  },
];

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const techTrees = techTreesRaw.map(tree => ({
  id: generateId(),
  name: tree.name,
  category: tree.category,
  levels: makeLevels(tree.levelNames, tree.category),
}));

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
  console.log('📊 기존 테크 트리 수:', (currentData.techTrees || []).length);
  console.log('📝 삽입할 테크 트리 수:', techTrees.length);

  const newData = {
    ...currentData,
    techTrees: techTrees,
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

  console.log('\n✅ 성공! 저장된 테크 트리 목록:');
  (result.data.techTrees || []).forEach((tree, i) => {
    console.log(`  ${i + 1}. [${tree.category}] ${tree.name} (${tree.levels.length}단계)`);
  });
  console.log(`\n🎉 총 ${result.data.techTrees.length}개의 기술 테크 트리가 저장되었습니다.`);
}

main().catch(err => {
  console.error('치명적 오류:', err);
  process.exit(1);
});
