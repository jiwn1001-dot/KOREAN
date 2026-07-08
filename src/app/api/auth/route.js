import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ success: false, error: '아이디와 비밀번호를 모두 입력해주세요.' }, { status: 400 });
    }

    // 1. 최고 관리자 하드코딩 인증 처리
    const adminUsername = 'admin'; // Or use env
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (username === adminUsername && password === adminPassword) {
      return NextResponse.json({ 
        success: true, 
        user: { id: 'admin', username: 'admin', role: 'admin', assignedCountryId: null } 
      });
    }

    // 2. 일반 유저 / 부관리자 인증 처리 (DB 확인)
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, password, role, assigned_country_id')
      .eq('username', username)
      .single();

    if (error || !user) {
      return NextResponse.json({ success: false, error: '존재하지 않는 아이디입니다.' }, { status: 404 });
    }

    if (user.password !== password) {
      return NextResponse.json({ success: false, error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        assignedCountryId: user.assigned_country_id,
      }
    });

  } catch (err) {
    console.error('Login Error:', err);
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
