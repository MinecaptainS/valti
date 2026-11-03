const test = require("node:test");
const assert = require("node:assert/strict");
// Frozen baseline keeps regression checks useful after editing the active dataset.
const data = require("./fixtures/baseline-data.json");
const {
  score,
  center,
  cosine,
  maxScores,
  radarPoints,
  calibrateStyle,
  scoreEntry,
  resultVersion,
} = require("../app.js");
const { createHash } = require("node:crypto");

test("baseline fixture retains original handoff data and question weights", () => {
  const hashes = {
    players: "8fb955386f8c1fd4729efe8b792f2083bc05c207e40a1bb175765f832003f56c",
    teams: "ae8d0fcb2f259f04ecea61ab8ebb25804d274b23ab54ce4322f5c384a88d738c",
    questions:
      "6444345df336d6832f4ea411d35201f15dc414d412fb27bc996f62bfcdd99887",
  };
  for (const [key, hash] of Object.entries(hashes))
    assert.equal(
      createHash("sha256")
        .update(
          JSON.stringify(
            key === "questions" ? data.questions.slice(0, 20) : data[key],
          ),
        )
        .digest("hex"),
      hash,
      key + " differs from handoff",
    );
});

test("35 players, 39 teams, 23 four-option questions and four roles", () => {
  assert.equal(data.players.length, 35);
  assert.equal(data.teams.length, 39);
  assert.equal(data.questions.length, 23);
  assert.equal(new Set(data.players.map((p) => p.id)).size, 35);
  assert.deepEqual(
    data.dims.map((d) => d.key),
    ["AIM", "ENTRY", "IGL", "NERVE", "FLEX", "TEAM", "GRIND", "SHOW"],
  );
  data.questions.forEach((q) => {
    assert.equal(q.options.length, 4);
    if (q.kind !== "aim")
      q.options.forEach((o) =>
        assert.deepEqual(Object.values(o.weights).sort(), [1, 2]),
      );
    else {
      q.options.forEach((o) =>
        assert.deepEqual(Object.keys(o.weights), ["AIM"]),
      );
      assert.deepEqual(
        q.options.map((o) => o.weights.AIM),
        [100, 75, 45, 15],
      );
    }
  });
  data.players.forEach((p) => {
    assert.ok(["决斗", "控场", "道具", "自由人"].includes(p.role));
    assert.ok(!p.team || data.teams.some((t) => t.id === p.team));
    assert.equal(p.v.length, 8);
    p.v.forEach((v) => assert.ok(v >= 0 && v <= 10));
  });
  assert.equal(data.players.find((p) => p.name === "nAts").team, "tl");
});

test("normalization is calculated from the question bank", () => {
  const original = maxScores(data),
    modified = structuredClone(data);
  modified.questions[0].options[0].weights.AIM = 99;
  assert.equal(maxScores(modified)[0], original[0] + 98);
  const result = score(Array(20).fill(0), data, 1);
  assert.deepEqual(result.raw, [16, 16, 2, 5, 0, 7, 8, 6]);
  assert.deepEqual(result.maxima, [24, 23, 33, 28, 29, 28, 20, 24]);
  result.pct.forEach((v, i) =>
    assert.equal(v, (100 * result.raw[i]) / result.maxima[i]),
  );
});

test("independent reference implementation preserves all legacy rankings", () => {
  const weights = {
    AIM: 0.9,
    ENTRY: 1,
    IGL: 1,
    NERVE: 1.1,
    FLEX: 1,
    TEAM: 0.9,
    GRIND: 0.8,
    SHOW: 1,
  };
  for (let iteration = 0; iteration < 60; iteration++) {
    const a = Array.from(
      { length: 20 },
      (_, i) => (i * 7 + iteration * ((i % 3) + 1)) % 4,
    );
    const actual = score(a, data, 1);
    const user = data.dims.map(
      (d) =>
        (100 *
          data.questions
            .slice(0, 20)
            .reduce(
              (s, q, i) => s + (q.options[a[i]].weights[d.key] || 0),
              0,
            )) /
        data.questions
          .slice(0, 20)
          .reduce(
            (s, q) =>
              s + Math.max(...q.options.map((o) => o.weights[d.key] || 0)),
            0,
          ),
    );
    const mean = user.reduce((s, v) => s + v) / 8,
      u = user.map((v) => v - mean);
    const role = data.questions[0].options[a[0]].role;
    const expected = data.players
      .map((p) => {
        const meanP = p.v.reduce((s, v) => s + v) / 8;
        let dot = 0,
          uu = 0,
          pp = 0;
        for (let i = 0; i < 8; i++) {
          const v = (p.v[i] - meanP) * 10,
            w = weights[data.dims[i].key];
          dot += w * u[i] * v;
          uu += w * u[i] ** 2;
          pp += w * v * v;
        }
        const sim = dot / Math.sqrt(uu * pp);
        return {
          id: p.id,
          sim,
          final: sim * (p.role === role ? 1.08 : p.sub === role ? 1.03 : 1),
        };
      })
      .sort((a, b) => b.final - a.final || a.id.localeCompare(b.id));
    assert.deepEqual(
      actual.ranked.map((r) => r.player.id),
      expected.map((r) => r.id),
    );
    assert.ok(Math.abs(actual.top.sim - expected[0].sim) < 1e-12);
    assert.equal(
      actual.similarity,
      Math.round(Math.max(0, expected[0].sim) * 100),
    );
  }
});

test("three AIM-only questions follow the exact requested text and A > B > C > D order", () => {
  const [range, stop, whiff] = data.questions.slice(20);
  assert.deepEqual(
    data.questions.slice(20).map((q) => q.aimWeight),
    [5, 3, 2],
  );
  assert.deepEqual(
    range.options.map((o) => o.text),
    ["27–30", "22–26", "16–21", "15 及以下"],
  );
  assert.match(stop.options[0].text, /首发很少失控/);
  assert.match(stop.options[3].text, /还没完全停住/);
  assert.equal(whiff.text, "马枪之后，你会：");
  assert.deepEqual(
    whiff.options.map((o) => o.text),
    [
      "我几乎从不马枪",
      "冷静横移重新定位",
      "继续按住左键尝试控枪击杀",
      "马到底",
    ],
  );
});

test("AIM specials contribute exactly 75%, with 50/30/20 internal weights and no other dimension changes", () => {
  const base = Array(23).fill(1),
    before = score(base, data);
  for (const [offset, weight] of [
    [20, 0.5],
    [21, 0.3],
    [22, 0.2],
  ]) {
    const results = [0, 1, 2, 3].map((n) => {
      const answers = base.slice();
      answers[offset] = n;
      return score(answers, data);
    });
    for (let i = 0; i < 3; i++)
      assert.ok(results[i].pct[0] > results[i + 1].pct[0]);
    for (const r of results) {
      assert.deepEqual(r.pct.slice(1), before.pct.slice(1));
      assert.deepEqual(r.raw, before.raw);
    }
    assert.ok(
      Math.abs(results[0].pct[0] - results[3].pct[0] - 0.75 * weight * 85) <
        1e-10,
    );
  }
  const high = score([...base.slice(0, 20), 0, 0, 0], data),
    low = score([...base.slice(0, 20), 3, 3, 3], data);
  assert.equal(high.mechanicalAim, 100);
  assert.equal(low.mechanicalAim, 15);
  assert.ok(Math.abs(high.pct[0] - low.pct[0] - 63.75) < 1e-10);
  assert.ok(
    high.pct[0] - low.pct[0] > 25,
    "specials have more influence than the entire legacy AIM contribution",
  );
  assert.equal(data.scoring.aimSpecialWeight, 0.75);
});

test("style calibration lifts low scores, preserves order, and bounds output", () => {
  assert.equal(calibrateStyle(0, data), 20);
  assert.equal(calibrateStyle(25, data), 60);
  assert.equal(calibrateStyle(100, data), 100);
  let previous = -1;
  for (let n = 0; n <= 100; n++) {
    const actual = calibrateStyle(n, data);
    assert.ok(actual >= n && actual > previous && actual <= 100);
    previous = actual;
  }
  const screenshot = [25, 0, 52, 25, 14, 46, 55, 8];
  assert.deepEqual(
    screenshot.map((n) => Math.round(calibrateStyle(n, data))),
    [60, 20, 78, 60, 50, 74, 79, 43],
  );
});

test("new scoring agrees with an independent formula and uses the calibrated vector for matching", () => {
  for (let t = 0; t < 80; t++) {
    const answers = Array.from(
      { length: 23 },
      (_, i) => (i * 3 + t * ((i % 4) + 1)) % 4,
    );
    const legacy = score(answers.slice(0, 20), data, 1),
      result = score(answers, data);
    const expected = legacy.pct.map((n) => 20 + 80 * Math.sqrt(n / 100));
    const special =
      0.5 * [100, 75, 45, 15][answers[20]] +
      0.3 * [100, 75, 45, 15][answers[21]] +
      0.2 * [100, 75, 45, 15][answers[22]];
    expected[0] = 0.75 * special + 0.25 * expected[0];
    expected.forEach((v, i) => assert.ok(Math.abs(result.pct[i] - v) < 1e-10));
    const mean = expected.reduce((s, v) => s + v, 0) / 8,
      u = expected.map((v) => v - mean),
      weights = [1.2, 1, 1, 1.1, 1, 0.9, 0.8, 1];
    const expectedRank = data.players
      .map((p) => {
        const meanP = p.v.reduce((s, v) => s + v, 0) / 8;
        let dot = 0,
          uu = 0,
          pp = 0;
        for (let i = 0; i < 8; i++) {
          const v = (p.v[i] - meanP) * 10;
          dot += weights[i] * u[i] * v;
          uu += weights[i] * u[i] ** 2;
          pp += weights[i] * v * v;
        }
        const sim = dot / Math.sqrt(uu * pp),
          final =
            sim *
            (p.role === result.role ? 1.08 : p.sub === result.role ? 1.03 : 1);
        return { id: p.id, sim, final };
      })
      .sort((a, b) => b.final - a.final || a.id.localeCompare(b.id));
    assert.deepEqual(
      result.ranked.map((x) => x.player.id),
      expectedRank.map((x) => x.id),
    );
    assert.ok(Math.abs(result.top.sim - expectedRank[0].sim) < 1e-10);
  }
});

test("historical versions remain valid without fabricating missing aim answers", () => {
  const old = { answers: Array(20).fill(1) },
    updated = { answers: Array(23).fill(1), scoringVersion: 2 };
  assert.equal(resultVersion(old, data), 1);
  assert.equal(resultVersion(updated, data), 2);
  assert.equal(scoreEntry(old, data).version, 1);
  assert.equal(scoreEntry(old, data).mechanicalAim, null);
  assert.deepEqual(scoreEntry(old, data).pct, score(old.answers, data, 1).pct);
  assert.equal(resultVersion({ ...old, scoringVersion: 2 }, data), null);
  assert.equal(resultVersion({ ...updated, scoringVersion: 3 }, data), null);
  assert.throws(() => score(old.answers, data));
});

test("centering, zero norms, radar geometry and incomplete answer handling", () => {
  assert.deepEqual(center([10, 20, 30]), [-10, 0, 10]);
  assert.equal(cosine(Array(8).fill(0), Array(8).fill(1)), 0);
  assert.equal(cosine([1, -1, 0, 0, 0, 0, 0, 0], [1, -1, 0, 0, 0, 0, 0, 0]), 1);
  const pts = radarPoints([100, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(pts[0], [180, 60]);
  assert.deepEqual(pts[1], [180, 172]);
  for (const invalid of [
    [],
    Array(20).fill(null),
    Array(20).fill(4),
    Array(20).fill(-1),
    Array(23),
    Array(23).fill(null),
    Array(23).fill(4),
  ])
    assert.throws(() => score(invalid, data));
});

test("close results, partners, role confession and all displayed values stay valid", () => {
  let blendFound = false;
  for (let n = 0; n < 1000; n++) {
    const a = Array.from(
        { length: data.questions.length },
        (_, i) => (n >>> ((i % 8) * 2)) % 4,
      ),
      r = score(a, data);
    assert.ok(r.pct.every((x) => Number.isFinite(x) && x >= 0 && x <= 100));
    assert.notEqual(r.complement.id, r.top.player.id);
    assert.equal(r.roleBest.role, r.role);
    assert.equal(r.roleLeast.role, r.role);
    if (r.blend) {
      blendFound = true;
      assert.ok(r.share >= 50 && r.share <= 65);
    }
  }
  assert.ok(blendFound);
});
