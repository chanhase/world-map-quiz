/**
 * 財務指標の算出ロジック（純粋関数のみ）。
 * EDINETの生データ(売上高・営業利益・当期純利益・純資産・EPS・BPS・PER等)から
 * 四則演算のみで比較指標を導出する。副作用やネットワーク呼び出しは含まない。
 */

export function operatingMargin(operatingIncome, netSales) {
  if (!isFiniteNumber(operatingIncome) || !isFiniteNumber(netSales) || netSales === 0) {
    return null;
  }
  return operatingIncome / netSales;
}

export function revenueGrowthRate(currentNetSales, priorNetSales) {
  if (!isFiniteNumber(currentNetSales) || !isFiniteNumber(priorNetSales) || priorNetSales === 0) {
    return null;
  }
  return (currentNetSales - priorNetSales) / priorNetSales;
}

export function returnOnEquity(netIncome, equity) {
  if (!isFiniteNumber(netIncome) || !isFiniteNumber(equity) || equity === 0) {
    return null;
  }
  return netIncome / equity;
}

/**
 * 有価証券報告書「経営指標等」に開示されるPERは (期末株価 ÷ 1株当たり当期純利益) で
 * 会社側が算出した値のため、EPSと組み合わせることで期末時点の株価を逆算できる。
 * これによりリアルタイム株価を取得せずにPBRを計算できる。
 */
export function estimatedStockPrice(per, eps) {
  if (!isFiniteNumber(per) || !isFiniteNumber(eps)) {
    return null;
  }
  return per * eps;
}

export function priceToBookRatio(price, bps) {
  if (!isFiniteNumber(price) || !isFiniteNumber(bps) || bps === 0) {
    return null;
  }
  return price / bps;
}

/**
 * 1社分の生データから、表示用の算出指標一式を計算する。
 * raw のフィールド:
 *   netSales, priorNetSales, operatingIncome, netIncome, equity, eps, bps, per
 */
export function computeCompanyMetrics(raw) {
  const margin = operatingMargin(raw.operatingIncome, raw.netSales);
  const growth = revenueGrowthRate(raw.netSales, raw.priorNetSales);
  const roe = returnOnEquity(raw.netIncome, raw.equity);
  const price = estimatedStockPrice(raw.per, raw.eps);
  const pbr = priceToBookRatio(price, raw.bps);

  return {
    operatingMargin: margin,
    revenueGrowthRate: growth,
    roe,
    estimatedStockPrice: price,
    pbr,
  };
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
