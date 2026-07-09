const fs = require('fs');
let code = fs.readFileSync('src/lib/gameLogic.js', 'utf8');

const t1 = `const newFoodAmount = prevFood + foodAmount - population;`;
const r1 = `const foodMult = data.food_consumption_mult !== undefined ? data.food_consumption_mult : 1.0;
            const newFoodAmount = prevFood + foodAmount - Math.floor(population * foodMult);`;

const t2 = `const newCgAmount = prevCg + cgAmount - population;`;
const r2 = `const cgMult = data.cg_consumption_mult !== undefined ? data.cg_consumption_mult : 1.0;
            const newCgAmount = prevCg + cgAmount - Math.floor(population * cgMult);`;

code = code.replace(t1, r1);
code = code.replace(t2, r2);

fs.writeFileSync('src/lib/gameLogic.js', code, 'utf8');
console.log('gameLogic updated with multipliers');
