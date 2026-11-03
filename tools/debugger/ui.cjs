"use strict";
// Kept as a server-rendered module; there is no public static debugger HTML page.
function renderPage(token) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="csrf-token" content="${token}"><title>VALTI 本机调试器</title><link rel="stylesheet" href="/editor.css"><script defer src="/editor.js"></script></head><body>
<header><div><strong>VALTI <span>/ LAB</span></strong><small>本机调试器</small></div><span class="local">● 仅本机 · 127.0.0.1</span><div class="actions"><button data-action="import">导入 JSON</button><button data-action="export">导出 JSON</button><button data-action="reload">重新载入</button><button class="primary" data-action="apply">写入本地数据</button></div></header>
<div class="intro"><div><h1>调整你的选手宇宙<span>.</span></h1><p>题目、权重与选手数据，都在这里调试。修改先存为本机草稿。</p></div><div id="summary" aria-live="polite"></div></div>
<nav aria-label="调试分类"><button class="active" data-tab="questions">题目与权重</button><button data-tab="players">选手列表</button><button data-tab="teams">队伍</button><button data-tab="scoring">分数配比</button><button data-tab="analysis">试算与分布</button></nav>
<div class="statusbar"><span id="save-state" role="status">正在载入…</span><button data-action="restore">载入已写入数据</button><button data-action="save">保存草稿</button><button data-action="preview">打开答题预览 ↗</button></div>
<div id="errors" role="alert" hidden></div><main id="workspace"><div class="empty">正在读取本机数据…</div></main>
<input id="import-file" type="file" accept="application/json,.json" hidden><div id="toast" role="status" aria-live="polite"></div>
<footer>草稿与备份只保存在本机。“写入本地数据”会备份并更新 data.js，不会自动提交或推送 GitHub。<br>仓库源码仍公开；本机调试服务、草稿和预览没有公众访问入口。</footer></body></html>`;
}
module.exports = { renderPage };
