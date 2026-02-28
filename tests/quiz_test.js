// Run: node tests/quiz_test.js
'use strict';
const assert = require('assert');
const path   = require('path');

// ---- minimal test runner ----
let passed = 0, failed = 0;
function test(name, fn) {
  try   { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}\n         ${e.message}`); }
}

// ---- load app under test ----
const app = require('../web/app.js');
app._setData(require('../data/prod.json'));
const { rangeClass, buildQuizScenarios, correctAction, pickHand } = app;

const SEAT_NAMES = new Set(['UTG', '+1', '+2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']);

// 169 canonical hand labels, matching cellToHand() in app.js
const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
const ALL_HANDS_SET = new Set();
for (let i = 0; i < 13; i++) {
  ALL_HANDS_SET.add(RANKS[i] + RANKS[i]);               // pair  — e.g. 'AA'
  for (let j = i + 1; j < 13; j++) {
    ALL_HANDS_SET.add(RANKS[i] + RANKS[j] + 's');       // suited — e.g. 'AKs'
    ALL_HANDS_SET.add(RANKS[i] + RANKS[j] + 'o');       // offsuit — e.g. 'AKo'
  }
}

// ---------------------------------------------------------------------------
// rangeClass
// ---------------------------------------------------------------------------
console.log('\nrangeClass:');
test('Raise Value → action-raise-value',  () => assert.equal(rangeClass('Raise Value'),  'action-raise-value'));
test('Raise Bluff → action-raise-bluff',  () => assert.equal(rangeClass('Raise Bluff'),  'action-raise-bluff'));
test('Call → action-call',                () => assert.equal(rangeClass('Call'),          'action-call'));
test('Fold → action-fold',                () => assert.equal(rangeClass('Fold'),          'action-fold'));
test('empty → action-unknown',            () => assert.equal(rangeClass(''),              'action-unknown'));
test('case-insensitive raise',            () => assert.equal(rangeClass('RAISE VALUE'),   'action-raise-value'));
test('bluff before raise check',          () => assert.equal(rangeClass('Raise for Bluff'), 'action-raise-bluff'));

// ---------------------------------------------------------------------------
// buildQuizScenarios — counts and structure
// ---------------------------------------------------------------------------
console.log('\nbuildQuizScenarios — counts:');
const scenarios = buildQuizScenarios();

test('total = 61',    () => assert.equal(scenarios.length, 61));
test('rfi = 8',       () => assert.equal(scenarios.filter(s => s.type === 'rfi').length,    8));
test('facing = 34',   () => assert.equal(scenarios.filter(s => s.type === 'facing').length, 34));
test('vs3bet = 19',   () => assert.equal(scenarios.filter(s => s.type === 'vs3bet').length, 19));

console.log('\nbuildQuizScenarios — structure:');
test('all have a tab',
  () => scenarios.forEach(s => assert.ok(s.tab,     `missing tab for ${s.type}/${s.heroPos}`)));
test('all heroPos are valid seat names',
  () => scenarios.forEach(s => assert.ok(SEAT_NAMES.has(s.heroPos), `bad heroPos: ${s.heroPos}`)));
test('rfi scenarios have raiserPos = null',
  () => scenarios.filter(s => s.type === 'rfi').forEach(s =>
    assert.equal(s.raiserPos, null, `rfi raiserPos should be null, got ${s.raiserPos}`)));
test('facing / vs3bet have valid raiserPos',
  () => scenarios.filter(s => s.type !== 'rfi').forEach(s =>
    assert.ok(SEAT_NAMES.has(s.raiserPos), `bad raiserPos: ${s.raiserPos}`)));
test('BB has no rfi scenario (no BB open range in data)',
  () => assert.equal(scenarios.filter(s => s.type === 'rfi' && s.heroPos === 'BB').length, 0));
test('all vs3bet scenarios have rfiTab',
  () => scenarios.filter(s => s.type === 'vs3bet').forEach(s =>
    assert.ok(s.rfiTab, `vs3bet missing rfiTab for heroPos=${s.heroPos} raiserPos=${s.raiserPos}`)));
test('heroPos !== raiserPos in every scenario',
  () => scenarios.filter(s => s.type !== 'rfi').forEach(s =>
    assert.notEqual(s.heroPos, s.raiserPos, `heroPos === raiserPos: ${s.heroPos}`)));

// ---------------------------------------------------------------------------
// correctAction  (uses real data — pairs stored as 'AA', not 'AAs')
// ---------------------------------------------------------------------------
console.log('\ncorrectAction:');

const rfiUtg    = scenarios.find(s => s.type === 'rfi'    && s.heroPos === 'UTG');
const facingBtn = scenarios.find(s => s.type === 'facing'  && s.heroPos === 'BTN');
const vs3betUtg = scenarios.find(s => s.type === 'vs3bet' && s.heroPos === 'UTG');

test('AA → open in rfi',
  () => assert.equal(correctAction('AA', rfiUtg.tab, 'rfi'), 'open'));
test('72o → fold in rfi (not in opening range)',
  () => assert.equal(correctAction('72o', rfiUtg.tab, 'rfi'), 'fold'));
test('AA → 3bet in facing',
  () => assert.equal(correctAction('AA', facingBtn.tab, 'facing'), '3bet'));
test('AA → 4bet in vs3bet',
  () => assert.equal(correctAction('AA', vs3betUtg.tab, 'vs3bet'), '4bet'));
test('type=rfi gives open (not 3bet) for raise hand',
  () => assert.equal(correctAction('AA', rfiUtg.tab, 'rfi'), 'open'));
test('type=vs3bet gives 4bet (not open/3bet) for raise hand',
  () => assert.equal(correctAction('AA', vs3betUtg.tab, 'vs3bet'), '4bet'));

// ---------------------------------------------------------------------------
// pickHand — all results must be valid hands; vs3bet pool restricted to rfi range
// ---------------------------------------------------------------------------
console.log('\npickHand:');

test('rfi: all results are valid canonical hands (50 draws)',
  () => {
    const s = scenarios.find(s => s.type === 'rfi');
    for (let i = 0; i < 50; i++) {
      const h = pickHand(s);
      assert.ok(ALL_HANDS_SET.has(h), `invalid hand: ${h}`);
    }
  });

test('vs3bet: all results are in hero opening range (200 draws)',
  () => {
    const s = scenarios.find(s => s.type === 'vs3bet' && s.rfiTab);
    const rfiHands = new Set(s.rfiTab.ranges.flatMap(r => r.hands));
    for (let i = 0; i < 200; i++) {
      const h = pickHand(s);
      assert.ok(rfiHands.has(h),
        `hand ${h} is not in ${s.heroPos} opening range — impossible holding`);
    }
  });

test('facing: all results are valid canonical hands (50 draws)',
  () => {
    const s = scenarios.find(s => s.type === 'facing');
    for (let i = 0; i < 50; i++) {
      const h = pickHand(s);
      assert.ok(ALL_HANDS_SET.has(h), `invalid hand: ${h}`);
    }
  });

// ---- summary ----
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
