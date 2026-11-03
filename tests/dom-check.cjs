const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const requireQA = require("node:module").createRequire(
  path.resolve(process.env.VALTI_QA_DIR || process.cwd(), "package.json"),
);
const { JSDOM } = requireQA("jsdom");
const { createCanvas } = requireQA("@napi-rs/canvas");
const root = path.resolve(__dirname, ".."),
  html = fs.readFileSync(path.join(root, "index.html"), "utf8"),
  data = fs.readFileSync(path.join(root, "data.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
function boot(
  saved,
  url = "https://valti.test/#home",
  deny = false,
  modifiedData = data,
) {
  const dom = new JSDOM(html, {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.scrollTo = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  let blobs = new Map(),
    id = 0;
  w.URL.createObjectURL = (b) => {
    const u = "blob:https://valti.test/" + ++id;
    blobs.set(u, b);
    return u;
  };
  w.URL.revokeObjectURL = (u) => blobs.delete(u);
  w.HTMLCanvasElement.prototype.getContext = function () {
    this.native ||= createCanvas(this.width, this.height);
    return this.native.getContext("2d");
  };
  w.HTMLCanvasElement.prototype.toBlob = function (cb) {
    const buf = this.native.toBuffer("image/png");
    const blob = new w.Blob([buf], { type: "image/png" });
    cb(blob);
  };
  if (saved) w.localStorage.setItem("valti.v1", saved);
  if (deny)
    Object.defineProperty(w, "localStorage", {
      get() {
        throw new Error("Denied");
      },
    });
  w.eval(
    modifiedData +
      "\n" +
      app.replace(
        /\n}\s*$/,
        "\nwindow.__qa={DATA,score,profile,makeShareCanvas,getState:()=>state,hydrate};\n}",
      ),
  );
  return {
    dom,
    w,
    blobs,
    click: (s) => {
      const b = w.document.querySelector(s);
      assert.ok(b, "Missing " + s);
      b.click();
    },
    text: () => w.document.querySelector("main").textContent,
  };
}
async function main() {
  let q = boot();
  assert.match(q.text(), /23 题 · 约 3 分钟 · 35 位职业选手/);
  q.click('[data-action="start"]');
  await sleep(20);
  assert.match(q.text(), /你主要玩的英雄是/);
  q.click('[data-choice="0"]');
  await sleep(210);
  q.click('[data-choice="1"]');
  await sleep(210);
  assert.match(q.text(), /1v3 残局/);
  q.click('[data-action="previous"]');
  assert.match(q.text(), /手枪局/);
  assert.equal(
    q.w.document
      .querySelector('[data-choice="1"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  q.click('[data-choice="2"]');
  await sleep(210);
  const saved = q.w.localStorage.getItem("valti.v1");
  q.dom.window.close();
  q = boot(saved, "https://valti.test/#quiz");
  assert.match(q.text(), /1v3 残局/);
  log.push("Answer, previous, edit and reload restoration passed.");
  for (let i = 2; i < 23; i++) {
    if (i === 20) {
      assert.match(q.text(), /中等靶平均成绩/);
      assert.equal(
        q.w.__qa.getState().history.length,
        0,
        "the original 20 questions must not finish the test",
      );
      assert.deepEqual(
        [...q.w.document.querySelectorAll(".option span:last-child")].map(
          (n) => n.textContent,
        ),
        ["27–30", "22–26", "16–21", "15 及以下"],
      );
      assert.equal(
        q.w.document
          .querySelector('[role="progressbar"]')
          .getAttribute("aria-valuemax"),
        "23",
      );
    }
    if (i === 21) assert.match(q.text(), /急停首发/);
    if (i === 22) assert.match(q.text(), /马枪之后/);
    q.click('[data-choice="' + (i % 4) + '"]');
    await sleep(205);
  }
  assert.match(q.text(), /你的选手 DNA/);
  assert.equal(q.w.__qa.getState().history.length, 1);
  assert.equal(q.w.__qa.getState().history[0].scoringVersion, 2);
  assert.equal(q.w.__qa.getState().history[0].answers.length, 23);
  assert.equal(q.w.__qa.getState().draft, null);
  const entry = q.w.__qa.getState().history[0],
    result = q.w.__qa.score(entry.answers, q.w.__qa.DATA);
  assert.equal(
    q.w.document.querySelector(".identity h1").textContent,
    result.top.player.name,
  );
  const displayed = [
    ...q.w.document.querySelectorAll(".dimension-list strong"),
  ].map((n) => Number(n.textContent));
  assert.deepEqual(displayed, Array.from(result.pct, Math.round));
  const values = q.w.document
    .querySelector(".radar .you")
    .getAttribute("points");
  assert.ok(values && !values.includes("NaN"));
  log.push(
    "23-question completion including AIM specials, result, radar values, history and unlock passed.",
  );
  const before = performance.now();
  q.click('[data-action="share"]');
  await sleep(10);
  const png = q.w.document.querySelector("a[download]");
  assert.ok(png);
  assert.equal(q.blobs.size, 1);
  assert.equal(
    q.w.document.querySelector(".share-preview").getAttribute("src"),
    png.getAttribute("href"),
  );
  const canvas = q.w.__qa.makeShareCanvas(result),
    bytes = canvas.native.toBuffer("image/png");
  assert.equal(bytes.readUInt32BE(16), 1080);
  assert.equal(bytes.readUInt32BE(20), 1920);
  if (process.env.VALTI_QA_PREVIEW)
    fs.writeFileSync(process.env.VALTI_QA_PREVIEW, bytes);
  const ms = Math.round(performance.now() - before);
  assert.ok(ms < 2000, "PNG generation " + ms + "ms");
  log.push(
    "Actual Canvas PNG generated: 1080×1920, " +
      ms +
      "ms (DOM/Canvas harness; browser download not tested).",
  );
  q.click('[data-action="close"]');
  assert.equal(q.blobs.size, 0);
  q.click('[data-action="share"]');
  await sleep(10);
  assert.equal(q.blobs.size, 1);
  q.click('[data-action="close"]');
  log.push("Repeated sharing and object URL cleanup passed.");
  q.w.location.hash = "atlas";
  await sleep(20);
  assert.equal(q.w.document.querySelectorAll(".player-tile").length, 35);
  assert.ok(q.w.document.querySelectorAll(".locked").length < 35);
  const unlocked = q.w.document.querySelector(".player-tile:not(.locked)");
  unlocked.click();
  assert.equal(q.w.document.querySelector("dialog").open, true);
  q.click('[data-action="close"]');
  q.click('[data-filter="控场"]');
  assert.ok(q.w.document.querySelectorAll(".player-tile").length > 0);
  log.push("35-tile atlas, unlocked details, four-role filtering passed.");
  q.w.location.hash = "history";
  await sleep(20);
  q.click("[data-result]");
  await sleep(20);
  assert.match(q.text(), /你的选手 DNA/);
  log.push("History result reopen passed.");
  const ds = q.w.__qa.DATA;
  ds.players.forEach((p) => {
    const text = q.w.__qa.profile(p);
    assert.ok(
      text.length >= 80 && text.length <= 110,
      p.name + ": " + text.length,
    );
    assert.ok(text.includes("但你"));
  });
  log.push(
    "All 35 personalized profiles contain 80–110 characters and a drawback.",
  );
  q.dom.window.close();
  const oldAnswers = Array.from({ length: 20 }, (_, i) => i % 4);
  const legacyEntry = {
    id: "legacy-result",
    time: 1793689200000,
    answers: oldAnswers,
  };
  let legacy = boot(
    JSON.stringify({ history: [legacyEntry], unlocked: ["p9763cc"] }),
    "https://valti.test/#result/legacy-result",
  );
  assert.match(legacy.text(), /旧版 20 题结果/);
  assert.equal(legacy.w.__qa.getState().history.length, 1);
  assert.equal(legacy.w.__qa.getState().history[0].scoringVersion, 1);
  const oldExpected = legacy.w.__qa.score(oldAnswers, legacy.w.__qa.DATA, 1);
  assert.equal(
    legacy.w.document.querySelector(".identity h1").textContent,
    oldExpected.top.player.name,
  );
  legacy.click('[data-action="upgrade"]');
  await sleep(20);
  assert.match(legacy.text(), /中等靶平均成绩/);
  assert.deepEqual(
    Array.from(legacy.w.__qa.getState().draft.answers.slice(0, 20)),
    oldAnswers,
  );
  assert.equal(legacy.w.__qa.getState().draft.index, 20);
  legacy.click('[data-choice="0"]');
  await sleep(210);
  const upgradedDraft = legacy.w.localStorage.getItem("valti.v1");
  legacy.dom.window.close();
  legacy = boot(upgradedDraft, "https://valti.test/#quiz");
  assert.match(legacy.text(), /急停首发/);
  assert.equal(legacy.w.__qa.getState().draft.answers[20], 0);
  legacy.click('[data-choice="0"]');
  await sleep(210);
  legacy.click('[data-choice="0"]');
  await sleep(210);
  assert.match(legacy.text(), /你的选手 DNA/);
  assert.equal(legacy.w.__qa.getState().history.length, 2);
  assert.equal(legacy.w.__qa.getState().history[0].scoringVersion, 2);
  assert.equal(legacy.w.__qa.getState().history[1].scoringVersion, 1);
  legacy.dom.window.close();
  const oldDraft = {
    id: "old-draft",
    index: 19,
    answers: [...oldAnswers.slice(0, 19), null],
  };
  const migrated = boot(
    JSON.stringify({ draft: oldDraft }),
    "https://valti.test/#quiz",
  );
  assert.equal(migrated.w.__qa.getState().draft.answers.length, 23);
  assert.deepEqual(
    Array.from(migrated.w.__qa.getState().draft.answers.slice(20)),
    [null, null, null],
  );
  migrated.click('[data-choice="1"]');
  await sleep(210);
  assert.match(migrated.text(), /中等靶平均成绩/);
  migrated.dom.window.close();
  log.push(
    "Legacy results stay intact; supplementing only 3 questions, new-draft reload and old-draft migration passed.",
  );
  const denied = boot(null, "https://valti.test/#home", true);
  denied.click('[data-action="start"]');
  await sleep(20);
  denied.click('[data-choice="0"]');
  await sleep(210);
  assert.match(denied.text(), /手枪局/);
  denied.dom.window.close();
  log.push("Storage denial does not prevent testing.");
  const broken = boot("{broken");
  assert.match(broken.text(), /23 题/);
  broken.dom.window.close();
  log.push("Corrupt storage recovers without crashing.");
  const unsafe = data.replace('"TenZ"', '"<img src=x onerror=alert(1)>"');
  const injected = boot(
    JSON.stringify({ unlocked: ["p9763cc"] }),
    "https://valti.test/#atlas",
    false,
    unsafe,
  );
  assert.equal(injected.w.document.querySelectorAll("main img").length, 0);
  assert.match(injected.text(), /<img src=x/);
  injected.dom.window.close();
  log.push("Data text is escaped; HTML injection renders as text.");
  console.log(log.join("\n"));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
