const fs = require('fs');
let code = fs.readFileSync('src/app/admin/page.js', 'utf8');

const target = `              <small style={{ color: 'var(--text-muted)' }}>초기 산정: 전체의 40%</small>
            </div>
          </div>`;

const replacement = `              <small style={{ color: 'var(--text-muted)' }}>초기 산정: 전체의 40%</small>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">인구당 식량 소비 배율</label>
              <input
                type="number"
                step="0.1"
                className="form-input"
                value={economyData.food_consumption_mult ?? 1.0}
                onChange={(e) => setEconomyData(p => ({ ...p, food_consumption_mult: parseFloat(e.target.value) || 0 }))}
              />
              <small style={{ color: 'var(--text-muted)' }}>기본값 1.0</small>
            </div>
            <div className="form-group">
              <label className="form-label">인구당 소비재 소비 배율</label>
              <input
                type="number"
                step="0.1"
                className="form-input"
                value={economyData.cg_consumption_mult ?? 1.0}
                onChange={(e) => setEconomyData(p => ({ ...p, cg_consumption_mult: parseFloat(e.target.value) || 0 }))}
              />
              <small style={{ color: 'var(--text-muted)' }}>기본값 1.0</small>
            </div>
          </div>`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('src/app/admin/page.js', code, 'utf8');
  console.log('Modified admin/page.js');
} else {
  console.log('Target not found');
}
