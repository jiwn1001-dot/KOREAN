const fs = require('fs');
let code = fs.readFileSync('src/app/country/[id]/page.js', 'utf8');

const t = /import \{ transferTech \} from '@\/lib\/gameLogic';/;
const r = "import { transferTech, transferItems } from '@/lib/gameLogic';";
code = code.replace(t, r);

const t2 = `      <div className="slide-up">
        <div className="content-section">
          <h3 className="content-section-title">⚔️ 군수 장비 인벤토리</h3>`;

const r2 = `      <div className="slide-up">
        <div className="content-section" style={{ marginBottom: '30px' }}>
          <h3 className="content-section-title">🚚 송금 및 물자 지원</h3>
          <div className="card" style={{ padding: '20px' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>다른 국가로 무기, 자원, 코인을 전송할 수 있습니다. 무기는 종류(이름)가 일치하는 항목끼리 합산되어 전송됩니다.</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <select id="transferTarget" className="form-select" style={{ flex: 1, minWidth: '150px' }}>
                <option value="">-- 받을 국가 선택 --</option>
                {countries.filter(c => c.id !== id).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select id="transferItem" className="form-select" style={{ flex: 1, minWidth: '150px' }}>
                <option value="">-- 보낼 물자 선택 --</option>
                <optgroup label="코인">
                  <option value="coin:agricultureCoins">농업 코인</option>
                  <option value="coin:heavyIndustryCoins">중공업 코인</option>
                  <option value="coin:lightIndustryCoins">경공업 코인</option>
                </optgroup>
                <optgroup label="자원">
                  {resources.filter(r => r.resource_type !== 'weapon' && r.amount > 0).map(r => (
                    <option key={r.id} value={\`resource:\${r.resource_type}\`}>
                      {resourceLabels[r.resource_type]?.label || r.resource_type} (보유: {r.amount})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="무기">
                  {weaponResources.filter(w => w.amount > 0).map(w => (
                    <option key={w.id} value={\`weapon:\${w.name}\`}>
                      {w.name} (보유: {w.amount})
                    </option>
                  ))}
                </optgroup>
              </select>
              <input type="number" id="transferAmount" className="form-input" placeholder="수량" style={{ width: '100px' }} />
              <button className="btn btn-primary" onClick={async () => {
                const toId = document.getElementById('transferTarget').value;
                const itemRaw = document.getElementById('transferItem').value;
                const amount = parseInt(document.getElementById('transferAmount').value);
                
                if (!toId) return showToast('국가를 선택하세요.', 'error');
                if (!itemRaw) return showToast('보낼 물자를 선택하세요.', 'error');
                if (!amount || amount <= 0) return showToast('수량을 올바르게 입력하세요.', 'error');
                
                const [type, key] = itemRaw.split(':');
                const res = await transferItems(id, toId, type, key, amount);
                if (res.success) {
                  showToast(res.message);
                  loadCountryData();
                } else {
                  showToast(res.message, 'error');
                }
              }}>보내기</button>
            </div>
          </div>
        </div>

        <div className="content-section">
          <h3 className="content-section-title">⚔️ 군수 장비 인벤토리</h3>`;

code = code.replace(t2, r2);

fs.writeFileSync('src/app/country/[id]/page.js', code, 'utf8');
console.log('UI injected successfully');
