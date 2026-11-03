const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const qaRequire = require("node:module").createRequire(
    path.resolve(process.env.VALTI_QA_DIR || process.cwd(), "package.json"),
  ),
  { JSDOM } = qaRequire("jsdom");
const { startDebugger, PUBLIC_FILES } = require("../tools/debugger/server.cjs");
const { serialize } = require("../tools/debugger/model.cjs");
const baseline = require("./fixtures/baseline-data.json");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, message) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await wait(15);
  }
  throw new Error("等待超时：" + message);
}
async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "valti-editor-dom-"));
  let started, dom;
  try {
    for (const file of PUBLIC_FILES)
      await fs.copyFile(
        path.resolve(__dirname, "..", file),
        path.join(root, file),
      );
    await fs.writeFile(path.join(root, "data.js"), serialize(baseline));
    started = await startDebugger({ rootDir: root, port: 0 });
    const origin = started.origin;
    const html = await (await fetch(origin)).text();
    dom = new JSDOM(html, {
      url: origin,
      runScripts: "outside-only",
      pretendToBeVisual: true,
    });
    const w = dom.window;
    w.structuredClone = structuredClone;
    w.confirm = () => true;
    const opened = [],
      downloads = [];
    w.open = (url) => opened.push(url);
    w.URL.createObjectURL = () => "blob:export";
    w.URL.revokeObjectURL = () => {};
    w.HTMLAnchorElement.prototype.click = function () {
      downloads.push(this.download);
    };
    w.fetch = (url, options = {}) =>
      fetch(new URL(url, origin), {
        ...options,
        headers: { ...options.headers, Origin: origin },
      });
    w.eval(
      await fs.readFile(
        path.resolve(__dirname, "../tools/debugger/client.js"),
        "utf8",
      ),
    );
    const click = (selector) => {
      const target = w.document.querySelector(selector);
      assert.ok(target, selector);
      target.click();
    };
    const edit = (selector, value) => {
      const target = w.document.querySelector(selector);
      assert.ok(target, selector);
      target.value = value;
      target.dispatchEvent(new w.Event("input", { bubbles: true }));
    };
    const workspace = async () =>
      (await fetch(origin + "/api/workspace")).json();
    await until(
      () => w.document.querySelector(".item-list"),
      "initial editor load",
    );
    click('[data-tab="players"]');
    click('[data-action="add"]');
    edit('[data-key="name"]', "New <b>Player</b>");
    edit('[data-key="note"]', "新增选手原文 <script>alert(1)</script>");
    edit('[data-key="vector"][data-dim="0"]', "9");
    click('[data-action="save"]');
    await until(
      async () => (await workspace()).data.players.length === 36,
      "save new player",
    );
    click('[data-tab="teams"]');
    click('[data-action="add"]');
    edit('[data-key="name"]', "测试战队");
    edit('[data-key="abbr"]', "LAB");
    click('[data-action="save"]');
    await until(
      async () => (await workspace()).data.teams.length === 40,
      "save new team",
    );
    const team = (await workspace()).data.teams.at(-1);
    click('[data-tab="players"]');
    edit('[data-key="team"]', team.id);
    assert.equal(w.document.querySelectorAll("#workspace b").length, 0);
    assert.equal(w.document.querySelectorAll("#workspace script").length, 0);
    click('[data-tab="questions"]');
    click('[data-action="add"]');
    edit('[data-key="text"]', "新增场景题");
    click('[data-action="up"]');
    edit('[data-key="weight"][data-option="0"][data-dim="AIM"]', "4");
    click('[data-action="save"]');
    await until(
      async () => (await workspace()).data.questions.length === 24,
      "save and reorder question",
    );
    click('[data-tab="scoring"]');
    edit('[data-key="aimSpecialWeight"]', "80");
    click('[data-action="save"]');
    await until(
      async () => (await workspace()).data.scoring.aimSpecialWeight === 0.8,
      "save scoring config",
    );
    click('[data-action="preview"]');
    await until(() => opened.length === 1, "open preview");
    assert.equal(opened[0], "/preview/");
    assert.equal((await fetch(origin + "/preview/")).status, 200);
    click('[data-tab="analysis"]');
    edit('[data-key="sampleCount"]', "100");
    click('[data-action="distribution"]');
    await until(
      () =>
        w.document.querySelector("main").textContent.includes("随机分布结果"),
      "distribution result",
    );
    click('[data-action="calculate"]');
    await until(
      () => w.document.querySelector("main").textContent.includes("前五名"),
      "manual result",
    );
    click('[data-action="export"]');
    assert.ok(downloads[0].startsWith("valti-draft-"));
    const beforeApply = await fs.readFile(path.join(root, "data.js"), "utf8");
    assert.equal(
      require("node:vm").runInNewContext(beforeApply + ";DATA.players.length"),
      35,
    );
    click('[data-action="apply"]');
    await until(
      async () =>
        (await fs.readFile(path.join(root, "data.js"), "utf8")).includes(
          "New <b>Player</b>",
        ),
      "apply local data",
    );
    const active = (await workspace()).data;
    assert.equal(active.questions.length, 24);
    assert.equal(active.players.length, 36);
    assert.equal(active.players.at(-1).team, team.id);
    assert.equal(active.scoring.aimSpecialWeight, 0.8);
    assert.ok(
      (await fs.readdir(path.join(root, ".valti-debug/backups"))).length === 1,
    );
    const imported = structuredClone(active);
    imported.players.at(-1).name = "Imported Player";
    const fileInput = w.document.querySelector("#import-file");
    Object.defineProperty(fileInput, "files", {
      value: [{ size: 100, text: async () => JSON.stringify(imported) }],
      configurable: true,
    });
    fileInput.dispatchEvent(new w.Event("change", { bubbles: true }));
    await until(
      async () =>
        (await workspace()).data.players.at(-1).name === "Imported Player",
      "JSON import",
    );
    click('[data-action="restore"]');
    await until(
      async () =>
        (await workspace()).data.players.at(-1).name === "New <b>Player</b>",
      "restore written data",
    );
    assert.equal(w.document.querySelector("#errors").hidden, true);
    console.log(
      "Editor DOM checks passed: player/team creation, escaped text, vector and question editing, reorder, scoring config, local draft, preview, distribution, manual answer scoring, JSON export/import and backed-up apply.",
    );
  } finally {
    dom?.window.close();
    if (started) {
      started.server.closeAllConnections();
      await new Promise((resolve) => started.server.close(resolve));
    }
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("valti-editor-dom-"));
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
