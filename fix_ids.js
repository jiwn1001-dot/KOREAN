const fs = require('fs');
let code = fs.readFileSync('src/app/admin/page.js', 'utf8');

const r1 = /id=\{`levelName_\$\{tree\.id\}`\}/g;
const r1n = 'id={`levelName_${tree.id || idx}`}';
const r2 = /id=\{`levelTurn_\$\{tree\.id\}`\}/g;
const r2n = 'id={`levelTurn_${tree.id || idx}`}';
const r3 = /id=\{`levelEra_\$\{tree\.id\}`\}/g;
const r3n = 'id={`levelEra_${tree.id || idx}`}';
const r4 = /id=\{`levelEffect_\$\{tree\.id\}`\}/g;
const r4n = 'id={`levelEffect_${tree.id || idx}`}';

const r5 = /document\.getElementById\(`levelName_\$\{tree\.id\}`\)/g;
const r5n = 'document.getElementById(`levelName_${tree.id || idx}`)';
const r6 = /document\.getElementById\(`levelTurn_\$\{tree\.id\}`\)/g;
const r6n = 'document.getElementById(`levelTurn_${tree.id || idx}`)';
const r7 = /document\.getElementById\(`levelEra_\$\{tree\.id\}`\)/g;
const r7n = 'document.getElementById(`levelEra_${tree.id || idx}`)';
const r8 = /document\.getElementById\(`levelEffect_\$\{tree\.id\}`\)/g;
const r8n = 'document.getElementById(`levelEffect_${tree.id || idx}`)';

const r9 = /id=\{`techSendTarget_\$\{tree\.id\}`\}/g;
const r9n = 'id={`techSendTarget_${tree.id || idx}`}';
const r10 = /document\.getElementById\(`techSendTarget_\$\{tree\.id\}`\)/g;
const r10n = 'document.getElementById(`techSendTarget_${tree.id || idx}`)';

code = code.replace(r1, r1n);
code = code.replace(r2, r2n);
code = code.replace(r3, r3n);
code = code.replace(r4, r4n);
code = code.replace(r5, r5n);
code = code.replace(r6, r6n);
code = code.replace(r7, r7n);
code = code.replace(r8, r8n);
code = code.replace(r9, r9n);
code = code.replace(r10, r10n);

fs.writeFileSync('src/app/admin/page.js', code, 'utf8');
console.log('Fixed DOM IDs for tree inputs!');
