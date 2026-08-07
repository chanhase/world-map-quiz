import { formatYenOku, formatPercent, formatRatio, formatYen0 } from "./format.mjs";

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statusBadge(status) {
  if (status === "ok") return "";
  if (status === "partial") return '<span class="status-badge status-partial">一部データ欠落</span>';
  return '<span class="status-badge status-error">データ取得エラー</span>';
}

function companyRow(company) {
  const c = company.computed ?? {};
  const r = company.raw ?? {};
  const hasData = company.status === "ok" || company.status === "partial";

  return `
      <tr data-seccode="${escapeHtml(company.secCode)}">
        <th scope="row" class="col-name">
          <span class="company-name">${escapeHtml(company.name)}</span>
          <span class="company-code">${escapeHtml(company.secCode)}</span>
          ${statusBadge(company.status)}
        </th>
        <td class="col-market">${escapeHtml(company.market ?? "—")}</td>
        <td class="col-period">${escapeHtml(company.fiscalYearLabel ?? "—")}</td>
        <td class="col-num" data-metric="netSales">${hasData ? formatYenOku(r.netSales) : "—"}</td>
        <td class="col-num" data-metric="operatingIncome">${hasData ? formatYenOku(r.operatingIncome) : "—"}</td>
        <td class="col-num" data-metric="operatingMargin">${hasData ? formatPercent(c.operatingMargin) : "—"}</td>
        <td class="col-num" data-metric="revenueGrowthRate">${hasData ? formatPercent(c.revenueGrowthRate) : "—"}</td>
        <td class="col-num" data-metric="roe">${hasData ? formatPercent(c.roe) : "—"}</td>
        <td class="col-num" data-metric="per">${hasData ? formatRatio(r.per) : "—"}</td>
        <td class="col-num" data-metric="pbr">${hasData ? formatRatio(c.pbr) : "—"}</td>
        <td class="col-num col-muted" data-metric="estimatedStockPrice">${hasData ? formatYen0(c.estimatedStockPrice) : "—"}</td>
      </tr>`;
}

function commentSection(comment) {
  if (!comment || !comment.text) {
    return `<p class="comment-placeholder">業界内比較コメントは次回のデータ更新時に生成されます。</p>`;
  }
  const paragraphs = comment.text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n      ");
  return `${paragraphs}
      <p class="comment-meta">生成日時: ${escapeHtml(comment.generatedAt ?? "—")} / モデル: ${escapeHtml(comment.model ?? "—")}</p>`;
}

export function renderTelecomPage({ industry, generatedAt, companies }, comment) {
  const rows = companies.map(companyRow).join("\n");
  const updatedLabel = generatedAt ? new Date(generatedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>通信業 財務比較（スタンダード・グロース市場） | 日本株 業界別財務比較</title>
<meta name="description" content="東証スタンダード・グロース市場に上場する通信業企業の売上高・営業利益率・増収率・ROE・PER・PBRを横並びで比較できる無料サイトです。投資助言ではなく情報提供が目的です。">
<link rel="stylesheet" href="./style.css">
</head>
<body>
<header class="site-header">
  <p class="site-title"><a href="./index.html">日本株 業界別財務比較（β）</a></p>
  <nav class="site-nav">
    <a href="./index.html">トップ</a>
    <a href="./disclaimer.html">免責事項</a>
  </nav>
</header>

<main class="page">
  <h1>通信業 財務比較<span class="market-scope">（東証スタンダード・グロース市場）</span></h1>
  <p class="lead">
    東証スタンダード市場・グロース市場に上場する通信業関連企業の、直近の有価証券報告書に基づく主要財務指標を比較できます。
    プライム市場の企業は対象外です。数値は金融庁 EDINET の開示データから機械的に算出しています。
  </p>
  <p class="disclaimer-inline">
    ※ 本ページは情報提供・比較を目的としたものであり、特定銘柄の売買を推奨するものではありません。詳しくは<a href="./disclaimer.html">免責事項</a>をご覧ください。
  </p>

  <div class="table-scroll">
    <table class="compare-table">
      <caption class="sr-only">通信業 財務指標比較表</caption>
      <thead>
        <tr>
          <th scope="col" class="col-name">企業名</th>
          <th scope="col" class="col-market">市場区分</th>
          <th scope="col" class="col-period">決算期</th>
          <th scope="col" class="col-num">売上高</th>
          <th scope="col" class="col-num">営業利益</th>
          <th scope="col" class="col-num">営業利益率</th>
          <th scope="col" class="col-num">増収率(前年比)</th>
          <th scope="col" class="col-num">ROE</th>
          <th scope="col" class="col-num">PER</th>
          <th scope="col" class="col-num">PBR</th>
          <th scope="col" class="col-num col-muted">参考: 期末株価(逆算)</th>
        </tr>
      </thead>
      <tbody>${rows}
      </tbody>
    </table>
  </div>

  <section class="ai-comment">
    <h2>業界内比較コメント</h2>
    ${commentSection(comment)}
    <p class="ai-comment-note">
      このコメントはAI(Claude)が、上表の算出済み指標のみをもとに、決算データ更新時にのみ自動生成しています。
      閲覧のたびにAIを呼び出す仕組みではありません。投資助言ではなく、指標の違いを客観的に説明するものです。
    </p>
  </section>

  <p class="updated-at">最終更新: ${escapeHtml(updatedLabel)}（データ出典: <a href="https://disclosure2dl.edinet-fsa.go.jp/" rel="noopener noreferrer" target="_blank">金融庁 EDINET</a>）</p>
</main>

<footer class="site-footer">
  <p><a href="./disclaimer.html">免責事項</a></p>
</footer>
</body>
</html>
`;
}
