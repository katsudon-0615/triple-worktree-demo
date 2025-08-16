# フェーズ4〜6 自動化ガイド

本リポジトリには、監査・CI統合・リカバリの自動化が含まれます。以下は利用方法の要点です。

## フェーズ4（監査）
- チャンク実行（60秒タイムアウト）
```bash
node tools/run_chunk.js "pnpm build"
```
- 任意イベントのログ追記
```bash
echo '{"event":"test","ts":123}' | node tools/log_event.js
```
- レイヤーガード（Z_LAYERの突合）
```bash
node tools/guard_layer.js
```
- 外部監査（WBS/ログ突合）
```bash
node tools/audit_external.js
```

## フェーズ5（CI統合）
- GitHub Actions `.github/workflows/dag.yml` を追加済み
- pipeline 手順: gate:left → test:unit → test:e2e → build → gate:right → audit_external
- gate/right/audit が失敗した場合、ジョブは fail（失敗ブランチは z/past へ差し戻しの方針）

## フェーズ6（リカバリ）
- ドキュメント: `docs/recovery-policy.md`
- スクリプト: `tools/recover.sh`

### 実行例
- 左ゲート→処理→右ゲート
```bash
pnpm gate:left && pnpm build && pnpm gate:right
```
- リカバリ
```bash
bash tools/recover.sh
```
