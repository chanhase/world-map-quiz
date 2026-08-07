#!/usr/bin/env node
/**
 * data/telecom/metrics.json と data/telecom/comments.json から
 * 静的HTML(telecom.html)を生成する。訪問者アクセス時には何も計算・呼び出しをしない
 * (このスクリプト自体をデータ更新時にのみ実行する)。
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderTelecomPage } from "./lib/render.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const METRICS_PATH = `${__dirname}../data/telecom/metrics.json`;
const COMMENTS_PATH = `${__dirname}../data/telecom/comments.json`;
const OUTPUT_PATH = `${__dirname}../telecom.html`;

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function main() {
  const metrics = await readJsonIfExists(METRICS_PATH);
  if (!metrics) {
    console.error(`${METRICS_PATH} が見つかりません。先に fetch-and-compute を実行してください。`);
    process.exit(1);
  }
  const comments = await readJsonIfExists(COMMENTS_PATH);
  const comment = comments?.industries?.telecom ?? null;

  const html = renderTelecomPage(metrics, comment);
  await writeFile(OUTPUT_PATH, html, "utf-8");
  console.log(`書き出し完了: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
