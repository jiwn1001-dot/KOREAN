const fs = require('fs');
let code = fs.readFileSync('src/app/country/[id]/page.js', 'utf8');

const t = `  const renderMilitary = () => {
    const hasCoalToOil = researches.some(r => r.status === 'completed' && r.name.includes('석탄-석유')); // Example check, will refine later`;

const r = `  const renderMilitary = () => {
    const resourceLabels = {
      wood: { label: '목재', icon: '🪵' },
      steel: { label: '강철', icon: '🔩' },
      coal: { label: '석탄', icon: '🪨' },
      oil: { label: '석유', icon: '🛢️' },
      chromium: { label: '크롬', icon: '💎' },
      tungsten: { label: '텅스텐', icon: '⚡' },
      aluminum: { label: '알루미늄', icon: '⚙️' },
      food: { label: '식료품', icon: '🍞' },
      consumer_goods: { label: '소비재', icon: '🛍️' }
    };
    const hasCoalToOil = researches.some(r => r.status === 'completed' && r.name.includes('석탄-석유')); // Example check, will refine later`;

code = code.replace(t, r);
fs.writeFileSync('src/app/country/[id]/page.js', code, 'utf8');
console.log('Fixed resourceLabels ReferenceError');
