-- =============================================
-- 모의전 정보조회 사이트 V2 - Supabase 데이터베이스 설정 확장
-- =============================================
-- 이 스크립트를 Supabase SQL Editor에서 실행하여 
-- 기존 데이터베이스에 계정, 턴, 연구, 자원 테이블을 추가하세요.

-- 1. users 테이블: 회원가입, 코옵 지원(여러 유저가 같은 assigned_country_id 가질 수 있음)
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,               
  role TEXT DEFAULT 'user',             -- 'admin', 'sub_admin', 'user'
  assigned_country_id UUID REFERENCES countries(id) ON DELETE SET NULL, 
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. game_state 테이블: 턴 진행 관리
CREATE TABLE IF NOT EXISTS game_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  current_turn INTEGER DEFAULT 1,
  turn_name TEXT DEFAULT '1턴',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 초기 게임 상태 삽입 (이미 있으면 무시)
INSERT INTO game_state (id, current_turn, turn_name) 
VALUES (1, 1, '1턴')
ON CONFLICT (id) DO NOTHING;

-- 3. researches 테이블: 커스텀 연구 (단계, 턴수 지정)
CREATE TABLE IF NOT EXISTS researches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  country_id UUID REFERENCES countries(id) ON DELETE CASCADE,
  category TEXT DEFAULT 'general',       -- 항목명 (military, economy 등)
  name TEXT NOT NULL,                    -- 기술명
  level INTEGER DEFAULT 1,               -- 기술 단계
  required_turns INTEGER DEFAULT 1,      -- 소모 턴수
  remaining_turns INTEGER DEFAULT 1,     -- 남은 턴수
  status TEXT DEFAULT 'queued',          -- 'queued', 'in_progress', 'completed'
  unlocks JSONB DEFAULT '[]',            -- 이 기술로 해금되는 유닛 식별자 배열
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. resources 테이블: 10종 필수 자원
CREATE TABLE IF NOT EXISTS resources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  country_id UUID REFERENCES countries(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,           -- wood, steel, coal, oil, chromium, tungsten, aluminum, rubber, sulfur, food
  amount NUMERIC DEFAULT 0,
  production_per_turn NUMERIC DEFAULT 0, -- 턴당 생산량
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_id, resource_type)
);

-- 5. resource_transfers 테이블: 국가 간 송금 기록
CREATE TABLE IF NOT EXISTS resource_transfers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_country_id UUID REFERENCES countries(id) ON DELETE SET NULL,
  to_country_id UUID REFERENCES countries(id) ON DELETE SET NULL,
  resource_type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  turn_number INTEGER,
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. RLS 정책 (모든 접근 허용, 기존과 동일)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE researches ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access on users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access on game_state" ON game_state FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access on researches" ON researches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access on resources" ON resources FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access on resource_transfers" ON resource_transfers FOR ALL USING (true) WITH CHECK (true);
