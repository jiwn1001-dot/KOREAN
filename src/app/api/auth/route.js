import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function POST(request) {
  try {
    const body = await request.json();
    const { type, password, countryId } = body;

    if (!password) {
      return NextResponse.json({ success: false, error: '비밀번호를 입력해주세요.' }, { status: 400 });
    }

    if (type === 'admin') {
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword) {
        return NextResponse.json({ success: false, error: '관리자 비밀번호가 설정되지 않았습니다.' }, { status: 500 });
      }

      if (password === adminPassword) {
        return NextResponse.json({ success: true, role: 'admin' });
      } else {
        return NextResponse.json({ success: false, error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
      }
    }

    if (type === 'country') {
      if (!countryId) {
        return NextResponse.json({ success: false, error: '국가를 선택해주세요.' }, { status: 400 });
      }

      const { data: country, error } = await supabase
        .from('countries')
        .select('id, name, password')
        .eq('id', countryId)
        .single();

      if (error || !country) {
        return NextResponse.json({ success: false, error: '국가를 찾을 수 없습니다.' }, { status: 404 });
      }

      if (password === country.password) {
        return NextResponse.json({
          success: true,
          role: 'country',
          countryId: country.id,
          countryName: country.name,
        });
      } else {
        return NextResponse.json({ success: false, error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
      }
    }

    return NextResponse.json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
