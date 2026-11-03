"use strict";
const http = require("node:http"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  crypto = require("node:crypto");
const model = require("./model.cjs"),
  engine = require("../../app.js");
const { renderPage } = require("./ui.cjs");
const PUBLIC_FILES = ["index.html", "styles.css", "app.js", "data.js"];
const BODY_LIMIT = 2 * 1024 * 1024;
function failure(status, message, errors) {
  const error = new Error(message);
  error.status = status;
  error.errors = errors;
  return error;
}
async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw failure(413, "数据超过 2 MB 限制");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw failure(400, "请求必须为有效 JSON");
  }
}
async function atomicWrite(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + "." + crypto.randomBytes(8).toString("hex") + ".tmp";
  await fs.writeFile(temp, content, { mode: 0o600 });
  try {
    await fs.rename(temp, file);
  } catch (error) {
    await fs.unlink(temp).catch(() => {});
    throw error;
  }
}
async function startDebugger({
  rootDir = path.resolve(__dirname, "../.."),
  port = 4174,
} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("端口无效");
  const sourceFile = path.join(rootDir, "data.js"),
    privateDir = path.join(rootDir, ".valti-debug"),
    draftFile = path.join(privateDir, "draft.json");
  const token = crypto.randomBytes(32).toString("hex");
  let origin = "",
    queue = Promise.resolve(),
    preview = null;
  const enqueue = (task) => {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  };
  async function base() {
    const text = await fs.readFile(sourceFile, "utf8");
    delete require.cache[require.resolve(sourceFile)];
    const data = require(sourceFile),
      errors = model.validateData(data);
    if (errors.length) throw failure(422, "当前 data.js 配置无效", errors);
    return {
      data,
      baseRevision: crypto.createHash("sha256").update(text).digest("hex"),
    };
  }
  async function workspace() {
    const current = await base();
    let saved = null,
      warning = "";
    try {
      saved = JSON.parse(await fs.readFile(draftFile, "utf8"));
      if (model.validateData(saved.data).length)
        throw new Error("Invalid draft");
    } catch (error) {
      if (error.code !== "ENOENT")
        warning = "本机草稿无法读取，已保留原文件并载入当前 data.js。";
      saved = null;
    }
    const data = saved?.data || current.data;
    return {
      ...current,
      sourceData: current.data,
      data,
      draftRevision: model.revision(data),
      hasDraft: !!saved,
      savedAt: saved?.savedAt || null,
      warning,
      sourceChanged: !!saved && saved.baseRevision !== current.baseRevision,
    };
  }
  const server = http.createServer(async (req, res) => {
    const send = (status, body, type = "application/json; charset=utf-8") => {
      res.writeHead(status, { "Content-Type": type });
      res.end(
        type.startsWith("application/json") ? JSON.stringify(body) : body,
      );
    };
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    try {
      if (!["127.0.0.1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress))
        throw failure(403, "仅允许本机访问");
      if (req.headers.host !== new URL(origin).host)
        throw failure(403, "Host 不匹配");
      const url = new URL(req.url, origin),
        route = url.pathname;
      if (req.method === "GET" && route === "/") {
        send(200, renderPage(token), "text/html; charset=utf-8");
        return;
      }
      if (
        req.method === "GET" &&
        ["/editor.js", "/editor.css"].includes(route)
      ) {
        const file = route === "/editor.js" ? "client.js" : "editor.css";
        send(
          200,
          await fs.readFile(path.join(__dirname, file)),
          file.endsWith(".js")
            ? "text/javascript; charset=utf-8"
            : "text/css; charset=utf-8",
        );
        return;
      }
      if (req.method === "GET" && route === "/api/workspace") {
        send(200, await workspace());
        return;
      }
      if (req.method === "GET" && route.startsWith("/preview/")) {
        if (!preview) throw failure(404, "请先在调试器中生成预览");
        const name =
          route === "/preview/"
            ? "index.html"
            : route.slice("/preview/".length);
        if (!PUBLIC_FILES.includes(name)) throw failure(404, "文件不存在");
        const body =
          name === "data.js"
            ? model.serialize(preview)
            : await fs.readFile(path.join(rootDir, name));
        send(
          200,
          body,
          name.endsWith(".html")
            ? "text/html; charset=utf-8"
            : name.endsWith(".css")
              ? "text/css; charset=utf-8"
              : "text/javascript; charset=utf-8",
        );
        return;
      }
      if (
        req.method !== "POST" ||
        !["/api/draft", "/api/preview", "/api/analyze", "/api/apply"].includes(
          route,
        )
      )
        throw failure(404, "接口不存在");
      if (
        req.headers.origin !== origin ||
        req.headers["x-valti-csrf"] !== token
      )
        throw failure(403, "请求来源或校验码无效，请从本机调试器操作");
      if (
        !String(req.headers["content-type"] || "").startsWith(
          "application/json",
        )
      )
        throw failure(415, "需要 application/json");
      const body = await readBody(req),
        errors = model.validateData(body?.data);
      if (errors.length) throw failure(422, "请先修正数据", errors);
      if (route === "/api/analyze") {
        const result = model.analyze(body.data, engine, body);
        if (result.errors.length) throw failure(422, "无法计算", result.errors);
        send(200, result);
        return;
      }
      if (route === "/api/preview") {
        preview = model.versioned(body.data);
        send(200, { url: "/preview/", revision: preview.datasetRevision });
        return;
      }
      const result = await enqueue(async () => {
        const current = await workspace();
        if (route === "/api/draft") {
          if (body.expectedRevision !== current.draftRevision)
            throw failure(409, "其他窗口已更新草稿，请重新载入后再编辑");
          const savedAt = new Date().toISOString();
          await atomicWrite(
            draftFile,
            JSON.stringify(
              { data: body.data, savedAt, baseRevision: current.baseRevision },
              null,
              2,
            ),
          );
          return { draftRevision: model.revision(body.data), savedAt };
        }
        if (body.expectedBaseRevision !== current.baseRevision)
          throw failure(
            409,
            "data.js 已被其他操作修改，请重新载入并比较后再写入",
          );
        if (body.expectedRevision !== current.draftRevision)
          throw failure(409, "草稿已被其他窗口更新，请重新载入后再写入");
        const smoke = model.analyze(body.data, engine, {
          answers: body.data.questions.map(() => 0),
        });
        if (smoke.errors.length)
          throw failure(422, "计分验证失败", smoke.errors);
        const original = await fs.readFile(sourceFile),
          backupName =
            new Date().toISOString().replace(/[:.]/g, "-") +
            "-" +
            crypto.randomBytes(3).toString("hex") +
            "-data.js";
        await atomicWrite(
          path.join(privateDir, "backups", backupName),
          original,
        );
        const data = model.versioned(body.data);
        await atomicWrite(sourceFile, model.serialize(data));
        const updated = await base(),
          savedAt = new Date().toISOString();
        await atomicWrite(
          draftFile,
          JSON.stringify(
            { data, savedAt, baseRevision: updated.baseRevision },
            null,
            2,
          ),
        );
        return {
          data,
          baseRevision: updated.baseRevision,
          draftRevision: model.revision(data),
          backup: ".valti-debug/backups/" + backupName,
          savedAt,
        };
      });
      send(200, result);
    } catch (error) {
      send(error.status || 500, {
        error: error.status
          ? error.message
          : "本机服务发生错误，请查看终端或检查文件权限",
        errors: error.errors || [],
      });
      if (!error.status)
        process.stderr.write("VALTI debugger error: " + error.message + "\n");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      origin = "http://127.0.0.1:" + server.address().port;
      server.removeListener("error", reject);
      resolve();
    });
  });
  return { server, origin, privateDir };
}
if (require.main === module) {
  startDebugger({ port: Number(process.env.VALTI_DEBUG_PORT || 4174) })
    .then(({ origin }) => {
      process.stdout.write(
        `VALTI 本机调试器：${origin}\n仅本机可访问；按 Ctrl+C 停止。草稿和备份保存在 .valti-debug/，不会上传 GitHub。\n`,
      );
    })
    .catch((error) => {
      process.stderr.write("无法启动：" + error.message + "\n");
      process.exitCode = 1;
    });
}
module.exports = { startDebugger, PUBLIC_FILES };
