import assert from 'node:assert/strict';
import { createAerialBattle, processBattleRound } from '../src/lib/aerialCombat.js';

const battle = createAerialBattle('test-battle', 'supremacy', 'attacker', 'defender', [{ id: 'a1', name: 'F-16', speed: 3, quantity: 2 }], [{ id: 'd1', name: 'MiG-29', speed: 2, quantity: 2 }], 10, 10);

battle.attackerChoice = { cardId: battle.attackerState.hand[0].cardId, type: 'normal' };
battle.defenderChoice = { cardId: battle.defenderState.hand[0].cardId, type: 'normal' };

processBattleRound(battle);

const attackerHandRemaining = battle.attackerState.hand.length;
const defenderHandRemaining = battle.defenderState.hand.length;
const roundAdvanced = battle.round > 1;
const battleStillActive = battle.status === 'active';
const historyRecorded = battle.history.length > 0;

assert.ok(attackerHandRemaining >= 0, '공격측은 카드 수가 음수가 아니어야 합니다.');
assert.ok(defenderHandRemaining >= 0, '방어측은 카드 수가 음수가 아니어야 합니다.');
assert.equal(roundAdvanced, true, '라운드가 1회 진행되어야 합니다.');
assert.equal(battleStillActive, true, '제공권 전투는 한 라운드만 끝나지 않고 계속 진행되어야 합니다.');
assert.equal(historyRecorded, true, '라운드 결과가 히스토리에 저장되어야 합니다.');

console.log('aerial combat regression test passed');
