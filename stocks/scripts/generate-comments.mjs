#!/usr/bin/env node
/**
 * data/telecom/metrics.json の「算出済みの数値」だけをClaudeに渡し、
 * 業界内の比較コメントを生成して data/telecom/comments.json に保存する。
 *
 * 重要な設計方針:
 *   - このスクリプトは決算データ更新時(想定: 四半期ごと)にのみ実行する。
 *     訪問者がページを閲覧するたびにAIを呼び出すことはしない。
 *   - Claudeに渡すのは算出済みの数値のみで、生のXBRLやテキストは渡さない。
 *   - 生成結果は静的HTMLに埋め込んで配信するため、このスクリプトの実行はここで完結する。
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const METRICS_PATH = `${__dirname}../data/telecom/metrics.json`;
const COMMENTS_PATH = `${__dirname}../data/telecom/comments.json`;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const SYSTEM_PROMPT = `あなたは日本株の財務データを比較する情報サイトの原稿担当です。
以下のルールを必ず守ってください。

1. これは投資助言ではありません。個別銘柄の売買や保有を推奨・示唆する表現は一切使わないこと。
2. 「買うべき」「売るべき」「割安」「割高」「今が買い時」「おすすめ」など、断定的な推奨・評価を示す表現を使わないこと。
3. 与えられた算出済みの数値(売上高・営業利益率・増収率・ROE・PER・PBRなど)の企業間の違いを、客観的な事実として説明することに徹すること。
4. 数値の背景にある一般的な業界の傾向や、指標の意味の解説は構わないが、断定的な将来予測は避けること。
5. 出力は日本語のプレーンテキストで、3〜5段落程度。見出しや箇条書き記号は使わない。`;

function buildUserPrompt(metrics) {
  const usable = metrics.companies.filter((c) => c.status !== "error" && c.computed);
  const table = usable.map((c) => ({
    企業名: c.name,
    市場区分: c.market,
    決算期: c.fiscalYearLabel,
    売上高_百万円: c.raw.netSales != null ? Math.round(c.raw.netSales / 1_000_000) : null,
    営業利益率: c.computed.operatingMargin != null ? round(c.computed.operatingMargin * 100, 1) : null,
    増収率前年比: c.computed.revenueGrowthRate != null ? round(c.computed.revenueGrowthRate * 100, 1) : null,
    ROE: c.computed.roe != null ? round(c.computed.roe * 100, 1) : null,
    PER倍: c.raw.per ?? null,
    PBR倍: c.computed.pbr != null ? round(c.computed.pbr, 2) : null,
  }));

  return `以下は「${metrics.industry.name}」に属する、東証スタンダード・グロース市場の企業(プライム市場は含まない)の、
直近の有価証券報告書から機械的に算出した財務指標です(単位: 営業利益率・増収率・ROEは%、PER・PBRは倍)。

${JSON.stringify(table, null, 2)}

これらの数値をもとに、企業間でどのような指標の違いが見られるかを客観的に説明する比較コメントを書いてください。`;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY が未設定のため、コメント生成をスキップします。");
    return;
  }

  const metrics = await readJsonIfExists(METRICS_PATH);
  if (!metrics) {
    console.error(`${METRICS_PATH} が見つかりません。先に fetch-and-compute を実行してください。`);
    process.exit(1);
  }

  const usableCount = metrics.companies.filter((c) => c.status !== "error" && c.computed).length;
  if (usableCount < 2) {
    console.warn("比較可能な企業データが2社未満のため、コメント生成をスキップします。");
    return;
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(metrics) }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Claudeからのコメント生成結果が空でした。");
  }

  const existing = (await readJsonIfExists(COMMENTS_PATH)) ?? { industries: {} };
  existing.industries = existing.industries ?? {};
  existing.industries.telecom = {
    text,
    generatedAt: new Date().toISOString(),
    model: MODEL,
  };

  await writeFile(COMMENTS_PATH, JSON.stringify(existing, null, 2) + "\n", "utf-8");
  console.log(`書き出し完了: ${COMMENTS_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
