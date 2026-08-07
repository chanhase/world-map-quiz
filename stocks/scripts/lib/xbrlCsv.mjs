/**
 * EDINET の「XBRLをもとにしたCSV」(type=5でダウンロードされるZIP内のCSV)を解析するモジュール。
 *
 * ファイル形式: タブ区切り, UTF-16LE, ヘッダ行にカラム名。
 * 代表的なカラム: 要素ID / 項目名 / コンテキストID / 相対年度 / 連結・個別 / 期間・時点 / ユニットID / 単位 / 値
 *
 * XBRLタクソノミの要素IDは頻繁に細部が変わりうるため、まず「項目名」(日本語ラベル)で
 * マッチさせ、要素IDに "SummaryOfBusinessResults" を含む行(経営指標等の5年間サマリ)を
 * 優先することで、多少のタクソノミ差異に対して頑健になるようにしている。
 * 該当行が見つからない場合は例外を投げず null を返し、呼び出し側で
 * 「データ取得できず」として明示的に扱う(数値を捏造しない)。
 */

export function parseXbrlCsv(buffer) {
  const text = decodeCsvBuffer(buffer);
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const header = splitTsvLine(lines[0]);
  const colIndex = {};
  header.forEach((name, i) => {
    colIndex[name.trim()] = i;
  });

  const required = ["要素ID", "項目名", "相対年度", "連結・個別", "値"];
  for (const col of required) {
    if (!(col in colIndex)) {
      throw new Error(`EDINET CSVに想定カラム "${col}" が見つかりません(フォーマット変更の可能性)`);
    }
  }

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitTsvLine(lines[i]);
    if (cells.length < header.length) continue;
    records.push({
      elementId: cells[colIndex["要素ID"]] ?? "",
      itemName: cells[colIndex["項目名"]] ?? "",
      relativeYear: cells[colIndex["相対年度"]] ?? "",
      consolidatedOrNonConsolidated: cells[colIndex["連結・個別"]] ?? "",
      value: cells[colIndex["値"]] ?? "",
    });
  }
  return records;
}

function decodeCsvBuffer(buffer) {
  let bytes = buffer;
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    bytes = bytes.subarray(2);
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bytes = bytes.subarray(3);
    return new TextDecoder("utf-8").decode(bytes);
  }
  // BOMなしの場合はUTF-16LEを既定とする(EDINETのCSVはUTF-16LEが標準)
  try {
    return new TextDecoder("utf-16le", { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

function splitTsvLine(line) {
  return line.split("\t").map((cell) => stripQuotes(cell.trim()));
}

function stripQuotes(cell) {
  if (cell.length >= 2 && cell.startsWith('"') && cell.endsWith('"')) {
    return cell.slice(1, -1).replace(/""/g, '"');
  }
  return cell;
}

function parseNumericValue(value) {
  if (value == null || value === "") return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "－" || cleaned === "-") return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

const RELATIVE_YEAR = {
  current: "当期",
  prior: "前期",
};

/**
 * 指定したラベル群に一致する行から数値を1つ取り出す。
 * 優先順位: 要素IDに "SummaryOfBusinessResults" を含む行 > その他
 *          連結行 > 個別行(連結決算がない会社向けフォールバック)
 */
export function findSummaryValue(records, { labels, relativeYear = RELATIVE_YEAR.current }) {
  const candidates = records.filter(
    (r) => labels.some((label) => r.itemName.includes(label)) && r.relativeYear === relativeYear
  );
  if (candidates.length === 0) return null;

  const rank = (r) => {
    let score = 0;
    if (r.elementId.includes("SummaryOfBusinessResults")) score += 2;
    if (r.consolidatedOrNonConsolidated.includes("連結")) score += 1;
    return score;
  };

  const best = [...candidates].sort((a, b) => rank(b) - rank(a))[0];
  return parseNumericValue(best.value);
}

export const RELATIVE_YEAR_LABELS = RELATIVE_YEAR;

const METRIC_LABELS = {
  netSales: ["売上高", "営業収益"],
  operatingIncome: ["営業利益", "営業損失"],
  netIncome: ["親会社株主に帰属する当期純利益", "当期純利益", "当期純損失"],
  equity: ["純資産額"],
  eps: ["1株当たり当期純利益"],
  bps: ["1株当たり純資産額"],
  per: ["株価収益率"],
};

/**
 * パース済みレコード配列から、比較指標算出に必要な生データ一式を抽出する。
 * 取得できなかった項目は null のまま返す(呼び出し側で「データなし」表示にする)。
 */
export function extractRawFinancials(records) {
  return {
    netSales: findSummaryValue(records, { labels: METRIC_LABELS.netSales, relativeYear: RELATIVE_YEAR.current }),
    priorNetSales: findSummaryValue(records, { labels: METRIC_LABELS.netSales, relativeYear: RELATIVE_YEAR.prior }),
    operatingIncome: findSummaryValue(records, {
      labels: METRIC_LABELS.operatingIncome,
      relativeYear: RELATIVE_YEAR.current,
    }),
    netIncome: findSummaryValue(records, { labels: METRIC_LABELS.netIncome, relativeYear: RELATIVE_YEAR.current }),
    equity: findSummaryValue(records, { labels: METRIC_LABELS.equity, relativeYear: RELATIVE_YEAR.current }),
    eps: findSummaryValue(records, { labels: METRIC_LABELS.eps, relativeYear: RELATIVE_YEAR.current }),
    bps: findSummaryValue(records, { labels: METRIC_LABELS.bps, relativeYear: RELATIVE_YEAR.current }),
    per: findSummaryValue(records, { labels: METRIC_LABELS.per, relativeYear: RELATIVE_YEAR.current }),
  };
}
