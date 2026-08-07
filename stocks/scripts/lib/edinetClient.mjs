/**
 * EDINET API v2 (金融庁) の薄いラッパー。
 * 仕様書: https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/download/ESE140206.pdf
 */

const BASE_URL = "https://api.edinet-fsa.go.jp/api/v2";

// 有価証券報告書(訂正を除く)のdocTypeCode
export const DOC_TYPE_SECURITIES_REPORT = "120";

export class EdinetClient {
  constructor(apiKey, { fetchImpl = fetch } = {}) {
    if (!apiKey) {
      throw new Error("EDINET_SUBSCRIPTION_KEY が設定されていません");
    }
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  /**
   * 指定日に提出された書類の一覧を取得する(メタデータ付き: type=2)。
   * @param {string} dateStr YYYY-MM-DD
   */
  async listDocuments(dateStr) {
    const url = new URL(`${BASE_URL}/documents.json`);
    url.searchParams.set("date", dateStr);
    url.searchParams.set("type", "2");
    url.searchParams.set("Subscription-Key", this.apiKey);

    const res = await this.fetchImpl(url);
    if (!res.ok) {
      throw new Error(`EDINET documents.json 取得失敗: ${res.status} ${dateStr}`);
    }
    const body = await res.json();
    return body.results ?? [];
  }

  /**
   * 書類本体(type=5: XBRLを基にしたCSVのZIP)をダウンロードする。
   * @param {string} docID
   * @returns {Promise<Buffer>}
   */
  async downloadCsvZip(docID) {
    const url = new URL(`${BASE_URL}/documents/${docID}`);
    url.searchParams.set("type", "5");
    url.searchParams.set("Subscription-Key", this.apiKey);

    const res = await this.fetchImpl(url);
    if (!res.ok) {
      throw new Error(`EDINET 書類ダウンロード失敗: ${res.status} docID=${docID}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

export function formatDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dateRange(fromDate, toDate) {
  const dates = [];
  const cur = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate()));
  const end = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate()));
  while (cur <= end) {
    dates.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 指定の証券コード集合を対象に、日付範囲をスキャンして有価証券報告書の提出履歴を収集する。
 * EDINETには「企業名で検索」するAPIがないため、日次一覧を走査して証券コードで絞り込む。
 * 既存のインデックス(前回実行分)を渡すと、まだ収集していない書類のみ追加する。
 *
 * @param {EdinetClient} client
 * @param {object} opts
 * @param {Date} opts.fromDate
 * @param {Date} opts.toDate
 * @param {Set<string>} opts.targetSecCodes  正規化済み(5桁, 末尾0)証券コード集合
 * @param {(msg: string) => void} [opts.log]
 * @param {number} [opts.delayMs] APIへの配慮のためのリクエスト間隔
 */
export async function buildFilingIndex(client, { fromDate, toDate, targetSecCodes, log = () => {}, delayMs = 250 }) {
  const filingsBySecCode = new Map();

  const dates = dateRange(fromDate, toDate);
  for (const date of dates) {
    const dateStr = formatDate(date);
    let results;
    try {
      results = await client.listDocuments(dateStr);
    } catch (err) {
      log(`警告: ${dateStr} の書類一覧取得に失敗: ${err.message}`);
      continue;
    }

    for (const doc of results) {
      if (doc.docTypeCode !== DOC_TYPE_SECURITIES_REPORT) continue;
      const secCode = doc.secCode;
      if (!secCode || !targetSecCodes.has(secCode)) continue;

      const entry = {
        docID: doc.docID,
        edinetCode: doc.edinetCode,
        secCode,
        filerName: doc.filerName,
        periodEnd: doc.periodEnd,
        submitDateTime: doc.submitDateTime,
      };

      const existing = filingsBySecCode.get(secCode) ?? [];
      existing.push(entry);
      filingsBySecCode.set(secCode, existing);
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  return filingsBySecCode;
}

/**
 * 証券コード(4桁)をEDINETの証券コード表記(5桁, 末尾0)に正規化する。
 */
export function toEdinetSecCode(tickerCode) {
  const digits = String(tickerCode).trim();
  if (digits.length === 5) return digits;
  if (digits.length === 4) return `${digits}0`;
  return digits;
}

/**
 * 収集した提出履歴の中から、直近(提出日時が最新)の1件を選ぶ。
 */
export function latestFiling(filings) {
  if (!filings || filings.length === 0) return null;
  return [...filings].sort((a, b) => (a.submitDateTime < b.submitDateTime ? 1 : -1))[0];
}
