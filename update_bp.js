const fs = require('fs');
let code = fs.readFileSync('src/app/admin/page.js', 'utf8');

const newBpNameSelect = `            <select id="newBpName" className="form-select">
              <option value="">-- 무기명 선택 (기술명) --</option>
              {(Array.isArray(techTrees) ? techTrees : []).map((tree, idx) => (
                <optgroup key={tree.id || idx} label={tree.name}>
                  {(Array.isArray(tree.levels) ? tree.levels : []).map(lvl => (
                    <option key={lvl.level} value={lvl.name || \`\${tree.name} \${lvl.level}단계\`}>{lvl.name || \`\${tree.name} \${lvl.level}단계\`}</option>
                  ))}
                </optgroup>
              ))}
            </select>`;

const resOptions = `                <option value="">-- 자원 선택 --</option>
                <option value="steel">강철</option>
                <option value="oil">석유</option>
                <option value="wood">목재</option>
                <option value="coal">석탄</option>
                <option value="chromium">크롬</option>
                <option value="tungsten">텅스텐</option>
                <option value="aluminum">알루미늄</option>
                <option value="rubber">고무</option>
                <option value="sulfur">유황</option>`;

const newBpRes1Select = `<select id="newBpRes1Name" className="form-select">
${resOptions}
              </select>`;

const newBpRes2Select = `<select id="newBpRes2Name" className="form-select">
${resOptions}
              </select>`;

code = code.replace('<input type="text" id="newBpName" className="form-input" placeholder="예: 1936년형 보병장비" />', newBpNameSelect);
code = code.replace('<input type="text" id="newBpRes1Name" className="form-input" placeholder="steel" />', newBpRes1Select);
code = code.replace('<input type="text" id="newBpRes2Name" className="form-input" placeholder="oil" />', newBpRes2Select);

code = code.replace('<input type="number" id="newBpIndustryCost" className="form-input" placeholder="1" defaultValue="1" />', '<input type="number" id="newBpIndustryCost" className="form-input" placeholder="1" defaultValue="1" step="0.1" />');
code = code.replace('<input type="number" id="newBpRes1Cost" className="form-input" placeholder="수량" />', '<input type="number" id="newBpRes1Cost" className="form-input" placeholder="수량" step="0.1" />');
code = code.replace('<input type="number" id="newBpRes2Cost" className="form-input" placeholder="수량" />', '<input type="number" id="newBpRes2Cost" className="form-input" placeholder="수량" step="0.1" />');

code = code.replace('parseInt(document.getElementById(\'newBpIndustryCost\').value) || 1', 'parseFloat(document.getElementById(\'newBpIndustryCost\').value) || 1');
code = code.replace('parseInt(document.getElementById(\'newBpRes1Cost\').value) || 0', 'parseFloat(document.getElementById(\'newBpRes1Cost\').value) || 0');
code = code.replace('parseInt(document.getElementById(\'newBpRes2Cost\').value) || 0', 'parseFloat(document.getElementById(\'newBpRes2Cost\').value) || 0');

fs.writeFileSync('src/app/admin/page.js', code, 'utf8');
console.log('Blueprint UI updated via node script!');
