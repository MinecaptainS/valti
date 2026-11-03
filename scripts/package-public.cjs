"use strict";
// Only these files may be deployed to the public website.
const fs = require("node:fs/promises"),
  path = require("node:path");
const PUBLIC_FILES = ["index.html", "styles.css", "app.js", "data.js"];
async function packagePublic(root = path.resolve(__dirname, "..")) {
  const destination = path.join(root, "dist");
  await fs.mkdir(destination, { recursive: true });
  const existing = await fs.readdir(destination);
  const unexpected = existing.filter((name) => !PUBLIC_FILES.includes(name));
  if (unexpected.length)
    throw new Error("dist/ 包含未授权文件，停止打包：" + unexpected.join(", "));
  for (const name of PUBLIC_FILES)
    await fs.copyFile(path.join(root, name), path.join(destination, name));
  return destination;
}
if (require.main === module)
  packagePublic()
    .then((result) =>
      process.stdout.write(
        "公众网站发布目录：" +
          result +
          "\n仅包含四个网站文件；不包含调试器、草稿、备份或测试。\n",
      ),
    )
    .catch((error) => {
      process.stderr.write(error.message + "\n");
      process.exitCode = 1;
    });
module.exports = { packagePublic, PUBLIC_FILES };
