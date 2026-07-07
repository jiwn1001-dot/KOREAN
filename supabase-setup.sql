-- =============================================
-- 모의전 정보조회 사이트 - Supabase 데이터베이스 설정
-- =============================================
-- Supabase SQL Editor에서 이 스크립트를 실행하세요.

-- 1. 국가 테이블
CREATE TABLE countries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  color TEXT DEFAULT '#cccccc',
  flag_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 데이터 엔트리 (모든 카테고리의 데이터를 JSONB로 저장)
CREATE TABLE data_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  country_id UUID REFERENCES countries(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 이미지 테이블
CREATE TABLE images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID REFERENCES data_entries(id) ON DELETE CASCADE,
  section TEXT DEFAULT 'general',
  url TEXT NOT NULL,
  caption TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 지도 데이터
CREATE TABLE map_data (
  id INTEGER PRIMARY KEY DEFAULT 1,
  image_data TEXT,
  legend JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 초기 데이터 삽입

-- 역사 (공유 데이터, country_id = NULL)
INSERT INTO data_entries (category, country_id, data) VALUES
  ('history', NULL, '{"content": "", "title": "역사"}');

-- 지리 (공유 데이터, country_id = NULL)
INSERT INTO data_entries (category, country_id, data) VALUES
  ('geography', NULL, '{"mountains": [], "rivers": [], "plains": [], "title": "지리"}');

-- 지도 초기 데이터
INSERT INTO map_data (id, image_data, legend) VALUES (1, NULL, '[]');

-- 6. RLS 정책 (간단한 게임 사이트이므로 모든 접근 허용)
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access" ON countries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON data_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON images FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON map_data FOR ALL USING (true) WITH CHECK (true);

-- 7. Supabase Storage 설정 (대시보드에서 수동으로 해야 함)
-- Storage > New Bucket > 이름: "images" > Public bucket 체크 > Create
