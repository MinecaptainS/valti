/* No network requests, dependencies, or official logo assets. */
"use strict";
const WEIGHTS = [0.9, 1, 1, 1.1, 1, 0.9, 0.8, 1];
const center = (v) => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return v.map((x) => x - m);
};
function cosine(u, p, w = WEIGHTS) {
  const dot = u.reduce((s, x, i) => s + w[i] * x * p[i], 0);
  const norm = Math.sqrt(
    u.reduce((s, x, i) => s + w[i] * x * x, 0) *
      p.reduce((s, x, i) => s + w[i] * x * x, 0),
  );
  return norm ? Math.max(-1, Math.min(1, dot / norm)) : 0;
}
function maxScores(data) {
  return data.dims.map((d) =>
    data.questions.reduce(
      (sum, q) =>
        sum + Math.max(...q.options.map((o) => o.weights[d.key] || 0)),
      0,
    ),
  );
}
function validAnswers(a, data) {
  return (
    Array.isArray(a) &&
    a.length === data.questions.length &&
    Array.from(a).every((n) => Number.isInteger(n) && n >= 0 && n < 4)
  );
}
function score(answers, data) {
  if (!validAnswers(answers, data)) throw new Error("请完成全部 20 道题。");
  const raw = data.dims.map((d) =>
    data.questions.reduce(
      (s, q, i) => s + (q.options[answers[i]].weights[d.key] || 0),
      0,
    ),
  );
  const maxima = maxScores(data),
    pct = raw.map((n, i) => (maxima[i] ? (100 * n) / maxima[i] : 0)),
    u = center(pct);
  const role = data.questions[0].options[answers[0]].role;
  const ranked = data.players
    .map((player) => {
      const sim = cosine(u, center(player.v.map((x) => x * 10)));
      return {
        player,
        sim,
        final:
          sim * (player.role === role ? 1.08 : player.sub === role ? 1.03 : 1),
      };
    })
    .sort(
      (a, b) => b.final - a.final || a.player.id.localeCompare(b.player.id),
    );
  const top = ranked[0],
    second = ranked[1],
    blend = top.final - second.final < 0.02;
  // A close result uses a softmax of the two final scores. Equal scores split 50/50.
  const share = Math.round(
    100 / (1 + Math.exp((second.final - top.final) * 30)),
  );
  const complement = data.players
    .filter((p) => p.id !== top.player.id)
    .map((player) => ({
      player,
      value: cosine(u, center(player.v.map((x) => x * 10))),
    }))
    .sort(
      (a, b) => a.value - b.value || a.player.id.localeCompare(b.player.id),
    )[0].player;
  const sameRole = ranked.filter((x) => x.player.role === role);
  return {
    raw,
    maxima,
    pct,
    role,
    ranked,
    top,
    second,
    blend,
    share,
    similarity: Math.round(Math.max(0, Math.min(1, top.sim)) * 100),
    complement,
    roleBest: sameRole[0].player,
    roleLeast: sameRole.at(-1).player,
  };
}
function radarPoints(values, cx = 180, cy = 172, r = 112) {
  return values.map((v, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    return [
      cx + (Math.cos(a) * r * Math.max(0, Math.min(100, v))) / 100,
      cy + (Math.sin(a) * r * Math.max(0, Math.min(100, v))) / 100,
    ];
  });
}
if (typeof module !== "undefined")
  module.exports = {
    center,
    cosine,
    maxScores,
    validAnswers,
    score,
    radarPoints,
    WEIGHTS,
  };

if (typeof document !== "undefined") {
  const $ = (s) => document.querySelector(s),
    esc = (s) =>
      String(s).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const KEY = "valti.v1",
    roles = ["决斗", "控场", "道具", "自由人"];
  const traits = [
    "准星强迫症",
    "先手破局",
    "大局调度",
    "残局冷血",
    "非常规解法",
    "队伍粘合剂",
    "训练成瘾",
    "聚光灯体质",
  ];
  const story = {
    TenZ: "你习惯用细腻准星和高难动作解决问题，操作空间越窄，你越想试一试极限。",
    aspas:
      "你不爱花力气解释，进点、找人、收下回合就是回答；独自打开缺口是你的舒适区。",
    Derke:
      "你把练习换成每一次干净利落的击杀，枪口比嘴快，重复训练是你手感的底气。",
    ZmjjKK:
      "你一进点就想把场子点燃，压迫感和嗓门一起拉满，队友很难忽视你的存在。",
    Demon1:
      "你相信自己的准星足以压住场面，关键一枪也敢接，赢下之后更想把自信说出来。",
    Jinggg:
      "你最喜欢把普通进攻打成混乱现场，贴脸、爆破、再向前一步，越乱越有发挥。",
    something:
      "你总能从对枪里找到机会，既敢打又愿意跟队友一起行动，启动之后很难停下。",
    Alfajer:
      "你换个位置也能迅速找到手感，细腻枪法和补位意识，让你成为队伍的万用答案。",
    cNed: "你愿意把回合压在关键一枪上，哪怕赛点也不回避风险，等待只是为了出手更准。",
    Boaster:
      "你脑子里装着整张地图，也装着队友的情绪；战术要赢，队伍的气势同样不能输。",
    Haodong:
      "你把节奏藏在烟墙和报点里，不一定站在镜头中央，却总在给下一次转点铺路。",
    FNS: "你喜欢先读懂对手再动手，安排、复盘、重新布置，让全队拥有比个人更大的力量。",
    C0M: "你愿意把最舒服的击杀机会留给队友，自己的价值藏在信息、道具和恰好的补枪里。",
    Ethan:
      "你愿意接住队伍里不起眼的工作，沟通和配合比个人镜头更能给你带来满足感。",
    nobody:
      "你会把队伍的混乱重新排成计划，关键时刻保持清醒，赛后也不放过需要复盘的细节。",
    CHICHOO:
      "你把耐心和重复练习变成最后的保险，沉默地架住枪线，等那个必须赢的关键对枪。",
    Chronicle:
      "你习惯把经验和多位置理解放进每个决策，风浪越大，越想用熟练的基本功稳住局面。",
    nAts: "你喜欢让地图按自己的逻辑运转，既能等机会，也会把信息组织成队伍前进的路线。",
    f0rsakeN:
      "你总想给同一张地图写出新解法，换角色、换角度、换节奏，常规答案满足不了你。",
    TKzin:
      "你想用锋利的第一枪打开局面，也享受镜头跟上来的瞬间，个人节奏往往来得很快。",
    erde: "你喜欢把灵活思路变成团队的行动，既愿意安排节奏，也不介意临时拿出新的解法。",
    Smoggy:
      "你会认真研究自己这一颗烟、这一发枪该放在哪里，细致训练让你把配合变成习惯。",
    lukxo:
      "你相信精确的一枪，也能守住等待的时间；关键机会出现时，你希望答案就在准星里。",
    Darker:
      "你喜欢用扎实对枪回应质疑，既能给队友铺路，也想在关键回合留下自己的名字。",
    Sato: "你换了环境也愿意把表现打出来，准星和自信是随身行李，关键镜头从来不想缺席。",
    Neon: "你最享受用精准又主动的对枪打开通路，反复练习之后，每一步向前都有自己的把握。",
    BabyBay:
      "你不急着抢第一步，更喜欢用耐心把局面守住，队友需要兜底的时候你愿意留下。",
    Brawk:
      "你能把不同道具和武器玩成团队的意外答案，不只找击杀，也在找队友能进场的空隙。",
    t3xture:
      "你习惯把进攻交给干净的准星和果断的第一步，训练和冷静是敢于正面碰撞的原因。",
    jawgemo:
      "你喜欢用不停训练磨出来的侵略性开路，能换打法，也愿意为那次成功进点反复打磨。",
    Meteor:
      "你能等，也能从非常规角度下手；别人看到普通枪线，你更容易看到一次偷到机会的可能。",
    WHZY: "你打得投入，也希望场面足够热闹；关键局既要敢打，又要让大家记住这一回合的声音。",
    S1mon:
      "你会优先考虑手里的信息和技能能帮到谁，愿意调度也愿意变通，队友有机会你才安心。",
    siufatBB:
      "你愿意苦练，也愿意让队友听见你的情绪；压力越大，越想把配合和气势一起拉回来。",
    happywei:
      "你把精准枪法和耐心磨成可靠的后手，习惯用训练消化压力，把侧后方留给自己。",
  };
  const roleVoice = {
    决斗: "你愿意先打开缺口，让队友跟着你的第一步进场。",
    控场: "你用烟墙和节奏给队伍安排空间，进场之前先想好退路。",
    道具: "你用信息和技能把对枪变得公平，让队友有舒服的出手机会。",
    自由人: "你守住侧后方，也等那个能改变回合的时间差。",
  };
  const flaw = {
    决斗: "但你偶尔冲得比队友的道具还快，精彩操作也可能变成一张孤独的观战席。",
    控场: "但你偶尔会想得太多，战术还没讲完，队友已经按自己的路线走远了。",
    道具: "但你偶尔太忙着照顾所有人，技能给得漂亮，自己的枪却还没来得及掏出来。",
    自由人: "但你偶尔会把耐心演成失联，等到了机会，也可能已经等没了队友。",
  };
  function profile(p) {
    return (
      story[p.name] +
      "你把擅长的方式带进每一个关键回合，既有自己的节奏，也想让这一局真正赢下来。" +
      flaw[p.role]
    );
  }
  function keywords(p) {
    return p.v
      .map((v, i) => ({ v, i }))
      .sort((a, b) => b.v - a.v || a.i - b.i)
      .slice(0, 3)
      .map((x) => traits[x.i]);
  }
  function team(p) {
    return (
      DATA.teams.find((t) => t.id === p.team) || {
        name: "未指定队伍",
        abbr: "FA",
        color: "#455768",
      }
    );
  }
  function shield(p) {
    const t = team(p);
    return `<svg class="shield" viewBox="0 0 80 90" role="img" aria-label="${esc(t.name)}"><path d="M5 5H75V56L40 84 5 56Z" fill="${esc(t.color)}" stroke="#8b9db0" stroke-width="1.5"/><path d="M13 13H67V52L40 74 13 52Z" fill="#0d151d77" stroke="#ffffff22"/><text x="40" y="45" fill="#fff" text-anchor="middle" font-size="${t.abbr.length > 3 ? 16 : 21}" font-family="system-ui,sans-serif" font-weight="800">${esc(t.abbr)}</text><path d="M30 58H50" stroke="#fff" opacity=".5"/></svg>`;
  }
  function radar(values, reference) {
    const pts = (v) =>
      radarPoints(v)
        .map((p) => p.join(","))
        .join(" ");
    return `<svg class="radar" viewBox="0 0 360 350" role="img" aria-label="八维雷达：${esc(DATA.dims.map((d, i) => d.label + " " + Math.round(values[i])).join("，"))}"><title>实线是你，蓝色虚线是选手参考值</title>${[25, 50, 75, 100].map((n) => `<polygon class="grid" points="${pts(Array(8).fill(n))}"/>`).join("")}${radarPoints(
      Array(8).fill(100),
    )
      .map(
        ([x, y]) =>
          `<line class="axis" x1="180" y1="172" x2="${x}" y2="${y}"/>`,
      )
      .join(
        "",
      )}${reference ? `<polygon class="reference" points="${pts(reference)}"/>` : ""}<polygon class="you" points="${pts(values)}"/>${radarPoints(
      values,
    )
      .map(([x, y]) => `<circle class="point" cx="${x}" cy="${y}" r="3"/>`)
      .join("")}${radarPoints(Array(8).fill(100), 180, 172, 147)
      .map(
        ([x, y], i) =>
          `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${esc(DATA.dims[i].label)}<tspan x="${x}" dy="15" font-size="8">${esc(DATA.dims[i].key)}</tspan></text>`,
      )
      .join("")}</svg>`;
  }
  const defaultState = () => ({ draft: null, history: [], unlocked: [] });
  let storageOK = true,
    state = defaultState(),
    timer = null,
    noticeTimer = null,
    current = null,
    filter = "全部",
    shareURL = null;
  function hydrate(value) {
    const next = defaultState();
    if (!value || typeof value !== "object") return next;
    if (Array.isArray(value.history))
      next.history = value.history
        .filter(
          (h) =>
            h &&
            typeof h.id === "string" &&
            Number.isFinite(h.time) &&
            validAnswers(h.answers, DATA),
        )
        .slice(0, 50);
    if (Array.isArray(value.unlocked))
      next.unlocked = [
        ...new Set(
          value.unlocked.filter((id) => DATA.players.some((p) => p.id === id)),
        ),
      ];
    const d = value.draft;
    if (
      d &&
      typeof d.id === "string" &&
      Array.isArray(d.answers) &&
      d.answers.length === 20 &&
      d.answers.every(
        (x) => x === null || (Number.isInteger(x) && x >= 0 && x < 4),
      ) &&
      Number.isInteger(d.index) &&
      d.index >= 0 &&
      d.index < 20 &&
      d.answers.slice(0, d.index).every((x) => x !== null)
    )
      next.draft = d;
    return next;
  }
  try {
    state = hydrate(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    storageOK = false;
  }
  function notice(msg) {
    clearTimeout(noticeTimer);
    $("#notice").textContent = msg;
    noticeTimer = setTimeout(() => ($("#notice").textContent = ""), 5000);
  }
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      storageOK = false;
      notice("浏览器未允许本地存储；本次测试可继续，刷新后可能丢失。");
    }
  }
  function page(html) {
    $("#main").innerHTML = html;
    $("#main").classList.remove("fade-in");
    void $("#main").offsetWidth;
    $("#main").classList.add("fade-in");
    $("#main").focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  function uid() {
    return (
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10)
    );
  }
  function start(fresh = false) {
    if (fresh || !state.draft) {
      state.draft = { id: uid(), index: 0, answers: Array(20).fill(null) };
      persist();
    }
    if (location.hash === "#quiz") renderQuiz();
    else location.hash = "quiz";
  }
  function home() {
    page(
      `<section class="hero"><div class="hero-copy"><div class="eyebrow">VALORANT PERSONALITY TEST</div><h1>你是<span class="game">VALORANT</span>的哪个选手<span style="color:var(--red)">？</span></h1><p class="subtitle">20 题 · 2 分钟 · 35 位职业选手</p><p class="muted">关键一局，你会怎么打？<br>让你的选择，画出属于你的选手 DNA。</p><button class="btn primary" data-action="start">${state.draft ? "继续测试 · " + (state.draft.index + 1) + "/20" : "开始测试"} <span class="arrow" aria-hidden="true">↗</span></button>${state.draft ? '<div><button class="text-btn" data-action="restart">从第一题重新开始 →</button></div>' : ""}<p class="muted" style="font-size:10px;margin-top:16px">没有标准答案。按你的第一反应来。</p></div><div class="hero-art" aria-label="打法八维示意图"><div class="art-top"><span>PLAYER PROFILE / 001</span><strong>● AWAITING YOU</strong></div>${radar([92, 85, 35, 76, 82, 51, 68, 95], [65, 45, 75, 85, 55, 80, 90, 50])}<div class="art-name">WHO ARE <span>YOU?</span></div><div class="art-bottom"><span>8 DIMENSIONS</span><span>35 POSSIBILITIES ↗</span></div></div></section><section class="features" aria-label="测试介绍"><div class="feature"><span>01</span><div><h3>每一局，都有你的选择</h3><p>20 个实战情境，测的是打法气质。</p></div></div><div class="feature"><span>02</span><div><h3>看见你的八维 DNA</h3><p>枪法到心态，你的风格不止一面。</p></div></div><div class="feature"><span>03</span><div><h3>解锁你的选手图鉴</h3><p>收集结果，保存专属选手分享卡。</p></div></div></section>`,
    );
  }
  function renderQuiz() {
    if (!state.draft) {
      location.hash = "home";
      return;
    }
    const { index, answers } = state.draft,
      q = DATA.questions[index];
    page(
      `<section class="quiz"><div class="quiz-top"><button class="text-btn" data-action="previous" ${index === 0 ? "disabled" : ""}>← 上一题</button><span class="mono">${String(index + 1).padStart(2, "0")} <span class="muted">/ 20</span></span></div><div class="progress" role="progressbar" aria-label="答题进度" aria-valuemin="0" aria-valuemax="20" aria-valuenow="${index}"><span style="width:${index * 5}%"></span></div><div class="question-num mono">ROUND ${String(index + 1).padStart(2, "0")}</div><h1>${esc(q.text)}</h1><div class="options" role="group" aria-label="选择一个答案">${q.options.map((o, i) => `<button class="option ${answers[index] === i ? "selected" : ""}" data-choice="${i}" aria-pressed="${answers[index] === i}"><span class="letter" aria-hidden="true">${"ABCD"[i]}</span><span>${esc(o.text)}</span></button>`).join("")}</div><div class="quiz-foot"><span>选中后自动进入下一题</span><span>${storageOK ? "进度自动保存 · 可按键盘 1–4 选择" : "本地存储不可用 · 请勿刷新"}</span></div></section>`,
    );
  }
  function choose(n) {
    if (timer || !state.draft || location.hash !== "#quiz") return;
    const d = state.draft;
    d.answers[d.index] = n;
    persist();
    document.querySelectorAll("[data-choice]").forEach((b) => {
      const yes = Number(b.dataset.choice) === n;
      b.classList.toggle("selected", yes);
      b.setAttribute("aria-pressed", String(yes));
      b.disabled = true;
    });
    timer = setTimeout(() => {
      timer = null;
      if (d.index === 19) {
        finish();
      } else {
        d.index++;
        persist();
        renderQuiz();
      }
    }, 180);
  }
  function finish() {
    const d = state.draft;
    if (!d || !validAnswers(d.answers, DATA)) return;
    const result = score(d.answers, DATA);
    const entry = { id: d.id, time: Date.now(), answers: d.answers.slice() };
    state.history = [
      entry,
      ...state.history.filter((h) => h.id !== entry.id),
    ].slice(0, 50);
    for (const p of [
      result.top.player,
      ...(result.blend ? [result.second.player] : []),
    ])
      if (!state.unlocked.includes(p.id)) state.unlocked.push(p.id);
    state.draft = null;
    persist();
    location.hash = "result/" + entry.id;
  }
  function scene(a) {
    const open = [
      "你举枪率先踩进 A 大",
      "你在默认位等到了第一条信息",
      "你在语音里安排好全队枪线",
      "你从非常规角度拿到机会",
    ][a[1]];
    const clutch = [
      "拆开枪线冲出包点",
      "抓住转点时机逐个击破",
      "用技能打出一次意外的反击",
      "一边争取击杀一边准备放声庆祝",
    ][a[2]];
    const end = [
      "赛点仍然抢下进场的第一步",
      "赛点按熟悉的默认一分一分打",
      "赛点守着准星等待机会",
      "赛点先用一句玩笑让队友放松",
    ][a[15]];
    return `第 12 回合，${open}；面对 1v3，你选择${clutch}。镜头切到赛点，你${end}。`;
  }
  function renderResult(id) {
    const entry = state.history.find((h) => h.id === id);
    if (!entry) {
      page(
        '<div class="empty"><h1>这份结果不在本机历史中</h1><p>可以重新测试，生成你的选手 DNA。</p><button class="btn primary" data-action="start">开始测试 →</button></div>',
      );
      return;
    }
    const r = score(entry.answers, DATA);
    current = { entry, r };
    const p = r.top.player;
    page(
      `<div class="result-head"><div class="eyebrow">ANALYSIS COMPLETE / 你的选手 DNA</div><a class="text-btn" href="#history">查看历史 →</a></div><section class="result-grid"><div class="panel identity"><div class="identity-top">${shield(p)}<div><div class="muted" style="font-size:12px">${esc(team(p).name)}</div><span class="role-tag">${esc(p.role)}${p.igl ? " · 指挥" : ""}</span>${p.sub ? `<span class="role-tag">副位 · ${esc(p.sub)}</span>` : ""}</div></div><span class="pretitle">你的打法气质，更像</span><h1>${esc(p.name)}</h1><div class="similarity"><strong>${r.similarity}<span style="font-size:24px;color:var(--red)">%</span></strong><span>风格相似度</span></div>${r.blend ? `<div class="blend">你 = ${r.share}% ${esc(p.name)} + ${100 - r.share}% ${esc(r.second.player.name)}</div>` : '<div class="blend">独属于你的风格，不止于一个标签。</div>'}<div class="keywords">${keywords(
        p,
      )
        .map((k) => `<span>${esc(k)}</span>`)
        .join(
          "",
        )}</div></div><div class="panel"><div class="section-label">YOUR PLAYSTYLE / 八维对照</div>${radar(
        r.pct,
        p.v.map((x) => x * 10),
      )}<div class="legend"><span>你的选择</span><span class="ref">${esc(p.name)}</span></div><div class="dimension-list">${DATA.dims.map((d, i) => `<div>${esc(d.label)}<strong>${Math.round(r.pct[i])}</strong></div>`).join("")}</div></div><div class="panel"><div class="section-label">PLAYER PERSONALITY / 你的人设</div><p class="profile">${esc(profile(p))}</p><blockquote class="original-note">${esc(p.note)}</blockquote><p class="muted" style="font-size:11px;margin-top:16px">代表英雄：${esc(p.heroes)}</p></div><div class="panel"><div class="section-label">ROLE CONFESSION / 你的位置自白</div><h2>${esc(r.role)}</h2><p class="profile">${esc(roleVoice[r.role])}在${esc(r.role)}选手里，你最像 ${esc(r.roleBest.name)}，最不像 ${esc(r.roleLeast.name)}。这是节奏和选择的差异，不是实力排名。</p>${r.pct[2] >= 70 ? '<span class="role-tag">✦ 指挥潜质 · IGL ≥ 70</span>' : ""}</div><div class="panel scene"><div><div class="section-label">YOUR HIGHLIGHT</div><h2>你的名场面</h2></div><p>${esc(scene(entry.answers))}</p></div><div class="panel"><div class="section-label">BEST DUO / 最佳拍档</div><div class="partner-line">${shield(r.complement)}<strong>${esc(r.complement.name)}</strong></div><p class="profile">你们俩组队会把短板补成另一种强项：${esc(traits[r.pct.indexOf(Math.max(...r.pct))])}由你带头，他用${esc(keywords(r.complement)[0])}接住你的另一面。记得先沟通节奏，互补才不会变成各打各的。</p></div><div class="panel"><div class="section-label">COLLECTION / 本机解锁进度</div><h2>${state.unlocked.length}<span class="muted" style="font-size:18px"> / 35</span></h2><p class="muted" style="font-size:13px">每次完成测试，解锁你的主选手。混合结果会同时解锁两位选手。</p><a class="text-btn" href="#atlas">前往选手图鉴 ↗</a></div></section><div class="button-row"><button class="btn primary" data-action="share">保存分享卡 ↗</button><button class="btn" data-action="restart">再测一次</button><a class="btn ghost" href="#atlas">查看图鉴</a></div><p class="muted" style="font-size:10px;margin-top:18px">相似度表示八维打法方向的接近程度，不代表实力。所有结果仅保存在当前浏览器。</p>`,
    );
  }
  function atlas() {
    const players = DATA.players.filter(
      (p) => filter === "全部" || p.role === filter,
    );
    page(
      `<div class="page-head"><div><div class="eyebrow">PLAYER ARCHIVE</div><h1>选手图鉴<span style="color:var(--red)">.</span></h1><p class="muted">已解锁 ${state.unlocked.length} / 35 · 每次测试，遇见另一面的你</p></div><button class="btn ghost" data-action="start">去测试 ↗</button></div><div class="filters" aria-label="按主位置筛选">${["全部", ...roles].map((r) => `<button class="filter ${r === filter ? "active" : ""}" data-filter="${esc(r)}" aria-pressed="${r === filter}">${esc(r)}</button>`).join("")}</div><div class="atlas-grid">${players
        .map((p) => {
          const unlocked = state.unlocked.includes(p.id);
          return `<button class="player-tile ${unlocked ? "" : "locked"}" data-player="${esc(p.id)}" aria-label="${unlocked ? esc(p.name) : "未解锁选手"}">${unlocked ? shield(p) : '<div class="silhouette" aria-hidden="true"></div>'}<strong>${unlocked ? esc(p.name) : "?"}</strong><small>${unlocked ? esc(p.role) + (p.igl ? " · 指挥" : "") : "等待解锁"}</small></button>`;
        })
        .join("")}</div>`,
    );
  }
  function history() {
    page(
      `<div class="page-head"><div><div class="eyebrow">PAST IDENTITIES</div><h1>我的历史<span style="color:var(--red)">.</span></h1><p class="muted">最近 50 次结果 · 仅存在当前浏览器</p></div><button class="btn ghost" data-action="start">去测试 ↗</button></div>${
        state.history.length
          ? `<div class="history-list">${state.history
              .map((h) => {
                const r = score(h.answers, DATA);
                return `<button class="history-item" data-result="${esc(h.id)}">${shield(r.top.player)}<span class="grow"><strong>${esc(r.top.player.name)}</strong><small>${esc(new Date(h.time).toLocaleString("zh-CN", { hour12: false }))} · ${esc(r.role)}</small></span><span class="score">${r.similarity}%</span><span aria-hidden="true">↗</span></button>`;
              })
              .join("")}</div>`
          : '<div class="panel empty"><h2>你的第一份选手 DNA，还在等你</h2><p>完成 20 道题，结果会自动出现在这里。</p><button class="btn primary" data-action="start">开始测试 →</button></div>'
      }`,
    );
  }
  function closeModal() {
    const modal = $("#modal");
    if (modal.open) modal.close();
    if (shareURL) {
      URL.revokeObjectURL(shareURL);
      shareURL = null;
    }
  }
  function playerModal(id) {
    const p = DATA.players.find((p) => p.id === id);
    if (!p || !state.unlocked.includes(id)) {
      notice("完成测试，解锁属于你的选手。");
      return;
    }
    closeModal();
    $("#modal").innerHTML =
      `<div class="modal-head"><h2>${esc(p.name)}</h2><button class="close" data-action="close" aria-label="关闭">×</button></div><div class="partner-line">${shield(p)}<div>${esc(team(p).name)}<br><span class="role-tag">${esc(p.role)}${p.igl ? " · 指挥" : ""}</span></div></div>${radar(p.v.map((x) => x * 10))}<p class="muted" style="font-size:11px">以上为该选手参考值（0–100）。</p><p>${esc(p.note)}</p><p class="muted" style="font-size:12px">代表英雄：${esc(p.heroes)}</p>`;
    $("#modal").showModal();
  }
  function canvasRadar(ctx, values, reference) {
    const cx = 540,
      cy = 1040,
      r = 255;
    function polygon(v, color, fill, dashed = false) {
      const points = radarPoints(v, cx, cy, r);
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash(dashed ? [12, 10] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    [25, 50, 75, 100].forEach((n) =>
      polygon(Array(8).fill(n), "#344552", "transparent"),
    );
    radarPoints(Array(8).fill(100), cx, cy, r).forEach(([x, y]) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.strokeStyle = "#25333f";
      ctx.stroke();
    });
    polygon(reference, "#4a9eff", "#4a9eff08", true);
    polygon(values, "#ff4655", "#ff465528");
    ctx.textAlign = "center";
    radarPoints(Array(8).fill(100), cx, cy, r + 82).forEach(([x, y], i) => {
      ctx.fillStyle = "#e6eef6";
      ctx.font = '24px "Microsoft YaHei",sans-serif';
      ctx.fillText(DATA.dims[i].label, x, y);
      ctx.fillStyle = "#8b9db0";
      ctx.font = "18px monospace";
      ctx.fillText(Math.round(values[i]) + " / " + DATA.dims[i].key, x, y + 28);
    });
  }
  function canvasText(ctx, text, x, y, width, lineHeight) {
    let line = "";
    for (const c of text) {
      if (ctx.measureText(line + c).width > width) {
        ctx.fillText(line, x, y);
        line = c;
        y += lineHeight;
      } else line += c;
    }
    if (line) ctx.fillText(line, x, y);
    return y;
  }
  function makeShareCanvas(r) {
    const c = document.createElement("canvas");
    c.width = 1080;
    c.height = 1920;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持 Canvas。");
    const p = r.top.player,
      t = team(p);
    ctx.fillStyle = "#0d151d";
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.fillStyle = "#141f29";
    ctx.fillRect(54, 54, 972, 1812);
    ctx.strokeStyle = "#25333f";
    ctx.lineWidth = 2;
    ctx.strokeRect(54, 54, 972, 1812);
    ctx.fillStyle = "#ff4655";
    ctx.fillRect(54, 54, 972, 8);
    ctx.font = "bold 34px system-ui,sans-serif";
    ctx.fillText("VALTI / PLAYER DNA", 100, 145);
    ctx.fillStyle = "#8b9db0";
    ctx.font = '23px "Microsoft YaHei",sans-serif';
    ctx.fillText("你是 VALORANT 的哪个选手", 100, 197);
    ctx.beginPath();
    ctx.moveTo(100, 260);
    ctx.lineTo(245, 260);
    ctx.lineTo(245, 360);
    ctx.lineTo(172, 418);
    ctx.lineTo(100, 360);
    ctx.closePath();
    ctx.fillStyle = t.color;
    ctx.fill();
    ctx.strokeStyle = "#8b9db0";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "bold 30px system-ui,sans-serif";
    ctx.fillText(t.abbr, 172, 337);
    ctx.textAlign = "left";
    ctx.font = '25px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = "#e6eef6";
    ctx.fillText(t.name, 280, 310);
    ctx.fillStyle = "#8b9db0";
    ctx.fillText(p.role + (p.igl ? " · 指挥" : ""), 280, 361);
    ctx.fillStyle = "#8b9db0";
    ctx.font = '25px "Microsoft YaHei",sans-serif';
    ctx.fillText("你的打法气质，更像", 100, 490);
    ctx.fillStyle = "#e6eef6";
    let size = 115;
    do {
      ctx.font = `italic bold ${size--}px system-ui,sans-serif`;
    } while (ctx.measureText(p.name).width > 880 && size > 40);
    ctx.fillText(p.name, 94, 620);
    ctx.fillStyle = "#ff4655";
    ctx.font = "bold 84px monospace";
    ctx.fillText(r.similarity + "%", 100, 746);
    ctx.fillStyle = "#8b9db0";
    ctx.font = '23px "Microsoft YaHei",sans-serif';
    ctx.fillText("风格相似度", 325, 735);
    canvasRadar(
      ctx,
      r.pct,
      p.v.map((x) => x * 10),
    );
    ctx.textAlign = "left";
    ctx.font = '21px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = "#ff4655";
    ctx.fillText("━━ 你的选择", 265, 1470);
    ctx.fillStyle = "#4a9eff";
    ctx.fillText("┄┄ " + p.name, 570, 1470);
    ctx.fillStyle = "#e6eef6";
    ctx.font = '26px "Microsoft YaHei",sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(
      keywords(p)
        .map((k) => "#" + k)
        .join("   "),
      540,
      1550,
    );
    ctx.fillStyle = "#87dbbf";
    ctx.font = '22px "Microsoft YaHei",sans-serif';
    if (r.blend)
      canvasText(
        ctx,
        `你 = ${r.share}% ${p.name} + ${100 - r.share}% ${r.second.player.name}`,
        540,
        1620,
        860,
        32,
      );
    ctx.textAlign = "left";
    ctx.strokeStyle = "#25333f";
    ctx.beginPath();
    ctx.moveTo(100, 1710);
    ctx.lineTo(980, 1710);
    ctx.stroke();
    ctx.fillStyle = "#e6eef6";
    ctx.font = "bold 30px system-ui,sans-serif";
    ctx.fillText("YOUR PLAY. YOUR IDENTITY.", 100, 1773);
    ctx.font = '20px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = "#8b9db0";
    ctx.fillText("20 题 · 8 个维度 · 35 位职业选手", 100, 1815);
    ctx.textAlign = "right";
    ctx.font = '17px "Microsoft YaHei",sans-serif';
    ctx.fillText("非官方粉丝作品 / 仅供娱乐", 980, 1845);
    return c;
  }
  async function share() {
    if (!current) return;
    const button = $('[data-action="share"]');
    button.disabled = true;
    try {
      const c = makeShareCanvas(current.r);
      const blob = await new Promise((resolve, reject) =>
        c.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("图片导出失败"))),
          "image/png",
        ),
      );
      closeModal();
      shareURL = URL.createObjectURL(blob);
      const name = "VALTI-" + current.r.top.player.name + ".png";
      $("#modal").innerHTML =
        `<div class="modal-head"><h2>你的选手分享卡</h2><button class="close" data-action="close" aria-label="关闭">×</button></div><img class="share-preview" src="${esc(shareURL)}" alt="${esc(current.r.top.player.name)} 的 1080×1920 选手分享卡"><a class="btn primary" style="width:100%" href="${esc(shareURL)}" download="${esc(name)}">下载 PNG ↧</a><p class="muted" style="font-size:11px;margin-top:14px">1080 × 1920 · 手机也可长按图片保存</p>`;
      $("#modal").showModal();
    } catch (e) {
      notice(e.message || "生成失败，请重试。");
    } finally {
      button.disabled = false;
    }
  }
  function route() {
    clearTimeout(timer);
    timer = null;
    closeModal();
    current = null;
    const hash = location.hash || "#home";
    if (hash === "#quiz") renderQuiz();
    else if (hash === "#atlas") atlas();
    else if (hash === "#history") history();
    else if (hash.startsWith("#result/")) renderResult(hash.slice(8));
    else home();
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button,[data-result]");
    if (!b || b.disabled) return;
    if (b.dataset.choice !== undefined) {
      choose(Number(b.dataset.choice));
      return;
    }
    if (b.dataset.filter) {
      filter = b.dataset.filter;
      atlas();
      return;
    }
    if (b.dataset.player) {
      playerModal(b.dataset.player);
      return;
    }
    if (b.dataset.result) {
      location.hash = "result/" + b.dataset.result;
      return;
    }
    switch (b.dataset.action) {
      case "start":
        start();
        break;
      case "restart":
        start(true);
        break;
      case "previous":
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (state.draft?.index > 0) {
          state.draft.index--;
          persist();
          renderQuiz();
        }
        break;
      case "share":
        void share();
        break;
      case "close":
        closeModal();
        break;
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.repeat || $("#modal").open)
      return;
    if (location.hash === "#quiz" && /^[1-4]$/.test(e.key)) {
      e.preventDefault();
      choose(Number(e.key) - 1);
    }
  });
  $("#modal").addEventListener("cancel", (e) => {
    e.preventDefault();
    closeModal();
  });
  window.addEventListener("hashchange", route);
  route();
  if (!storageOK) notice("无法读取本地记录，当前测试仍可正常使用。");
}
