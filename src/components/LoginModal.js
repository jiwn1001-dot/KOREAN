'use client';

import { useState } from 'react';
import { loginWithCredentials, register } from '@/lib/auth';

export default function LoginModal({ onClose, onSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
      setError('아이디와 비밀번호를 모두 입력해주세요.');
      return;
    }

    setLoading(true);

    try {
      let res;
      if (isLogin) {
        res = await loginWithCredentials(username, password);
      } else {
        res = await register(username, password);
      }

      if (res.success) {
        onSuccess();
      } else {
        setError(res.error || '오류가 발생했습니다.');
      }
    } catch (err) {
      setError('연결 중 오류가 발생했습니다.');
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal slide-up">
        <button className="modal-close" onClick={onClose}>✕</button>

        <div className="modal-header">
          <h2 className="modal-title">
            {isLogin ? '🔑 로그인' : '📝 회원가입'}
          </h2>
          <p className="modal-subtitle">
            {isLogin
              ? '아이디와 비밀번호를 입력하세요. 최고관리자는 admin 계정으로 로그인하세요.'
              : '새로운 아이디와 비밀번호를 입력하여 가입하세요.'}
          </p>
        </div>

        <div className="tabs" style={{ marginBottom: '20px' }}>
          <button 
            className={`tab ${isLogin ? 'active' : ''}`}
            onClick={() => { setIsLogin(true); setError(''); }}
            style={{ flex: 1 }}
          >
            로그인
          </button>
          <button 
            className={`tab ${!isLogin ? 'active' : ''}`}
            onClick={() => { setIsLogin(false); setError(''); }}
            style={{ flex: 1 }}
          >
            회원가입
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">아이디</label>
            <input
              type="text"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="아이디를 입력하세요"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">비밀번호</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px',
              background: 'var(--error-bg)',
              border: '1px solid rgba(248,113,113,0.2)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--error)',
              fontSize: '0.88rem',
              marginBottom: '16px',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? '처리 중...' : (isLogin ? '로그인' : '회원가입')}
          </button>
        </form>
      </div>
    </div>
  );
}
