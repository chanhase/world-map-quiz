/**
 * 表示用フォーマッタ。四則演算結果(比率など)を人が読める文字列に変換するだけで、
 * 計算ロジック自体は含まない(計算は metrics.mjs が担当)。
 */

export function formatYenOku(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  const oku = value / 100_000_000;
  return `${oku.toLocaleString("ja-JP", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}億円`;
}

export function formatPercent(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatRatio(value, digits = 2, suffix = "倍") {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

export function formatYen0(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

/** formatPercent の出力文字列を数値(小数, 例: 0.123)に戻す。テストでの整合性検証に使う。 */
export function parsePercent(text) {
  const m = /(-?[\d.]+)%/.exec(text);
  if (!m) return null;
  return Number(m[1]) / 100;
}

/** formatRatio の出力文字列を数値に戻す。テストでの整合性検証に使う。 */
export function parseRatio(text) {
  const m = /(-?[\d.]+)倍/.exec(text);
  if (!m) return null;
  return Number(m[1]);
}
