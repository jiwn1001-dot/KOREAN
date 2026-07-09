const fs = require('fs');
let code = fs.readFileSync('src/app/admin/page.js', 'utf8');

const t = `            <datalist id="bpNameOptions">
              {(Array.isArray(techTrees) ? techTrees : []).map(tree => 
                (Array.isArray(tree.levels) ? tree.levels : []).map(lvl => {
                  const val = lvl.name || \`\${tree.name} \${lvl.level}단계\`;
                  return <option key={\`\${tree.name}_\${lvl.level}\`} value={val} />;
                })
              )}
            </datalist>`;

const r = `            <datalist id="bpNameOptions">
              {(Array.isArray(techTrees) ? techTrees : []).flatMap(tree => 
                (Array.isArray(tree.levels) ? tree.levels : []).map(lvl => {
                  const val = lvl.name || \`\${tree.name} \${lvl.level}단계\`;
                  return <option key={\`\${tree.name}_\${lvl.level}\`} value={val}>{val}</option>;
                })
              )}
            </datalist>`;

if (code.includes(t)) {
  code = code.replace(t, r);
  fs.writeFileSync('src/app/admin/page.js', code, 'utf8');
  console.log('datalist updated with flatMap and inner text');
} else {
  console.log('Target not found');
}
