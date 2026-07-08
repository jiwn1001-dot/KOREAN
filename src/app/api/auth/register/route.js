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

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (existingUser) {
      return NextResponse.json({ success: false, error: '이미 존재하는 아이디입니다.' }, { status: 400 });
    }

    // Insert new user
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        username,
        password, // For a real app, hash this! (e.g. bcrypt)
        role: 'user',
        assigned_country_id: null,
      })
      .select('id, username, role, assigned_country_id')
      .single();

    if (error || !newUser) {
      console.error('Registration Error:', error);
      return NextResponse.json({ success: false, error: '회원가입 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        assignedCountryId: newUser.assigned_country_id,
      }
    });

  } catch (err) {
    console.error('Server Error:', err);
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
