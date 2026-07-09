const fs = require('fs');
let code = fs.readFileSync('src/lib/gameLogic.js', 'utf8');

const target1 = `        if (effectMap.prevent_fail.has(key)) {
          const tree = techTrees.find(t => t.name === r.name);
          if (tree) {
            const lvl = tree.levels.find(l => l.level === r.level);
            if (lvl && lvl.era) {
              if (!safeEras[r.country_id]) safeEras[r.country_id] = new Set();
              safeEras[r.country_id].add(lvl.era);
            }
          }
        }`;
const replace1 = `        if (effectMap.prevent_fail.has(key)) {
          const tree = techTrees.find(t => t.name === r.name);
          if (tree) {
            const lvl = tree.levels.find(l => l.level === r.level);
            if (lvl && lvl.era) {
              if (!safeEras[r.country_id]) safeEras[r.country_id] = new Set();
              safeEras[r.country_id].add(lvl.era);
            }
          }
        }
        if (effectMap.research_speed.has(key)) {
          const tree = techTrees.find(t => t.name === r.name);
          if (tree) {
            const lvl = tree.levels.find(l => l.level === r.level);
            if (lvl && lvl.era) {
              if (!countryTechMultipliers[r.country_id].fastEras) countryTechMultipliers[r.country_id].fastEras = new Set();
              countryTechMultipliers[r.country_id].fastEras.add(lvl.era);
            }
          }
        }`;

code = code.replace(target1, replace1);

const target2 = `      for (const r of activeResearches) {
        const newRemaining = Math.max(0, r.remaining_turns - 1);
        let status = 'in_progress';
        
        if (newRemaining === 0) {`;

const replace2 = `      for (const r of activeResearches) {
        let currentEra = null;
        const tree = techTrees.find(t => t.name === r.name);
        if (tree) {
          const lvl = tree.levels.find(l => l.level === r.level);
          if (lvl) currentEra = lvl.era;
        }
        
        const isFast = currentEra && countryTechMultipliers[r.country_id]?.fastEras?.has(currentEra);
        const deduction = isFast ? 2 : 1;
        const newRemaining = Math.max(0, r.remaining_turns - deduction);
        let status = 'in_progress';
        
        if (newRemaining === 0) {`;

code = code.replace(target2, replace2);

const target3 = `          // 실패 확률 계산 (50%)
          let currentEra = null;
          const tree = techTrees.find(t => t.name === r.name);
          if (tree) {
            const lvl = tree.levels.find(l => l.level === r.level);
            if (lvl) currentEra = lvl.era;
          }`;
const replace3 = `          // 실패 확률 계산 (50%)`;
code = code.replace(target3, replace3);

fs.writeFileSync('src/lib/gameLogic.js', code, 'utf8');

// Also update admin/page.js saveGameSettings bug
let adminCode = fs.readFileSync('src/app/admin/page.js', 'utf8');
const adminTarget = `      await upsertDataEntry('game_settings', null, payload);
      if (newData.techTrees) setTechTrees(newData.techTrees);
      if (newData.weaponBlueprints) setWeaponBlueprints(newData.weaponBlueprints);
      showToast('게임 설정이 저장되었습니다.');`;

const adminReplace = `      await upsertDataEntry('game_settings', null, payload);
      await loadGameSettings();
      showToast('게임 설정이 저장되었습니다.');`;

adminCode = adminCode.replace(adminTarget, adminReplace);
fs.writeFileSync('src/app/admin/page.js', adminCode, 'utf8');

console.log('Update script successful!');
