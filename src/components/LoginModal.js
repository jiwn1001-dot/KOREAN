'use client';

import { useState, useEffect } from 'react';
import { loginAsAdmin, loginAsCountry } from '@/lib/auth';
import { getCountries } from '@/lib/store';

export default function LoginModal({ type = 'admin', onClose, onSuccess }) {
  const [password, setPassword] = useState('');
  const [countryId, setCountryId] = useState('');
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (type === 'country') {
      getCountries().then(setCountries).catch(console.error);
    }
  }, [type]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let success = false;
      if (type === 'admin') {
        success = await loginAsAdmin(password);
      } else {
        if (!countryId) {
          setError('국가를 선택해주세요.');
          setLoading(false);
          return;
        }
        success = await loginAsCountry(countryId, password);
      }

      if (success) {
        onSuccess();
      } else {
        setError('비밀번호가 올바르지 않습니다.');
      }
    } catch (err) {
      setError('로그인 중 오류가 발생했습니다.');
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal slide-up">
        <button className="modal-close" onClick={onClose}>✕</button>

        <div className="modal-header">
          <h2 className="modal-title">
            {type === 'admin' ? '🛡️ 관리자 로그인' : '🔑 국가 로그인'}
          </h2>
          <p className="modal-subtitle">
            {type === 'admin'
              ? '관리자 비밀번호를 입력하세요.'
              : '국가를 선택하고 비밀번호를 입력하세요.'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {type === 'country' && (
            <div className="form-group">
              <label className="form-label">국가 선택</label>
              <select
                className="form-select"
                value={countryId}
                onChange={(e) => setCountryId(e.target.value)}
              >
                <option value="">-- 국가를 선택하세요 --</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">비밀번호</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              autoFocus
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
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
