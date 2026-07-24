# 🌍 世界地図 — 国名暗記ツール

白地図をクリックして国名を覚えるシンプルなツールです。GitHub Pages で即デプロイできます。

## 機能

- **クリックで国名表示** — 日本語 + 英語で表示
- **訪問済みマーク** — クリック済みの国は緑色に変化、`localStorage` で記憶
- **進捗バー** — 上部に全177カ国中の達成率を表示
- **ズーム & パン** — マウスホイール / ピンチ or ボタンで操作
- **全国制覇** — 全カ国クリックするとお祝いメッセージ
- **リセット** — 履歴をクリアして最初からやり直し

## ファイル構成

```
world-map-quiz/
├── index.html          # メインページ（D3.js使用）
├── translations.js     # 国名 英語→日本語 翻訳マップ
├── world.geojson       # 国境データ（Natural Earth / D3 gallery）
└── README.md
```

## ローカル確認方法

`file://` では CORS 制限が出る場合があるため、簡易サーバーを立ち上げてください。

```bash
# Python 3
python3 -m http.server 8000
# → http://localhost:8000
```

## GitHub Pages へのデプロイ

1. このフォルダの内容を GitHub リポジトリのルート（または `docs/` フォルダ）に push
2. リポジトリ **Settings → Pages** で Source を `main` ブランチの `/ (root)` または `/docs` に設定
3. 数分後に `https://<username>.github.io/<repo>/` で公開完了

## 使用ライブラリ & データ

| 項目 | 内容 |
|------|------|
| 地図描画 | [D3.js v7](https://d3js.org/) （CDN） |
| 地図データ | [Natural Earth / D3 graph gallery](https://github.com/holtzy/D3-graph-gallery) `world.geojson` |
| フォント | システムフォント（追加ライブラリ不要） |

## カスタマイズ

- **色を変えたい** → `index.html` の `:root` CSS 変数を編集
- **国名翻訳を修正したい** → `translations.js` の対応テーブルを編集
- **南極を表示したい** → `initMap()` 内の `.filter(d => d.properties.name !== 'Antarctica')` を削除
