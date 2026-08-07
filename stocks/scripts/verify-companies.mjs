#!/usr/bin/env node
/**
 * companies.json の証券コード・企業名が、実際にEDINETへ有価証券報告書を
 * 提出している企業と一致するかを確認する。
 *
 * 目的: 誤った証券コードのまま運用し、意図しない企業のデータを「別の企業」として
 *       表示してしまう事故を防ぐこと。不一致・未検出があれば非0で終了し、
 *       後続のfetch/renderを止める。
 *
 * 注意: このスクリプトはEDINETからは取得できない「市場区分(スタンダード/グロース)」
 *       の正しさまでは検証できない。市場区分はJPXの上場会社一覧等で別途確認が必要。
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { EdinetClient, toEdinetSecCode } from "./lib/edinetClient.mjs";
import { ensureFilingIndex } from "./lib/filingIndexStore.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const COMPANIES_PATH = `${__dirname}../data/telecom/companies.json`;
const CACHE_PATH = `${__dirname}../data/telecom/.filing-index-cache.json`;

function normalizeName(name) {
  return name
    .replace(/株式会社/g, "")
    .replace(/（株）|\(株\)/g, "")
    .replace(/[\s　]/g, "")
    .toLowerCase();
}

function namesLooselyMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

async function main() {
  const apiKey = process.env.EDINET_SUBSCRIPTION_KEY;
  if (!apiKey) {
    console.error("EDINET_SUBSCRIPTION_KEY が未設定です。GitHub Secretsを確認してください。");
    process.exit(1);
  }

  const config = JSON.parse(await readFile(COMPANIES_PATH, "utf-8"));
  const companies = config.companies;

  const client = new EdinetClient(apiKey);
  const targetSecCodes = new Set(companies.map((c) => toEdinetSecCode(c.secCode)));

  const filingsBySecCode = await ensureFilingIndex(client, {
    targetSecCodes,
    cachePath: CACHE_PATH,
    log: (msg) => console.log(msg),
  });

  let hasError = false;
  const report = [];

  for (const company of companies) {
    const edinetSecCode = toEdinetSecCode(company.secCode);
    const filings = filingsBySecCode[edinetSecCode] ?? [];

    if (filings.length === 0) {
      hasError = true;
      report.push(`✗ ${company.secCode} ${company.name}: 有価証券報告書が見つかりませんでした`);
      continue;
    }

    const filerName = filings[filings.length - 1].filerName ?? "";
    if (!namesLooselyMatch(filerName, company.name)) {
      hasError = true;
      report.push(
        `✗ ${company.secCode} ${company.name}: EDINET提出者名 "${filerName}" と一致しません(証券コードの誤りの可能性)`
      );
      continue;
    }

    report.push(`✓ ${company.secCode} ${company.name} = EDINET "${filerName}" (${filings.length}件の提出履歴)`);
  }

  console.log("\n=== companies.json 検証結果 ===");
  for (const line of report) console.log(line);

  if (hasError) {
    console.error("\n検証に失敗した企業があります。companies.json を修正してください。");
    process.exit(1);
  }
  console.log("\n全企業の検証に成功しました。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
