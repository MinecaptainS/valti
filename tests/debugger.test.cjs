const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const baseline = require("./fixtures/baseline-data.json"),
  engine = require("../app.js");
const model = require("../tools/debugger/model.cjs"),
  { startDebugger, PUBLIC_FILES } = require("../tools/debugger/server.cjs"),
  { packagePublic } = require("../scripts/package-public.cjs");
const clone = () => structuredClone(baseline);
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "valti-debugger-test-"));
  for (const name of PUBLIC_FILES)
    await fs.copyFile(
      path.resolve(__dirname, "..", name),
      path.join(root, name),
    );
  await fs.writeFile(path.join(root, "data.js"), model.serialize(clone()));
  const started = await startDebugger({ rootDir: root, port: 0 });
  t.after(async () => {
    await new Promise((resolve) => started.server.close(resolve));
    started.server.closeAllConnections();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("valti-debugger-test-"));
    await fs.rm(root, { recursive: true, force: true });
  });
  const page = await fetch(started.origin),
    html = await page.text(),
    token = html.match(/name="csrf-token" content="([^"]+)"/)[1];
  const get = async (route) => {
    const response = await fetch(started.origin + route);
    return { response, body: await response.json() };
  };
  const post = async (route, body, headers = {}) => {
    const response = await fetch(started.origin + route, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: started.origin,
        "X-VALTI-CSRF": token,
        ...headers,
      },
      body: JSON.stringify(body),
    });
    return { response, body: await response.json() };
  };
  return { ...started, root, token, get, post, html };
}
test("schema rejects broken references, unknown dimensions and non-AIM specialist weights", () => {
  assert.deepEqual(model.validateData(clone()), []);
  const broken = clone();
  broken.players[0].team = "missing";
  broken.questions[20].options[0].weights.TEAM = 2;
  broken.players[1].v[0] = NaN;
  const errors = model.validateData(broken);
  assert.ok(errors.some((s) => s.includes("team")));
  assert.ok(errors.some((s) => s.includes("枪法专项只能")));
  assert.ok(errors.some((s) => s.includes("八维值")));
  const wrongRole = clone();
  wrongRole.questions[0].options[0].role = "指挥";
  assert.ok(model.validateData(wrongRole).length);
  const duplicate = clone();
  duplicate.players[1].id = duplicate.players[0].id;
  assert.ok(model.validateData(duplicate).some((s) => s.includes("ID 重复")));
});
test("new players, extra and reordered questions remain scoreable", () => {
  const data = clone();
  data.players.push({
    ...data.players[0],
    id: "new-player",
    name: "New Player",
    note: "新增选手的原始描述。",
  });
  const added = structuredClone(data.questions[3]);
  added.id = "extra-question";
  data.questions.splice(1, 0, added);
  [data.questions[2], data.questions[7]] = [
    data.questions[7],
    data.questions[2],
  ];
  assert.deepEqual(model.validateData(data), []);
  const result = engine.score(
    data.questions.map(() => 0),
    data,
  );
  assert.equal(result.questionCount, 24);
  assert.equal(result.ranked.length, 36);
  const analysis = model.analyze(data, engine, { sampleCount: 100 });
  assert.equal(analysis.sampleCount, 100);
  assert.equal(analysis.total, 36);
  assert.equal(
    analysis.counts.reduce((s, p) => s + p.count, 0),
    100,
  );
  assert.deepEqual(model.analyze(data, engine, { answers: [] }).errors, [
    "答卷长度或选项无效",
  ]);
});
test("loopback binding, Host checks, CSRF and source restrictions are enforced", async (t) => {
  const f = await fixture(t);
  assert.equal(f.server.address().address, "127.0.0.1");
  const denied = await new Promise((resolve, reject) => {
    require("node:http")
      .get(
        f.origin + "/api/workspace",
        { headers: { Host: "untrusted.example" } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      )
      .on("error", reject);
  });
  assert.equal(denied, 403);
  const cross = await f.post(
    "/api/draft",
    { data: clone() },
    { Origin: "https://untrusted.example" },
  );
  assert.equal(cross.response.status, 403);
  const missingToken = await f.post(
    "/api/draft",
    { data: clone() },
    { "X-VALTI-CSRF": "" },
  );
  assert.equal(missingToken.response.status, 403);
  assert.equal(
    (await fetch(f.origin + "/.valti-debug/draft.json")).status,
    404,
  );
  assert.equal((await fetch(f.origin + "/tools/debugger/ui.cjs")).status, 404);
  const page = await fetch(f.origin);
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  assert.equal(page.headers.get("access-control-allow-origin"), null);
  assert.match(
    page.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
});
test("draft saving does not apply data; explicit apply creates a backup and detects stale writes", async (t) => {
  const f = await fixture(t),
    initial = (await f.get("/api/workspace")).body,
    original = await fs.readFile(path.join(f.root, "data.js"), "utf8");
  const data = clone();
  data.players.push({
    ...data.players[0],
    id: "new_player",
    name: "Debugger Player",
  });
  const saved = await f.post("/api/draft", {
    data,
    expectedRevision: initial.draftRevision,
  });
  assert.equal(saved.response.status, 200);
  assert.equal(
    await fs.readFile(path.join(f.root, "data.js"), "utf8"),
    original,
  );
  assert.ok(await fs.stat(path.join(f.root, ".valti-debug", "draft.json")));
  const stale = await f.post("/api/draft", {
    data: clone(),
    expectedRevision: initial.draftRevision,
  });
  assert.equal(stale.response.status, 409);
  const applied = await f.post("/api/apply", {
    data,
    expectedRevision: saved.body.draftRevision,
    expectedBaseRevision: initial.baseRevision,
  });
  assert.equal(applied.response.status, 200);
  assert.equal(
    await fs.readFile(path.join(f.root, applied.body.backup), "utf8"),
    original,
  );
  delete require.cache[require.resolve(path.join(f.root, "data.js"))];
  const active = require(path.join(f.root, "data.js"));
  assert.equal(active.players.length, 36);
  assert.match(active.datasetRevision, /^[0-9a-f]{20}$/);
  const staleBase = await f.post("/api/apply", {
    data,
    expectedRevision: applied.body.draftRevision,
    expectedBaseRevision: initial.baseRevision,
  });
  assert.equal(staleBase.response.status, 409);
});
test("concurrent saves cannot silently overwrite each other", async (t) => {
  const f = await fixture(t),
    initial = (await f.get("/api/workspace")).body,
    a = clone(),
    b = clone();
  a.players[0].note = "窗口 A";
  b.players[0].note = "窗口 B";
  const results = await Promise.all([
    f.post("/api/draft", { data: a, expectedRevision: initial.draftRevision }),
    f.post("/api/draft", { data: b, expectedRevision: initial.draftRevision }),
  ]);
  assert.deepEqual(results.map((r) => r.response.status).sort(), [200, 409]);
});
test("invalid imports do not overwrite a draft; preview and public packaging expose only allowlisted files", async (t) => {
  const f = await fixture(t),
    initial = (await f.get("/api/workspace")).body,
    data = clone();
  data.players[0].v[0] = 999;
  assert.equal(
    (
      await f.post("/api/draft", {
        data,
        expectedRevision: initial.draftRevision,
      })
    ).response.status,
    422,
  );
  assert.equal(
    (await f.get("/api/workspace")).body.draftRevision,
    initial.draftRevision,
  );
  const preview = await f.post("/api/preview", { data: clone() });
  assert.equal(preview.response.status, 200);
  const previewData = await fetch(f.origin + "/preview/data.js");
  assert.match(await previewData.text(), /datasetRevision/);
  assert.equal(
    (await fetch(f.origin + "/preview/tools/debugger/server.cjs")).status,
    404,
  );
  await fs.mkdir(path.join(f.root, ".valti-debug"), { recursive: true });
  await fs.writeFile(
    path.join(f.root, ".valti-debug", "private.txt"),
    "private",
  );
  const dist = await packagePublic(f.root);
  assert.deepEqual(
    (await fs.readdir(dist)).sort(),
    PUBLIC_FILES.slice().sort(),
  );
  await fs.writeFile(path.join(dist, "unexpected.txt"), "stop");
  await assert.rejects(() => packagePublic(f.root), /未授权文件/);
});
