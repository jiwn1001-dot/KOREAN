const fs = require('fs');
let code = fs.readFileSync('src/app/admin/page.js', 'utf8');

const t = `                        <select id="newBpName" className="form-select">
              <option value="">-- 무기명 선택 (기술명) --</option>
              {(Array.isArray(techTrees) ? techTrees : []).map((tree, idx) => (
                <optgroup key={tree.id || idx} label={tree.name}>
                  {(Array.isArray(tree.levels) ? tree.levels : []).map(lvl => (
                    <option key={lvl.level} value={lvl.name || \`\${tree.name} \${lvl.level}단계\`}>{lvl.name || \`\${tree.name} \${lvl.level}단계\`}</option>
                  ))}
                </optgroup>
              ))}
            </select>`;

const r = `            <input type="text" id="newBpName" className="form-input" list="bpNameOptions" placeholder="직접 입력하거나 목록에서 검색/선택" />
            <datalist id="bpNameOptions">
              {(Array.isArray(techTrees) ? techTrees : []).map(tree => 
                (Array.isArray(tree.levels) ? tree.levels : []).map(lvl => {
                  const val = lvl.name || \`\${tree.name} \${lvl.level}단계\`;
                  return <option key={\`\${tree.name}_\${lvl.level}\`} value={val} />;
                })
              )}
            </datalist>`;

if (code.includes(t)) {
  code = code.replace(t, r);
  fs.writeFileSync('src/app/admin/page.js', code, 'utf8');
  console.log('UI updated for newBpName datalist');
} else {
  console.log('Target not found');
}
