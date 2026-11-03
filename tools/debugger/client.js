"use strict";
const $ = (s) => document.querySelector(s);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const roles = ["决斗", "控场", "道具", "自由人"];
const csrf = $('meta[name="csrf-token"]').content;
let data = null,
  sourceData = null,
  baseRevision = "",
  draftRevision = "",
  tab = "questions",
  selected = { questions: 0, players: 0, teams: 0 },
  search = "",
  dirty = false,
  edits = 0,
  saving = null,
  saveTimer = null,
  toastTimer = null,
  analysis = null,
  answers = [];
async function api(route, body) {
  const response = await fetch(
    "/api/" + route,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-VALTI-CSRF": csrf },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "操作失败");
    error.details = result.errors || [];
    throw error;
  }
  return result;
}
function errors(error) {
  const box = $("#errors");
  box.hidden = !error;
  box.textContent = error
    ? [error.message, ...(error.details || [])].join("\n")
    : "";
}
function toast(text) {
  clearTimeout(toastTimer);
  $("#toast").textContent = text;
  toastTimer = setTimeout(() => ($("#toast").textContent = ""), 4500);
}
function status(text) {
  $("#save-state").textContent = text;
}
async function lockControls(task) {
  const controls = [
    ...document.querySelectorAll("button,input,select,textarea"),
  ].map((element) => ({ element, disabled: element.disabled }));
  controls.forEach(({ element }) => {
    element.disabled = true;
  });
  try {
    return await task();
  } finally {
    controls.forEach(({ element, disabled }) => {
      element.disabled = disabled;
    });
  }
}
function summary() {
  if (data)
    $("#summary").innerHTML =
      `<span><strong>${data.questions.length}</strong>道题</span><span><strong>${data.players.length}</strong>位选手</span><span><strong>${data.teams.length}</strong>支队伍</span>`;
}
function changed() {
  dirty = true;
  edits++;
  analysis = null;
  status("尚未保存 · 正在等待自动保存");
  summary();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDraft().catch(() => {}), 800);
}
async function saveDraft() {
  clearTimeout(saveTimer);
  if (saving) {
    await saving;
    if (dirty) return saveDraft();
    return;
  }
  if (!dirty) return;
  const generation = edits,
    payload = structuredClone(data);
  status("正在保存本机草稿…");
  saving = api("draft", { data: payload, expectedRevision: draftRevision });
  try {
    const result = await saving;
    draftRevision = result.draftRevision;
    if (edits === generation) dirty = false;
    errors(null);
    status(
      dirty
        ? "还有新修改，稍后继续保存"
        : "草稿已保存到本机 · " +
            new Date(result.savedAt).toLocaleTimeString("zh-CN", {
              hour12: false,
            }),
    );
  } catch (error) {
    status("未保存 · 请修正错误或重新载入");
    errors(error);
    throw error;
  } finally {
    saving = null;
  }
  if (dirty) return saveDraft();
}
async function load() {
  const result = await api("workspace");
  data = result.data;
  sourceData = result.sourceData;
  baseRevision = result.baseRevision;
  draftRevision = result.draftRevision;
  dirty = false;
  analysis = null;
  answers = data.questions.map(() => 0);
  summary();
  render();
  status(result.hasDraft ? "已载入本机草稿" : "已载入当前 data.js");
  if (result.warning || result.sourceChanged)
    errors(
      new Error(
        result.warning ||
          (result.sourceChanged
            ? "data.js 在保存草稿后有变化；写入前请确认要使用当前草稿。"
            : ""),
      ),
    );
  else errors(null);
}
const uid = (prefix) =>
  prefix +
  "_" +
  Date.now().toString(36) +
  "_" +
  Math.random().toString(36).slice(2, 7);
function field(
  label,
  key,
  value,
  {
    type = "text",
    scope = tab,
    option,
    dim,
    readonly = false,
    min,
    max,
    step,
  } = {},
) {
  const attrs = `data-scope="${scope}" data-key="${key}"${option !== undefined ? ` data-option="${option}"` : ""}${dim !== undefined ? ` data-dim="${dim}"` : ""}`;
  return `<label>${esc(label)}<input ${attrs} type="${type}" value="${esc(value)}" ${readonly ? "readonly" : ""}${min !== undefined ? ` min="${min}"` : ""}${max !== undefined ? ` max="${max}"` : ""}${step !== undefined ? ` step="${step}"` : ""}></label>`;
}
function selectField(label, key, value, options, { scope = tab, option } = {}) {
  return `<label>${esc(label)}<select data-scope="${scope}" data-key="${key}"${option !== undefined ? ` data-option="${option}"` : ""}>${options.map(([v, text]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
}
function textarea(label, key, value, { scope = tab, option } = {}) {
  return `<label>${esc(label)}<textarea data-scope="${scope}" data-key="${key}"${option !== undefined ? ` data-option="${option}"` : ""}>${esc(value)}</textarea></label>`;
}
function radar(player) {
  const points = player.v
    .map((v, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 4,
        n = Number.isFinite(v) ? v : 0;
      return `${140 + (Math.cos(a) * 95 * n) / 10},${140 + (Math.sin(a) * 95 * n) / 10}`;
    })
    .join(" ");
  return `<svg class="mini-radar" viewBox="0 0 280 280" role="img" aria-label="选手八维预览">${[0.25, 0.5, 0.75, 1].map((r) => `<polygon fill="none" stroke="#344552" points="${player.v.map((_, i) => `${140 + Math.cos(-Math.PI / 2 + (i * Math.PI) / 4) * 95 * r},${140 + Math.sin(-Math.PI / 2 + (i * Math.PI) / 4) * 95 * r}`).join(" ")}"/>`).join("")}<polygon fill="#ff465530" stroke="#ff4655" stroke-width="2" points="${points}"/>${data.dims.map((d, i) => `<text x="${140 + Math.cos(-Math.PI / 2 + (i * Math.PI) / 4) * 123}" y="${144 + Math.sin(-Math.PI / 2 + (i * Math.PI) / 4) * 123}" text-anchor="middle" fill="#8b9db0" font-size="10">${esc(d.label)}</text>`).join("")}</svg>`;
}
function sidebar() {
  const items = data[tab],
    needle = search.toLowerCase();
  return `<aside class="panel list-panel"><input id="search" aria-label="搜索列表" placeholder="搜索${tab === "questions" ? "题目" : tab === "players" ? "选手" : "队伍"}" value="${esc(search)}"><div class="list-actions"><button data-action="add">＋ 新增${tab === "questions" ? "普通题" : tab === "players" ? "选手" : "队伍"}</button>${tab === "questions" ? '<button data-action="add-aim">＋ 枪法题</button>' : ""}</div><div class="item-list">${
    items
      .map((item, i) => ({ item, i }))
      .filter(
        ({ item }) =>
          (item.name || item.text || "").toLowerCase().includes(needle) ||
          item.id.toLowerCase().includes(needle),
      )
      .map(
        ({ item, i }) =>
          `<button class="item ${selected[tab] === i ? "active" : ""}" data-select="${i}"><strong>${esc(tab === "questions" ? `${i + 1}. ${item.text}` : item.name)}</strong><small>${esc(tab === "questions" ? (item.kind === "aim" ? "枪法专项" : "普通题") + " · " + item.id : tab === "players" ? item.role + (item.igl ? " · 指挥" : "") : item.abbr)}</small></button>`,
      )
      .join("") || '<p class="empty">没有匹配项</p>'
  }</div></aside>`;
}
function questionEditor() {
  const q = data.questions[selected.questions],
    index = selected.questions;
  return `<section class="panel"><div class="edit-head"><h2>第 ${index + 1} 题</h2><div class="actions"><button data-action="up" ${index < 2 ? "disabled" : ""}>↑ 上移</button><button data-action="down" ${index === 0 || index === data.questions.length - 1 ? "disabled" : ""}>↓ 下移</button><button class="danger" data-action="delete" ${index === 0 ? "disabled" : ""}>删除</button></div></div><div class="grid">${field("题目 ID（保持不变，方便记录对应）", "id", q.id, { readonly: true })}${selectField(
    "题目类型",
    "kind",
    q.kind === "aim" ? "aim" : "style",
    [
      ["style", "普通题"],
      ["aim", "枪法专项"],
    ],
    {},
  )}<div class="full">${textarea("题干", "text", q.text)}</div><div class="full">${textarea("题目提示（可留空）", "hint", q.hint || "")}</div>${q.kind === "aim" ? field("此题在枪法专项内的相对权重", "aimWeight", q.aimWeight, { type: "number", min: 0.01, max: 100, step: 0.1 }) : ""}</div><p class="hint">${index === 0 ? "Q1 保留在第一题；四个选项分别对应四种位置。" : q.kind === "aim" ? "枪法专项只影响 AIM；每个选项直接填写 0–100 分。" : "普通题按选项为各维度加分，未填写的维度按 0 计算。"}</p>${q.options
    .map(
      (o, i) =>
        `<div class="option-card"><h3>选项 ${"ABCD"[i]}</h3>${textarea("选项文字", "text", o.text, { option: i })}${
          index === 0
            ? selectField(
                "对应位置",
                "role",
                o.role,
                roles.map((r) => [r, r]),
                { option: i },
              )
            : ""
        }<div class="weights ${q.kind === "aim" ? "aim" : ""}">${(q.kind === "aim" ? data.dims.slice(0, 1) : data.dims).map((d) => field(d.label + " / " + d.key, "weight", o.weights[d.key] || 0, { type: "number", option: i, dim: d.key, min: 0, max: q.kind === "aim" ? 100 : 20, step: 0.1 })).join("")}</div></div>`,
    )
    .join("")}</section>`;
}
function playerEditor() {
  const p = data.players[selected.players];
  return `<section class="panel"><div class="edit-head"><h2>${esc(p.name)}</h2><button class="danger" data-action="delete">删除选手</button></div><div class="grid">${field("选手名称", "name", p.name)}${field("选手 ID", "id", p.id, { readonly: true })}${selectField(
    "主位置",
    "role",
    p.role,
    roles.map((r) => [r, r]),
  )}${selectField("副位置", "sub", p.sub, [["", "无"], ...roles.map((r) => [r, r])])}${selectField("所属队伍", "team", p.team, [["", "未指定队伍"], ...data.teams.map((t) => [t.id, t.name])])}<label class="check"><input type="checkbox" data-scope="players" data-key="igl" ${p.igl ? "checked" : ""}>指挥标签</label><div class="full">${field("代表英雄", "heroes", p.heroes)}</div><div class="full">${textarea("你的原始描述（主卡和分享图均展示，最多 120 字）", "note", p.note)}</div></div><h3 style="margin-top:24px">八维参考值 · 0–10</h3><div class="weights">${data.dims.map((d, i) => field(d.label, "vector", p.v[i], { type: "number", dim: i, min: 0, max: 10, step: 0.5 })).join("")}</div><div id="player-radar">${radar(p)}</div><p class="vector-note">图中数值为选手参考值，答题结果会自动与之比较。</p></section>`;
}
function teamEditor() {
  const t = data.teams[selected.teams];
  return `<section class="panel"><div class="edit-head"><h2>${esc(t.name)}</h2><button class="danger" data-action="delete">删除队伍</button></div><div class="grid">${field("队伍名称", "name", t.name)}${field("队伍 ID", "id", t.id, { readonly: true })}${field("队徽缩写（最多 4 字符）", "abbr", t.abbr)}${field("队伍颜色", "color", t.color, { type: "color" })}</div><p class="hint">队徽使用颜色与缩写绘制；无需外部 Logo。删除前先修改仍属于该队伍的选手。</p></section>`;
}
function scoringEditor() {
  return `<section class="panel"><h2>分数配比</h2><p class="hint">这里调整风格指数与枪法专项的贡献。具体选项加分在“题目与权重”里修改。</p><div class="grid three">${field("基础风格分（0–80）", "styleFloor", data.scoring.styleFloor, { scope: "scoring", type: "number", min: 0, max: 80, step: 1 })}${field("抬分曲线指数（0.1–3）", "styleExponent", data.scoring.styleExponent, { scope: "scoring", type: "number", min: 0.1, max: 3, step: 0.05 })}${field("枪法专项占比（%）", "aimSpecialWeight", data.scoring.aimSpecialWeight * 100, { scope: "scoring", type: "number", min: 0, max: 100, step: 1 })}</div><p class="hint">当前基础风格指数 = ${esc(data.scoring.styleFloor)} + ${esc(100 - data.scoring.styleFloor)} ×（原始归一化值 / 100）^ ${esc(data.scoring.styleExponent)}。指数越小，中低分抬升越明显。枪法专项内部按各题“相对权重”再分配。</p><div class="table-scroll"><table><thead><tr><th>枪法专项</th><th>相对权重</th><th>内部占比</th></tr></thead><tbody>${data.questions
    .filter((q) => q.kind === "aim")
    .map(
      (q) =>
        `<tr><td>${esc(q.text)}</td><td>${esc(q.aimWeight)}</td><td>${((100 * q.aimWeight) / data.questions.filter((q) => q.kind === "aim").reduce((s, x) => s + x.aimWeight, 0)).toFixed(1)}%</td></tr>`,
    )
    .join("")}</tbody></table></div></section>`;
}
function analysisEditor() {
  if (answers.length !== data.questions.length)
    answers = data.questions.map(() => 0);
  let result = "";
  if (analysis?.result) {
    const r = analysis.result;
    result = `<section class="panel" style="margin-top:18px"><h2>${esc(r.name)} · ${r.similarity}%</h2><p>${r.blend ? `${r.share}% ${esc(r.name)} + ${100 - r.share}% ${esc(r.second)}` : "当前答卷的最相似选手"}</p><div class="stats">${data.dims.map((d, i) => `<div class="stat"><strong>${Math.round(r.pct[i])}</strong><small>${esc(d.label)}</small></div>`).join("")}</div><table><thead><tr><th>前五名</th><th>相似度</th><th>位置修正后分数</th></tr></thead><tbody>${r.ranked.map((p) => `<tr><td>${esc(p.name)}</td><td>${(p.similarity * 100).toFixed(1)}%</td><td>${p.score.toFixed(4)}</td></tr>`).join("")}</tbody></table></section>`;
  }
  if (analysis?.counts)
    result = `<section class="panel" style="margin-top:18px"><h2>随机分布结果</h2><div class="stats"><div class="stat"><strong>${analysis.coverage}/${analysis.total}</strong><small>命中选手数</small></div><div class="stat"><strong>${analysis.peakPercent.toFixed(1)}%</strong><small>最高单人占比</small></div><div class="stat"><strong>${analysis.sampleCount}</strong><small>随机答卷数</small></div><div class="stat"><strong>${(analysis.means.reduce((s, n) => s + n, 0) / 8).toFixed(1)}</strong><small>八维平均分</small></div></div><p class="hint">${data.dims.map((d, i) => `${esc(d.label)} ${analysis.means[i].toFixed(1)}`).join(" · ")}</p><div class="table-scroll"><table><thead><tr><th>选手</th><th>命中次数</th><th>占比</th><th>分布</th></tr></thead><tbody>${analysis.counts.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.count}</td><td>${p.percent.toFixed(1)}%</td><td><div class="bar"><span style="width:${Math.min(100, p.percent * 5)}%"></span></div></td></tr>`).join("")}</tbody></table></div></section>`;
  return `<section class="panel"><h2>随机答卷分布</h2><p class="hint">固定种子 20261103，便于比较改动前后。结果是模拟样本，不代表真实用户分布。</p><div class="grid">${field("样本数量（100–2000）", "sampleCount", 1000, { scope: "analysis", type: "number", min: 100, max: 2000, step: 100 })}<div style="align-self:end"><button class="primary" data-action="distribution">运行分布检查</button></div></div></section><section class="panel" style="margin-top:18px"><h2>手动试算一份答卷</h2><div class="answer-grid">${data.questions.map((q, i) => `<label>${i + 1}. ${esc(q.text)}<select data-answer="${i}">${q.options.map((o, j) => `<option value="${j}" ${answers[i] === j ? "selected" : ""}>${"ABCD"[j]} · ${esc(o.text)}</option>`).join("")}</select></label>`).join("")}</div><button class="primary" data-action="calculate">计算这份答卷</button></section>${result}`;
}
function render() {
  if (!data) return;
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  if (["questions", "players", "teams"].includes(tab)) {
    selected[tab] = Math.min(Math.max(0, selected[tab]), data[tab].length - 1);
    $("#workspace").innerHTML =
      `<div class="split">${sidebar()}${tab === "questions" ? questionEditor() : tab === "players" ? playerEditor() : teamEditor()}</div>`;
  } else
    $("#workspace").innerHTML =
      tab === "scoring" ? scoringEditor() : analysisEditor();
}
function edit(target) {
  const scope = target.dataset.scope,
    key = target.dataset.key;
  if (!scope || scope === "analysis") return;
  let value =
    target.type === "checkbox"
      ? target.checked
      : target.type === "number"
        ? Number(target.value)
        : target.value;
  if (scope === "scoring")
    data.scoring[key] = key === "aimSpecialWeight" ? value / 100 : value;
  else {
    const item = data[scope][selected[scope]],
      option = target.dataset.option;
    if (option !== undefined) {
      const o = item.options[Number(option)];
      if (key === "weight") {
        if (value === 0 && item.kind !== "aim")
          delete o.weights[target.dataset.dim];
        else o.weights[target.dataset.dim] = value;
      } else o[key] = value;
    } else if (key === "vector") item.v[Number(target.dataset.dim)] = value;
    else item[key] = value;
    if (key === "kind") {
      if (selected.questions === 0 && value === "aim") {
        item.kind = "style";
        toast("Q1 必须保留为位置题");
        render();
        return;
      }
      if (value === "aim") {
        item.aimWeight ||= 1;
        item.options.forEach((o) => {
          o.weights = { AIM: Math.min(100, o.weights.AIM || 0) };
        });
      } else {
        delete item.aimWeight;
        item.options.forEach((o) => {
          for (const dim of Object.keys(o.weights))
            o.weights[dim] = Math.min(20, o.weights[dim]);
        });
      }
      render();
    }
    if (scope === "players" && key === "vector")
      $("#player-radar").innerHTML = radar(item);
  }
  changed();
}
function add(kind) {
  if (tab === "questions") {
    data.questions.push({
      id: uid("Q"),
      text: "新题目",
      ...(kind === "aim" ? { kind: "aim", aimWeight: 1 } : {}),
      options: ["选项 A", "选项 B", "选项 C", "选项 D"].map((text, i) => ({
        text,
        weights:
          kind === "aim"
            ? { AIM: [100, 75, 45, 15][i] }
            : { [data.dims[i].key]: 2 },
      })),
    });
  } else if (tab === "players")
    data.players.push({
      id: uid("p"),
      name: "新选手",
      role: "决斗",
      sub: "",
      igl: false,
      team: "",
      heroes: "待填写",
      note: "在这里填写你的选手描述。",
      v: Array(8).fill(5),
    });
  else if (tab === "teams")
    data.teams.push({
      id: uid("team"),
      name: "新队伍",
      abbr: "NEW",
      color: "#4a9eff",
      logo: "",
    });
  selected[tab] = data[tab].length - 1;
  search = "";
  changed();
  render();
}
function remove() {
  const index = selected[tab],
    item = data[tab][index];
  if (
    tab === "questions" &&
    (index === 0 ||
      (item.kind === "aim" &&
        data.questions.filter((q) => q.kind === "aim").length === 1))
  ) {
    toast("保留 Q1 和至少一道枪法专项");
    return;
  }
  if (
    tab === "players" &&
    data.players.filter((p) => p.role === item.role).length === 1
  ) {
    toast("每种主位置至少保留一位选手");
    return;
  }
  if (tab === "teams" && data.players.some((p) => p.team === item.id)) {
    toast("该队伍仍有选手，请先修改选手归属");
    return;
  }
  if (!confirm("删除“" + (item.name || item.text) + "”？")) return;
  data[tab].splice(index, 1);
  selected[tab] = Math.max(0, index - 1);
  changed();
  render();
}
async function action(name) {
  if (!data) return;
  switch (name) {
    case "save":
      await saveDraft();
      toast("本机草稿已保存");
      break;
    case "restore":
      if (
        !confirm(
          "用已写入 data.js 的数据替换当前草稿？尚未写入的编辑将被放弃。",
        )
      )
        return;
      clearTimeout(saveTimer);
      if (saving) await saving;
      data = structuredClone(sourceData);
      selected = { questions: 0, players: 0, teams: 0 };
      changed();
      render();
      await saveDraft();
      toast("已载入已写入的数据");
      break;
    case "reload":
      if (dirty && !confirm("重新载入将放弃尚未保存的输入，继续吗？")) return;
      clearTimeout(saveTimer);
      if (saving) await saving.catch(() => {});
      await load();
      break;
    case "add":
      add("style");
      break;
    case "add-aim":
      add("aim");
      break;
    case "delete":
      remove();
      break;
    case "up":
    case "down": {
      const i = selected.questions,
        j = i + (name === "up" ? -1 : 1);
      if (tab !== "questions" || i === 0 || j < 1 || j >= data.questions.length)
        return;
      [data.questions[i], data.questions[j]] = [
        data.questions[j],
        data.questions[i],
      ];
      selected.questions = j;
      changed();
      render();
      break;
    }
    case "export": {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download =
        "valti-draft-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      break;
    }
    case "import":
      $("#import-file").click();
      break;
    case "preview": {
      await saveDraft();
      const result = await api("preview", { data });
      window.open(result.url, "valti-debug-preview", "noopener");
      toast("已生成本机预览");
      break;
    }
    case "apply": {
      if (!confirm("将备份并更新本机 data.js。此操作不会推送 GitHub。继续吗？"))
        return;
      await lockControls(async () => {
        await saveDraft();
        const result = await api("apply", {
          data,
          expectedBaseRevision: baseRevision,
          expectedRevision: draftRevision,
        });
        data = result.data;
        sourceData = structuredClone(result.data);
        baseRevision = result.baseRevision;
        draftRevision = result.draftRevision;
        dirty = false;
        status("已写入本机 data.js · 备份在 " + result.backup);
        toast("本地数据已更新，尚未推送 GitHub");
        render();
      });
      break;
    }
    case "distribution": {
      await saveDraft();
      const count = Number($('[data-key="sampleCount"]').value);
      status("正在计算随机答卷…");
      analysis = await api("analyze", {
        data,
        sampleCount: count,
        seed: 20261103,
      });
      render();
      status("随机分布检查完成 · 草稿已保存");
      break;
    }
    case "calculate":
      await saveDraft();
      analysis = await api("analyze", { data, answers });
      render();
      break;
  }
}
document.addEventListener("input", (event) => {
  if (event.target.id === "search") {
    search = event.target.value;
    const start = event.target.selectionStart;
    const node = $(".item-list");
    const holder = document.createElement("div");
    holder.innerHTML = sidebar();
    node.replaceWith(holder.querySelector(".item-list"));
    event.target.setSelectionRange(start, start);
    return;
  }
  if (event.target.dataset.answer !== undefined) {
    answers[Number(event.target.dataset.answer)] = Number(event.target.value);
    return;
  }
  edit(event.target);
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  if (button.dataset.tab) {
    tab = button.dataset.tab;
    search = "";
    render();
    return;
  }
  if (button.dataset.select !== undefined) {
    selected[tab] = Number(button.dataset.select);
    render();
    return;
  }
  if (button.dataset.action)
    action(button.dataset.action).catch((error) => {
      errors(error);
      toast(error.message);
    });
});
$("#import-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error("JSON 文件不能超过 2 MB");
    const imported = JSON.parse(await file.text());
    if (
      !confirm(
        "导入会替换当前本机草稿。需要保留现有修改时，请先取消并导出 JSON。继续吗？",
      )
    )
      return;
    clearTimeout(saveTimer);
    if (saving) await saving;
    const result = await api("draft", {
      data: imported,
      expectedRevision: draftRevision,
    });
    data = imported;
    draftRevision = result.draftRevision;
    dirty = false;
    analysis = null;
    selected = { questions: 0, players: 0, teams: 0 };
    answers = [];
    summary();
    render();
    errors(null);
    status("JSON 已导入并保存为本机草稿");
    toast("导入完成，尚未写入 data.js");
  } catch (error) {
    errors(error);
    toast(error.message);
  } finally {
    event.target.value = "";
  }
});
window.addEventListener("beforeunload", (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
load().catch((error) => {
  errors(error);
  status("载入失败");
});
