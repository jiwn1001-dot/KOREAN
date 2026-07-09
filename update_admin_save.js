const fs = require('fs');
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
