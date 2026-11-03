// Reproducible random sample; reports acceptance conflicts without changing scores.
const data = require("../data.js"),
  { score } = require("../app.js");
let seed = 20261103;
function random() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}
const counts = Object.fromEntries(data.players.map((p) => [p.name, 0]));
const oldTotals = Array(8).fill(0),
  newTotals = Array(8).fill(0);
for (let i = 0; i < 1000; i++) {
  const a = Array.from({ length: data.questions.length }, () =>
    Math.floor(random() * 4),
  );
  const next = score(a, data),
    old = score(a.slice(0, 20), data, 1);
  counts[next.top.player.name]++;
  for (let d = 0; d < 8; d++) {
    oldTotals[d] += old.pct[d];
    newTotals[d] += next.pct[d];
  }
}
const coverage = Object.values(counts).filter(Boolean).length,
  peak = Math.max(...Object.values(counts)) / 10;
console.log(
  JSON.stringify(
    {
      sample: 1000,
      seed: 20261103,
      coverage,
      total: data.players.length,
      peakPercent: peak,
      coverageTarget: 30,
      peakTargetPercent: 15,
      passesDistributionGoal: coverage >= 30 && peak <= 15,
      scoringVersion: 2,
      meanScores: Object.fromEntries(
        data.dims.map((d, i) => [
          d.key,
          {
            before: Math.round(oldTotals[i] / 10) / 100,
            after: Math.round(newTotals[i] / 10) / 100,
          },
        ]),
      ),
      counts,
    },
    null,
    2,
  ),
);
