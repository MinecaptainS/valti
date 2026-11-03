const test = require("node:test"),
  assert = require("node:assert/strict");
const data = require("../data.js"),
  engine = require("../app.js"),
  { validateData } = require("../tools/debugger/model.cjs");
test("active data stays valid and scoreable after local editing", () => {
  assert.deepEqual(validateData(data), []);
  for (let n = 0; n < 32; n++) {
    const answers = data.questions.map((_, i) => (i + n * ((i % 3) + 1)) % 4),
      r = engine.score(answers, data);
    assert.ok(r.pct.every((v) => Number.isFinite(v) && v >= 0 && v <= 100));
    assert.ok(data.players.some((p) => p.id === r.top.player.id));
    assert.equal(r.questionCount, data.questions.length);
  }
});
