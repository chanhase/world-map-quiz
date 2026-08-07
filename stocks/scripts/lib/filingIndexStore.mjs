import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { buildFilingIndex, formatDate } from "./edinetClient.mjs";

/**
 * EDINETの日次書類一覧スキャンは時間がかかるため、結果をキャッシュして
 * 次回実行時は前回スキャン日の翌日から今日までだけを追加スキャンする。
 * キャッシュ自体はリポジトリにコミットして再利用する(GitHub Actionsの毎回のジョブは
 * クリーンな環境で動くため、リポジトリへのコミットがないと毎回全期間再スキャンになる)。
 */
export async function ensureFilingIndex(
  client,
  { targetSecCodes, cachePath, initialLookbackDays = 450, log = () => {} }
) {
  const cache = await loadCache(cachePath);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let fromDate;
  if (cache.lastScannedDate) {
    fromDate = new Date(cache.lastScannedDate);
    fromDate.setUTCDate(fromDate.getUTCDate() + 1);
  } else {
    fromDate = new Date(today);
    fromDate.setUTCDate(fromDate.getUTCDate() - initialLookbackDays);
  }

  if (fromDate <= today) {
    log(`EDINET書類一覧スキャン: ${formatDate(fromDate)} 〜 ${formatDate(today)}`);
    const newFilings = await buildFilingIndex(client, {
      fromDate,
      toDate: today,
      targetSecCodes,
      log,
    });

    for (const [secCode, filings] of newFilings.entries()) {
      const existing = cache.filings[secCode] ?? [];
      const byDocId = new Map(existing.map((f) => [f.docID, f]));
      for (const f of filings) byDocId.set(f.docID, f);
      cache.filings[secCode] = [...byDocId.values()];
    }
    cache.lastScannedDate = formatDate(today);
    await saveCache(cachePath, cache);
  } else {
    log("EDINET書類一覧キャッシュは最新です。スキャンをスキップします。");
  }

  return cache.filings;
}

async function loadCache(cachePath) {
  try {
    const text = await readFile(cachePath, "utf-8");
    const parsed = JSON.parse(text);
    return { lastScannedDate: parsed.lastScannedDate ?? null, filings: parsed.filings ?? {} };
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    return { lastScannedDate: null, filings: {} };
  }
}

async function saveCache(cachePath, cache) {
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache, null, 2) + "\n", "utf-8");
}
