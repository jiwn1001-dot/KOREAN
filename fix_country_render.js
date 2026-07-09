const fs = require('fs');
let code = fs.readFileSync('src/app/country/[id]/page.js', 'utf8');

const t1 = `const hasCoalToOil = researches.some(r => r.status === 'completed' && r.name.includes('석탄-석유'));`;
const r1 = `const hasCoalToOil = researches.some(r => r.status === 'completed' && r.name && r.name.includes('석탄-석유'));`;
code = code.replace(t1, r1);

const t2 = `                if (!toId) return showToast('국가를 선택하세요.', 'error');
                if (!itemRaw) return showToast('보낼 물자를 선택하세요.', 'error');
                if (!amount || amount <= 0) return showToast('수량을 올바르게 입력하세요.', 'error');
                
                const [type, key] = itemRaw.split(':');
                const res = await transferItems(countryId, toId, type, key, amount);
                if (res.success) {
                  showToast(res.message);
                  loadCountryData();
                } else {
                  showToast(res.message, 'error');
                }`;

const r2 = `                if (!toId) return alert('국가를 선택하세요.');
                if (!itemRaw) return alert('보낼 물자를 선택하세요.');
                if (!amount || amount <= 0) return alert('수량을 올바르게 입력하세요.');
                
                const [type, key] = itemRaw.split(':');
                const res = await transferItems(countryId, toId, type, key, amount);
                if (res.success) {
                  alert(res.message);
                  loadAllData();
                } else {
                  alert(res.message);
                }`;
code = code.replace(t2, r2);

fs.writeFileSync('src/app/country/[id]/page.js', code, 'utf8');
console.log('Fixed potential crash bugs in country/[id]/page.js');
