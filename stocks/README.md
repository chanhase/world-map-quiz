# 日本株 業界別財務比較（β）

東証スタンダード市場・グロース市場に上場する企業を対象に、業界内で複数企業の主要な財務指標を横並びで比較できる無料サイトです。
投資助言ではなく、あくまで情報提供・比較を目的としています。

v1のスコープは **通信業のみ**（7社。将来的に10〜20社程度・複数業界へ拡張予定）で、プライム市場の企業は対象外です。

## 重要: 企業リストについて（要確認）

`data/telecom/companies.json` に含まれる企業リストは、開発時点(2026年8月)の一般的な知識をもとにした初期候補です。
**この開発セッションではEDINET・JPX・株式情報サイトへのネットワークアクセスが環境の制約でブロックされていたため、
証券コード・市場区分(スタンダード/グロース)の最終確認ができていません。**

そのための安全策として:

- `scripts/verify-companies.mjs` が、実際にEDINETへ提出された書類の企業名と `companies.json` の企業名を突き合わせ、
  不一致・未検出があればワークフローを失敗させます(証券コードの誤りによる「別会社のデータ表示」を防止)。
- ただし **市場区分(スタンダード/グロース)はEDINETからは判定できません**。JPX(日本取引所グループ)の上場会社一覧等で
  必ず確認し、プライム市場の企業が含まれていないか、また対象を10〜20社に広げる際は事前にご確認ください。

## アーキテクチャ

```
stocks/
├── index.html / disclaimer.html / style.css   … 手書きの静的ページ
├── telecom.html                                 … 生成される比較ページ(スクリプトが上書き)
├── data/telecom/
│   ├── companies.json      … 対象企業リスト(手動メンテナンス)
│   ├── metrics.json         … EDINETから算出した指標(生成物)
│   ├── comments.json        … AI生成コメント(生成物)
│   └── .filing-index-cache.json … EDINET書類一覧の走査キャッシュ(生成物、増分更新のためコミットする)
├── scripts/
│   ├── lib/
│   │   ├── edinetClient.mjs   … EDINET API v2 ラッパー、書類インデックス構築
│   │   ├── filingIndexStore.mjs … 書類インデックスの増分キャッシュ
│   │   ├── xbrlCsv.mjs         … XBRL→CSV(type=5)のパーサ
│   │   ├── metrics.mjs         … 指標算出ロジック(純粋関数、四則演算のみ)
│   │   ├── format.mjs          … 表示用フォーマッタ
│   │   └── render.mjs          … 静的HTML生成
│   ├── verify-companies.mjs  … 企業リストの正確性チェック
│   ├── fetch-and-compute.mjs … EDINET取得→指標算出→metrics.json書き出し
│   ├── generate-comments.mjs … Claudeで比較コメント生成→comments.json書き出し
│   └── render-site.mjs       … metrics.json + comments.json → telecom.html
└── tests/
    └── metrics.test.mjs      … 算出ロジック・表示値の整合性テスト
```

### データの流れ(決算更新時のみ実行)

1. `verify-companies` … 証券コードと企業名の整合性チェック
2. `fetch-and-compute` … EDINETから直近の有価証券報告書(CSV形式)を取得し、売上高・営業利益等の生データから
   営業利益率・増収率・ROE・PBR等を**四則演算のみ**で算出
3. `npm test` … 算出ロジックの自動テスト(表示予定の数値が実際に `営業利益 ÷ 売上高` 等と一致するかを検証)
4. `generate-comments` … 算出済みの数値のみをClaudeに渡し、業界内比較コメントを生成(**指標に変更があった場合のみ実行**。
   訪問者がページを見るたびにAIを呼ぶことはない)
5. `render-site` … 静的HTML(`telecom.html`)を生成

### PER・PBR・株価について

有価証券報告書の「経営指標等」には、会社が期末株価をもとに算出したPER(株価収益率)が既に開示されています。
本サービスはそのPERとEPS(1株当たり当期純利益)から期末時点の株価を逆算し(`株価 = PER × EPS`)、
BPS(1株当たり純資産額)と組み合わせてPBRを算出しています。そのため **リアルタイムの株価取得は行っていません**
(スコープ外の要件を満たしつつPBRを算出する設計)。

## セットアップ

### 必要なGitHub Secrets

| Secret名 | 用途 |
|---|---|
| `EDINET_SUBSCRIPTION_KEY` | EDINET API v2 の利用登録で発行されるサブスクリプションキー(無料) |
| `ANTHROPIC_API_KEY` | Claude API キー(比較コメント生成用) |

### ローカルでの実行

```bash
cd stocks
npm install

export EDINET_SUBSCRIPTION_KEY=xxxx
export ANTHROPIC_API_KEY=xxxx

npm run verify-companies   # 企業リストの検証
npm run fetch-and-compute  # データ取得・指標算出
npm test                   # 整合性テスト
npm run generate-comments  # AIコメント生成(任意、指標に変更がある場合)
npm run render-site        # 静的HTML生成

# まとめて実行
npm run update-all
```

### GitHub Actionsでの自動実行

`.github/workflows/stocks-update.yml` が毎月1日(JST)に自動実行され、`workflow_dispatch` から手動実行も可能です。
指標データに変更がない場合はAI呼び出し(コスト発生箇所)をスキップします。

## テスト方針(精度担保)

`tests/metrics.test.mjs` では以下を機械的に検証しています。

- 営業利益率・増収率・ROE・PBR等の算出関数が、四則演算の定義式と厳密に一致すること
- 欠損データがあっても数値を捏造せず `null` を返すこと
- EDINETのCSV(UTF-16LE, タブ区切り)を正しくパースし、連結決算のデータが個別決算より優先されること
- **実際に生成・表示されるHTML上の数値**(パーセント表示・倍率表示)を文字列から数値に戻し、生データからの
  再計算値と一致すること(表示バグの検出)
- AIコメントに「買うべき」「割安」等の断定的な推奨表現が含まれていないこと
- コミットされた `metrics.json` が存在する場合、その全社の数値が算出ロジックの再計算結果と一致すること(回帰テスト)

## スコープ外(v1)

- プライム市場の企業
- ユーザーアカウント
- リアルタイム株価
- 複数業界への対応(まずは通信業のみ)
