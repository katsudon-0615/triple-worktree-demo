## 1分チャンク化・内外監査の基盤（非課金・証拠必須）

この基盤は、作業を1分チャンクで強制タイムボックス化し、NDJSONログに証跡を残しつつ、層混在や手順逸脱を自動検出して非0で通知します。

### 主要コマンド

- 実行チャンク（60秒で強制終了・NDJSON追記）
  - `pnpm chunk:run "pnpm -v"`

- 任意イベントをNDJSON追記
  - PowerShell: `'{"id":"T-1","ts":"'+$(Get-Date -Format o)+'","actor":"you","layer":"fe","kind":"start","desc":"demo"}' | pnpm log:event`
  - Bash: `echo '{"id":"T-1","ts":"'$(date -Is)'","actor":"you","layer":"fe","kind":"start","desc":"demo"}' | pnpm log:event`

- 層ガード（Z_LAYER 混在検知）
  - `Z_LAYER=now node tools/guard_layer.js`

- 外部監査（WBSとログ突合）
  - `pnpm audit:ext`

### 生成物

- ログ: `logs/local/chunks.ndjson`, `logs/local/events.ndjson`, `logs/local/guard-layer.ndjson`, `logs/local/audit.ndjson`
- WBS: `workflows/wbs.json`（自由に編集可）

### 成否判定（DoD 抜粋）

- `node tools/run_chunk.js "pnpm -v"` が60秒以内に完了し、`logs/local/chunks.ndjson` に1行増える
- イベント追記の例が `logs/local/events.ndjson` に記録される
- `Z_LAYER` を `now` にした状態で `guard_layer.js` が OK を返す
- `node tools/audit_external.js` が `wbs.json` とログを読み、問題が無ければ 0 終了

### CI の流れ（GitHub Actions）

`z/**` への push または `main` への PR 時に自動で以下を実行します。

1) 左ゲート: `echo {} | pnpm gate:left`（非課金・層混在・トークン長）
2) テスト: `pnpm -s test:unit || echo "no unit tests"`、`pnpm -s test:e2e || echo "no e2e tests"`
3) ビルド: `pnpm -s build || echo "skipped build"`
4) 右ゲート: ダミーJSONをパイプしてスキーマ＋品質検証
5) 監査: `node tools/audit_external.js || echo "audit warnings"`


