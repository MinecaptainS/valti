"use strict";
const crypto = require("node:crypto");
const DIMS = ["AIM", "ENTRY", "IGL", "NERVE", "FLEX", "TEAM", "GRIND", "SHOW"];
const ROLES = ["决斗", "控场", "道具", "自由人"];
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const number = (value, min, max) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
const short = (value, max) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  [...value].length <= max;
function validateData(data) {
  const errors = [];
  const issue = (path, message) => errors.push(`${path}：${message}`);
  if (!object(data)) return ["数据必须是 JSON 对象"];
  if (
    !Array.isArray(data.dims) ||
    data.dims.length !== 8 ||
    data.dims.some(
      (d, i) => !object(d) || d.key !== DIMS[i] || !short(d.label, 12),
    )
  )
    issue("dims", "必须保留八个固定维度及顺序");
  const ids = (items, path) => {
    const seen = new Set();
    for (const [i, item] of items.entries()) {
      if (
        !object(item) ||
        !short(item.id, 64) ||
        !/^[A-Za-z0-9_-]+$/.test(item.id)
      )
        issue(`${path}[${i}].id`, "使用 1–64 位字母、数字、下划线或短横线");
      else if (seen.has(item.id)) issue(`${path}[${i}].id`, "ID 重复");
      else seen.add(item.id);
    }
    return seen;
  };
  const teams = Array.isArray(data.teams) ? data.teams : [];
  if (!teams.length || teams.length > 200) issue("teams", "需要 1–200 支队伍");
  const teamIds = ids(teams, "teams");
  teams.forEach((t, i) => {
    if (!object(t)) return;
    if (!short(t.name, 80)) issue(`teams[${i}].name`, "填写 1–80 字队伍名称");
    if (!short(t.abbr, 4)) issue(`teams[${i}].abbr`, "缩写需要 1–4 个字符");
    if (typeof t.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(t.color))
      issue(`teams[${i}].color`, "使用六位十六进制颜色");
    if (t.logo !== "" && typeof t.logo !== "string")
      issue(`teams[${i}].logo`, "logo 应为空字符串或文字链接");
  });
  const players = Array.isArray(data.players) ? data.players : [];
  if (players.length < 4 || players.length > 500)
    issue("players", "需要 4–500 位选手");
  ids(players, "players");
  players.forEach((p, i) => {
    if (!object(p)) return;
    if (!short(p.name, 32)) issue(`players[${i}].name`, "填写 1–32 字名称");
    if (!ROLES.includes(p.role))
      issue(`players[${i}].role`, "选择四种主位置之一");
    if (p.sub !== "" && !ROLES.includes(p.sub))
      issue(`players[${i}].sub`, "副位置应为空或四种位置之一");
    if (typeof p.igl !== "boolean")
      issue(`players[${i}].igl`, "指挥标签必须为布尔值");
    if (p.team !== "" && !teamIds.has(p.team))
      issue(`players[${i}].team`, "队伍 ID 不存在");
    if (!short(p.heroes, 120))
      issue(`players[${i}].heroes`, "填写 1–120 字代表英雄");
    if (!short(p.note, 120))
      issue(`players[${i}].note`, "填写 1–120 字原始描述");
    if (
      !Array.isArray(p.v) ||
      p.v.length !== 8 ||
      p.v.some((v) => !number(v, 0, 10))
    )
      issue(`players[${i}].v`, "八维值必须在 0–10 之间");
  });
  ROLES.forEach((role) => {
    if (!players.some((p) => object(p) && p.role === role))
      issue("players", `${role}至少保留一位选手`);
  });
  const questions = Array.isArray(data.questions) ? data.questions : [];
  if (questions.length < 2 || questions.length > 100)
    issue("questions", "需要 2–100 道题");
  ids(questions, "questions");
  questions.forEach((q, i) => {
    if (!object(q)) return;
    if (!short(q.text, 240)) issue(`questions[${i}].text`, "填写 1–240 字题干");
    if (
      q.hint !== undefined &&
      (typeof q.hint !== "string" || q.hint.length > 500)
    )
      issue(`questions[${i}].hint`, "提示不得超过 500 字");
    if (q.kind !== undefined && !["style", "aim"].includes(q.kind))
      issue(`questions[${i}].kind`, "类型应为 style 或 aim");
    if (q.kind === "aim" && !number(q.aimWeight, 0.01, 100))
      issue(`questions[${i}].aimWeight`, "专项权重必须在 0.01–100 之间");
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      issue(`questions[${i}].options`, "每题必须有四个选项");
      return;
    }
    q.options.forEach((o, j) => {
      if (!object(o)) {
        issue(`questions[${i}].options[${j}]`, "选项必须为对象");
        return;
      }
      if (!short(o.text, 300))
        issue(`questions[${i}].options[${j}].text`, "填写 1–300 字选项");
      if (!object(o.weights)) {
        issue(`questions[${i}].options[${j}].weights`, "权重必须为对象");
        return;
      }
      for (const [key, value] of Object.entries(o.weights)) {
        if (
          !DIMS.includes(key) ||
          !number(value, 0, q.kind === "aim" ? 100 : 20)
        )
          issue(
            `questions[${i}].options[${j}].weights`,
            "普通题各项 0–20，枪法专项 0–100，且不能有未知维度",
          );
        if (q.kind === "aim" && key !== "AIM")
          issue(
            `questions[${i}].options[${j}].weights`,
            "枪法专项只能影响 AIM",
          );
      }
      if (q.kind === "aim" && !number(o.weights.AIM, 0, 100))
        issue(
          `questions[${i}].options[${j}].weights.AIM`,
          "枪法专项需要 AIM 分值",
        );
    });
  });
  const first = questions[0];
  if (
    !object(first) ||
    first.id !== "Q1" ||
    first.kind === "aim" ||
    !Array.isArray(first.options) ||
    first.options.length !== 4 ||
    new Set(first.options.map((o) => o?.role)).size !== 4 ||
    first.options.some((o) => !ROLES.includes(o?.role))
  )
    issue("questions[0]", "第一题必须是 Q1，并为四个选项分别指定四种位置");
  if (!questions.some((q) => object(q) && q.kind === "aim"))
    issue("questions", "至少保留一道枪法专项");
  if (!object(data.scoring) || data.scoring.version !== 2)
    issue("scoring.version", "需要新版计分配置 version: 2");
  else {
    if (!number(data.scoring.styleFloor, 0, 80))
      issue("scoring.styleFloor", "基础分需要在 0–80 之间");
    if (!number(data.scoring.styleExponent, 0.1, 3))
      issue("scoring.styleExponent", "抬分指数需要在 0.1–3 之间");
    if (!number(data.scoring.aimSpecialWeight, 0, 1))
      issue("scoring.aimSpecialWeight", "专项占比需要在 0–1 之间");
  }
  return errors.slice(0, 100);
}
function revision(data) {
  const copy = JSON.parse(JSON.stringify(data));
  delete copy.datasetRevision;
  return crypto.createHash("sha256").update(JSON.stringify(copy)).digest("hex");
}
function versioned(data) {
  return { ...data, datasetRevision: revision(data).slice(0, 20) };
}
function serialize(data) {
  return (
    "/* Generated by the local VALTI debugger. */\nconst DATA = " +
    JSON.stringify(data, null, 2) +
    ';\nif (typeof module !== "undefined") module.exports = DATA;\n'
  );
}
function analyze(
  data,
  engine,
  { answers, sampleCount = 1000, seed = 20261103 } = {},
) {
  const errors = validateData(data);
  if (errors.length) return { errors };
  if (answers !== undefined) {
    if (!engine.validAnswers(answers, data))
      return { errors: ["答卷长度或选项无效"] };
    const r = engine.score(answers, data);
    return {
      errors: [],
      result: {
        name: r.top.player.name,
        playerId: r.top.player.id,
        similarity: r.similarity,
        pct: r.pct,
        rawPct: r.rawPct,
        mechanicalAim: r.mechanicalAim,
        blend: r.blend,
        second: r.second.player.name,
        share: r.share,
        ranked: r.ranked
          .slice(0, 5)
          .map((x) => ({
            name: x.player.name,
            score: x.final,
            similarity: x.sim,
          })),
      },
    };
  }
  if (!Number.isInteger(sampleCount) || sampleCount < 100 || sampleCount > 2000)
    return { errors: ["随机样本数需要在 100–2000 之间"] };
  let state = Number(seed) >>> 0 || 20261103;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const counts = Object.fromEntries(data.players.map((p) => [p.id, 0])),
    totals = Array(8).fill(0);
  for (let i = 0; i < sampleCount; i++) {
    const a = data.questions.map(() => Math.floor(random() * 4)),
      r = engine.score(a, data);
    counts[r.top.player.id]++;
    r.pct.forEach((v, d) => (totals[d] += v));
  }
  return {
    errors: [],
    sampleCount,
    coverage: Object.values(counts).filter(Boolean).length,
    total: data.players.length,
    peakPercent: (100 * Math.max(...Object.values(counts))) / sampleCount,
    means: totals.map((n) => n / sampleCount),
    counts: data.players
      .map((p) => ({
        id: p.id,
        name: p.name,
        count: counts[p.id],
        percent: (100 * counts[p.id]) / sampleCount,
      }))
      .sort((a, b) => b.count - a.count),
  };
}
module.exports = {
  DIMS,
  ROLES,
  validateData,
  revision,
  versioned,
  serialize,
  analyze,
};
