const test = require("node:test");
const assert = require("node:assert/strict");
const data = require("../data.js");
const { score, center, cosine, maxScores, radarPoints } = require("../app.js");
const { createHash } = require("node:crypto");

test("original handoff data and exact question weights remain unchanged", () => {
  const hashes = {
    players: "8fb955386f8c1fd4729efe8b792f2083bc05c207e40a1bb175765f832003f56c",
    teams: "ae8d0fcb2f259f04ecea61ab8ebb25804d274b23ab54ce4322f5c384a88d738c",
    questions:
      "6444345df336d6832f4ea411d35201f15dc414d412fb27bc996f62bfcdd99887",
  };
  for (const [key, hash] of Object.entries(hashes))
    assert.equal(
      createHash("sha256").update(JSON.stringify(data[key])).digest("hex"),
      hash,
      key + " differs from handoff",
    );
});

test("35 players, 39 teams, 20 four-option questions and four roles", () => {
  assert.equal(data.players.length, 35);
  assert.equal(data.teams.length, 39);
  assert.equal(data.questions.length, 20);
  assert.equal(new Set(data.players.map((p) => p.id)).size, 35);
  assert.deepEqual(
    data.dims.map((d) => d.key),
    ["AIM", "ENTRY", "IGL", "NERVE", "FLEX", "TEAM", "GRIND", "SHOW"],
  );
  data.questions.forEach((q) => {
    assert.equal(q.options.length, 4);
    q.options.forEach((o) =>
      assert.deepEqual(Object.values(o.weights).sort(), [1, 2]),
    );
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
  const result = score(Array(20).fill(0), data);
  assert.deepEqual(result.raw, [16, 16, 2, 5, 0, 7, 8, 6]);
  assert.deepEqual(result.maxima, [24, 23, 33, 28, 29, 28, 20, 24]);
  result.pct.forEach((v, i) =>
    assert.equal(v, (100 * result.raw[i]) / result.maxima[i]),
  );
});

test("independent reference implementation agrees with all final rankings", () => {
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
    const actual = score(a, data);
    const user = data.dims.map(
      (d) =>
        (100 *
          data.questions.reduce(
            (s, q, i) => s + (q.options[a[i]].weights[d.key] || 0),
            0,
          )) /
        data.questions.reduce(
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
  ])
    assert.throws(() => score(invalid, data));
});

test("close results, partners, role confession and all displayed values stay valid", () => {
  let blendFound = false;
  for (let n = 0; n < 1000; n++) {
    const a = Array.from({ length: 20 }, (_, i) => (n >>> ((i % 8) * 2)) % 4),
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
