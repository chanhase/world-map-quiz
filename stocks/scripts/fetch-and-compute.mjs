#!/usr/bin/env node
/**
 * EDINETから対象企業の最新の有価証券報告書を取得し、比較指標を算出して
 * data/telecom/metrics.json に書き出すメインスクリプト。
 * 実行頻度は決算更新時(四半期ごと想定)。GitHub Actionsのcron / 手動実行(workflow_dispatch)から呼ばれる。
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import { EdinetClient, toEdinetSecCode, latestFiling } from "./lib/edinetClient.mjs";
import { ensureFilingIndex } from "./lib/filingIndexStore.mjs";
import { parseXbrlCsv, extractRawFinancials } from "./lib/xbrlCsv.mjs";
import { computeCompanyMetrics } from "./lib/metrics.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const COMPANIES_PATH = `${__dirname}../data/telecom/companies.json`;
const CACHE_PATH = `${__dirname}../data/telecom/.filing-index-cache.json`;
const METRICS_PATH = `${__dirname}../data/telecom/metrics.json`;

function fiscalYearLabel(periodEnd) {
  if (!periodEnd) return null;
  const [y, m] = periodEnd.split("-");
  return `${y}年${Number(m)}月期`;
}

function findMainCsvEntry(zipEntries) {
  const csvEntries = zipEntries.filter(
    (e) => e.entryName.includes("XBRL_TO_CSV") && e.entryName.toLowerCase().endsWith(".csv")
  );
  const asrEntries = csvEntries.filter((e) => /jpcrp\d+-asr-/i.test(e.entryName));
  const pool = asrEntries.length > 0 ? asrEntries : csvEntries;
  if (pool.length === 0) return null;
  return pool.reduce((largest, e) => (e.header.size > (largest?.header.size ?? 0) ? e : largest), null);
}

async function processCompany(client, company, filingsBySecCode, log) {
  const edinetSecCode = toEdinetSecCode(company.secCode);
  const filings = filingsBySecCode[edinetSecCode] ?? [];
  const filing = latestFiling(filings);

  if (!filing) {
    return {
      secCode: company.secCode,
      name: company.name,
      market: company.market,
      status: "error",
      error: "有価証券報告書が見つかりませんでした",
    };
  }

  try {
    const zipBuffer = await client.downloadCsvZip(filing.docID);
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    const mainEntry = findMainCsvEntry(entries);
    if (!mainEntry) {
      throw new Error("CSVエントリがZIP内に見つかりません");
    }
    const csvBuffer = mainEntry.getData();
    const records = parseXbrlCsv(csvBuffer);
    const raw = extractRawFinancials(records);
    const computed = computeCompanyMetrics(raw);

    const missing = Object.entries(raw)
      .filter(([, v]) => v === null)
      .map(([k]) => k);
    if (missing.length > 0) {
      log(`  警告: ${company.name} は次の項目を取得できませんでした: ${missing.join(", ")}`);
    }

    return {
      secCode: company.secCode,
      name: company.name,
      market: company.market,
      docID: filing.docID,
      periodEnd: filing.periodEnd,
      fiscalYearLabel: fiscalYearLabel(filing.periodEnd),
      submitDateTime: filing.submitDateTime,
      raw,
      computed,
      status: missing.length > 0 ? "partial" : "ok",
      missingFields: missing,
    };
  } catch (err) {
    return {
      secCode: company.secCode,
      name: company.name,
      market: company.market,
      docID: filing.docID,
      status: "error",
      error: err.message,
    };
  }
}

async function main() {
  const apiKey = process.env.EDINET_SUBSCRIPTION_KEY;
  if (!apiKey) {
    console.error("EDINET_SUBSCRIPTION_KEY が未設定です。");
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

  const results = [];
  for (const company of companies) {
    console.log(`処理中: ${company.secCode} ${company.name}`);
    const result = await processCompany(client, company, filingsBySecCode, console.log);
    results.push(result);
  }

  const output = {
    industry: config.industry,
    generatedAt: new Date().toISOString(),
    companies: results,
  };

  await mkdir(`${__dirname}../data/telecom`, { recursive: true });
  await writeFile(METRICS_PATH, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`\n書き出し完了: ${METRICS_PATH}`);

  const errorCount = results.filter((r) => r.status === "error").length;
  if (errorCount > 0) {
    console.warn(`${errorCount}社でデータ取得エラーが発生しました(詳細はmetrics.json参照)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
