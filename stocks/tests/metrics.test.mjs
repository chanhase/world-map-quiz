import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  operatingMargin,
  revenueGrowthRate,
  returnOnEquity,
  estimatedStockPrice,
  priceToBookRatio,
  computeCompanyMetrics,
} from "../scripts/lib/metrics.mjs";
import { parseXbrlCsv, extractRawFinancials } from "../scripts/lib/xbrlCsv.mjs";
import { renderTelecomPage } from "../scripts/lib/render.mjs";
import { formatPercent, parsePercent, formatRatio, parseRatio } from "../scripts/lib/format.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// ---------------------------------------------------------------------------
// 1. 純粋な計算ロジックの整合性テスト
//    「表示する営業利益率が実際に営業利益÷売上高と一致しているか」を機械的に検証する。
// ---------------------------------------------------------------------------

test("operatingMargin は 営業利益 ÷ 売上高 と厳密に一致する", () => {
  const cases = [
    [1_000_000, 10_000_000],
    [-500_000, 8_000_000],
    [0, 5_000_000],
    [123_456, 7_890_123],
  ];
  for (const [operatingIncome, netSales] of cases) {
    assert.equal(operatingMargin(operatingIncome, netSales), operatingIncome / netSales);
  }
});

test("operatingMargin は 売上高が0または欠損のとき null を返す(捏造しない)", () => {
  assert.equal(operatingMargin(100, 0), null);
  assert.equal(operatingMargin(100, null), null);
  assert.equal(operatingMargin(null, 100), null);
});

test("revenueGrowthRate は (当期売上高-前期売上高)÷前期売上高 と厳密に一致する", () => {
  const cases = [
    [11_000_000, 10_000_000],
    [9_000_000, 10_000_000],
    [10_000_000, 10_000_000],
  ];
  for (const [current, prior] of cases) {
    assert.equal(revenueGrowthRate(current, prior), (current - prior) / prior);
  }
});

test("returnOnEquity は 当期純利益 ÷ 自己資本(純資産) と厳密に一致する", () => {
  assert.equal(returnOnEquity(300_000, 2_400_000), 300_000 / 2_400_000);
  assert.equal(returnOnEquity(-100, 5_000), -100 / 5_000);
});

test("estimatedStockPrice は PER × EPS と厳密に一致する(リアルタイム株価を使わない)", () => {
  assert.equal(estimatedStockPrice(15.5, 42.3), 15.5 * 42.3);
});

test("priceToBookRatio は 株価 ÷ BPS と厳密に一致する", () => {
  assert.equal(priceToBookRatio(1000, 400), 1000 / 400);
});

test("computeCompanyMetrics: 全指標が生データからの再計算値と一致する", () => {
  const raw = {
    netSales: 12_345_000_000,
    priorNetSales: 11_000_000_000,
    operatingIncome: 800_000_000,
    netIncome: 500_000_000,
    equity: 4_000_000_000,
    eps: 45.2,
    bps: 320.5,
    per: 15.3,
  };
  const computed = computeCompanyMetrics(raw);

  assert.equal(computed.operatingMargin, raw.operatingIncome / raw.netSales);
  assert.equal(computed.revenueGrowthRate, (raw.netSales - raw.priorNetSales) / raw.priorNetSales);
  assert.equal(computed.roe, raw.netIncome / raw.equity);
  const expectedPrice = raw.per * raw.eps;
  assert.equal(computed.estimatedStockPrice, expectedPrice);
  assert.equal(computed.pbr, expectedPrice / raw.bps);
});

test("computeCompanyMetrics: 欠損データがあっても例外を投げずnullを返す", () => {
  const computed = computeCompanyMetrics({
    netSales: null,
    priorNetSales: null,
    operatingIncome: null,
    netIncome: null,
    equity: null,
    eps: null,
    bps: null,
    per: null,
  });
  for (const value of Object.values(computed)) {
    assert.equal(value, null);
  }
});

// ---------------------------------------------------------------------------
// 2. EDINET CSV パーサのテスト(合成フィクスチャ)
// ---------------------------------------------------------------------------

function buildFixtureCsv() {
  const header = ["要素ID", "項目名", "コンテキストID", "相対年度", "連結・個別", "期間・時点", "ユニットID", "単位", "値"];
  const rows = [
    ["jpcrp_cor:NetSalesSummaryOfBusinessResults", "売上高", "CurrentYearDuration", "当期", "連結", "期間", "JPY", "円", "12345000000"],
    ["jpcrp_cor:NetSalesSummaryOfBusinessResults", "売上高", "Prior1YearDuration", "前期", "連結", "期間", "JPY", "円", "11000000000"],
    ["jpcrp_cor:OperatingIncomeSummaryOfBusinessResults", "営業利益", "CurrentYearDuration", "当期", "連結", "期間", "JPY", "円", "800000000"],
    ["jpcrp_cor:NetIncomeSummaryOfBusinessResults", "親会社株主に帰属する当期純利益", "CurrentYearDuration", "当期", "連結", "期間", "JPY", "円", "500000000"],
    ["jpcrp_cor:NetAssetsSummaryOfBusinessResults", "純資産額", "CurrentYearInstant", "当期", "連結", "時点", "JPY", "円", "4000000000"],
    ["jpcrp_cor:BasicEarningsPerShareSummaryOfBusinessResults", "1株当たり当期純利益", "CurrentYearDuration", "当期", "連結", "期間", "JPY", "円", "45.2"],
    ["jpcrp_cor:NetAssetsPerShareSummaryOfBusinessResults", "1株当たり純資産額", "CurrentYearInstant", "当期", "連結", "時点", "JPY", "円", "320.5"],
    ["jpcrp_cor:PriceEarningsRatioSummaryOfBusinessResults", "株価収益率", "CurrentYearDuration", "当期", "連結", "期間", "倍", "倍", "15.3"],
    // 個別(非連結)の重複データ。連結が優先して選ばれることを確認するためのノイズ行。
    ["jpcrp_cor:NetSalesSummaryOfBusinessResultsNonConsolidated", "売上高", "CurrentYearDuration_NonConsolidatedMember", "当期", "個別", "期間", "JPY", "円", "9999999999"],
  ];
  const lines = [header, ...rows].map((cols) => cols.join("\t"));
  const text = lines.join("\r\n");
  const bom = Buffer.from([0xff, 0xfe]);
  return Buffer.concat([bom, Buffer.from(text, "utf16le")]);
}

test("parseXbrlCsv + extractRawFinancials: UTF-16LEタブ区切りCSVを正しく抽出する", () => {
  const buffer = buildFixtureCsv();
  const records = parseXbrlCsv(buffer);
  assert.ok(records.length >= 8);

  const raw = extractRawFinancials(records);
  assert.equal(raw.netSales, 12_345_000_000);
  assert.equal(raw.priorNetSales, 11_000_000_000);
  assert.equal(raw.operatingIncome, 800_000_000);
  assert.equal(raw.netIncome, 500_000_000);
  assert.equal(raw.equity, 4_000_000_000);
  assert.equal(raw.eps, 45.2);
  assert.equal(raw.bps, 320.5);
  assert.equal(raw.per, 15.3);
});

test("extractRawFinancials: 連結行が個別行より優先して選ばれる", () => {
  const buffer = buildFixtureCsv();
  const records = parseXbrlCsv(buffer);
  const raw = extractRawFinancials(records);
  assert.notEqual(raw.netSales, 9_999_999_999);
});

test("extractRawFinancials: 見つからない項目はnullになる(存在しない値を捏造しない)", () => {
  const header = ["要素ID", "項目名", "コンテキストID", "相対年度", "連結・個別", "期間・時点", "ユニットID", "単位", "値"];
  const rows = [
    ["jpcrp_cor:NetSalesSummaryOfBusinessResults", "売上高", "CurrentYearDuration", "当期", "連結", "期間", "JPY", "円", "1000"],
  ];
  const text = [header, ...rows].map((c) => c.join("\t")).join("\r\n");
  const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
  const raw = extractRawFinancials(parseXbrlCsv(buffer));
  assert.equal(raw.netSales, 1000);
  assert.equal(raw.operatingIncome, null);
  assert.equal(raw.per, null);
});

// ---------------------------------------------------------------------------
// 3. 表示(レンダリング)レイヤーの整合性テスト
//    「表示されているパーセンテージ/倍率」を文字列から数値に戻し、
//    実際の生データから再計算した値と一致するかを検証する。
// ---------------------------------------------------------------------------

test("format: formatPercent/parsePercent は往復で値を保持する(丸め誤差1e-3以内)", () => {
  for (const v of [0.0648, -0.1, 0, 0.5, 1.2345]) {
    const back = parsePercent(formatPercent(v));
    assert.ok(Math.abs(back - v) < 1e-3, `${v} -> ${formatPercent(v)} -> ${back}`);
  }
});

test("format: formatRatio/parseRatio は往復で値を保持する(丸め誤差1e-2以内)", () => {
  for (const v of [15.3, 2.16, 0, 100.001]) {
    const back = parseRatio(formatRatio(v));
    assert.ok(Math.abs(back - v) < 1e-2, `${v} -> ${formatRatio(v)} -> ${back}`);
  }
});

test("renderTelecomPage: 表示されている営業利益率・増収率・ROE・PBRが生データからの再計算値と一致する", () => {
  const raw = {
    netSales: 12_345_000_000,
    priorNetSales: 11_000_000_000,
    operatingIncome: 800_000_000,
    netIncome: 500_000_000,
    equity: 4_000_000_000,
    eps: 45.2,
    bps: 320.5,
    per: 15.3,
  };
  const computed = computeCompanyMetrics(raw);
  const data = {
    industry: { id: "telecom", name: "通信業" },
    generatedAt: new Date().toISOString(),
    companies: [
      {
        secCode: "9999",
        name: "テスト通信株式会社",
        market: "Growth",
        fiscalYearLabel: "2026年3月期",
        raw,
        computed,
        status: "ok",
      },
    ],
  };

  const html = renderTelecomPage(data, null);

  const rowMatch = /<tr data-seccode="9999">([\s\S]*?)<\/tr>/.exec(html);
  assert.ok(rowMatch, "対象企業の行が出力されていること");
  const rowHtml = rowMatch[1];

  const extractCell = (metric) => {
    const re = new RegExp(`data-metric="${metric}"[^>]*>([^<]+)<`);
    const m = re.exec(rowHtml);
    return m ? m[1] : null;
  };

  const displayedMargin = parsePercent(extractCell("operatingMargin"));
  assert.ok(Math.abs(displayedMargin - raw.operatingIncome / raw.netSales) < 1e-3);

  const displayedGrowth = parsePercent(extractCell("revenueGrowthRate"));
  assert.ok(Math.abs(displayedGrowth - (raw.netSales - raw.priorNetSales) / raw.priorNetSales) < 1e-3);

  const displayedRoe = parsePercent(extractCell("roe"));
  assert.ok(Math.abs(displayedRoe - raw.netIncome / raw.equity) < 1e-3);

  const displayedPbr = parseRatio(extractCell("pbr"));
  const expectedPbr = (raw.per * raw.eps) / raw.bps;
  assert.ok(Math.abs(displayedPbr - expectedPbr) < 1e-2);
});

test("renderTelecomPage: AIコメントに断定的な推奨表現(買うべき/割安/売り時)が含まれていない", () => {
  const data = {
    industry: { id: "telecom", name: "通信業" },
    generatedAt: new Date().toISOString(),
    companies: [],
  };
  const forbidden = ["買うべき", "売るべき", "割安です", "割高です", "今が買い時", "投資を推奨"];
  const comment = {
    text: "この業界内では営業利益率に差が見られます。増収率の高い企業はROEも相対的に高い傾向があります。",
    generatedAt: new Date().toISOString(),
    model: "test-model",
  };
  const html = renderTelecomPage(data, comment);
  for (const word of forbidden) {
    assert.ok(!html.includes(word), `禁止表現 "${word}" が含まれていないこと`);
  }
});

// ---------------------------------------------------------------------------
// 4. 実データの回帰テスト(生成済み metrics.json が存在する場合のみ実行)
//    ワークフロー実行のたびに、実際にコミットされる数値の整合性を再検証する安全網。
// ---------------------------------------------------------------------------

test("回帰テスト: data/telecom/metrics.json が存在する場合、全社の指標が算出ロジックと一致する", async () => {
  const path = `${__dirname}../data/telecom/metrics.json`;
  let metrics;
  try {
    metrics = JSON.parse(await readFile(path, "utf-8"));
  } catch (err) {
    if (err.code === "ENOENT") {
      return; // 未生成の場合はスキップ
    }
    throw err;
  }

  for (const company of metrics.companies ?? []) {
    if (company.status === "error" || !company.raw || !company.computed) continue;
    const recomputed = computeCompanyMetrics(company.raw);
    for (const key of Object.keys(recomputed)) {
      const expected = recomputed[key];
      const actual = company.computed[key];
      if (expected === null) {
        assert.equal(actual, null, `${company.name} の ${key} はnullのはず`);
      } else {
        assert.ok(
          Math.abs(actual - expected) < 1e-9,
          `${company.name} の ${key} が一致しません: 記録値=${actual} 再計算値=${expected}`
        );
      }
    }
  }
});
