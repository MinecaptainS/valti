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
for (let i = 0; i < 1000; i++) {
  const a = Array.from({ length: 20 }, () => Math.floor(random() * 4));
  counts[score(a, data).top.player.name]++;
}
const coverage = Object.values(counts).filter(Boolean).length,
  peak = Math.max(...Object.values(counts)) / 10;
console.log(
  JSON.stringify(
    {
      sample: 1000,
      seed: 20261103,
      coverage,
      total: 35,
      peakPercent: peak,
      coverageTarget: 30,
      peakTargetPercent: 15,
      passesDistributionGoal: coverage >= 30 && peak <= 15,
      counts,
    },
    null,
    2,
  ),
);
