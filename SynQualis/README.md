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
- GitHub Actions `.github/workflows/dag.yml` を追加
- pipeline 手順: gate:left → test:unit → test:e2e → build → gate:right → audit_external
- gate/right/audit が失敗した場合、ジョブは fail（失敗ブランチは z/past へ差し戻しの方針）

## CIパイプライン

本リポジトリは GitHub Actions により、ゲート＆監査を含むDAG型パイプラインを実行します。

- トリガ:
  - `push` と `pull_request`（`main` と `z/**` ブランチ）
  - 手動実行 `workflow_dispatch`
- バッジ:（Actions 作成後に自動表示されます）
- 主要ステップ:
  1. `pnpm gate:left`
  2. `pnpm test:unit`（存在する場合のみ）
  3. `pnpm test:e2e`（存在する場合のみ）
  4. `pnpm build`（存在する場合のみ）
  5. `pnpm gate:right`
  6. `node tools/audit_external.js`
- 失敗時の扱い:
  - いずれかのステップが失敗した場合、ジョブは `fail`
  - 運用詳細は `docs/ci-handbook.md` を参照（z/past への封じ込め、3分ルールでの再構築）

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

## ブランチ保護

- 対象: `main`
- 設定例（GitHub → Settings → Branches → Branch protection rules）
  - Require a pull request before merging（最低 1 承認）
  - Require status checks to pass（`build_test_audit` を必須に）
  - （任意）Require linear history
  - Allow force pushes: Off

## PR運用

- フロー: `z/now`/`z/past`/`z/next` → `main` に対して PR を作成
- チェックポイント:
  - 非課金APIのみ（キーは `__DISABLED__`）
  - 証拠（ログ/出力）を添付
  - `UNKNOWN=0` を満たすこと（右ゲート基準）
  - CI が緑（`build_test_audit`）であること

## 運用早見表

- Default/保護ブランチ: `main`（直push不可、PR+CI必須）
- 作業: `z/now` / `z/past` / `z/next`
- CI: `.github/workflows/dag.yml` → 必須チェック `build_test_audit`
- 基本手順:
  1) 作業ブランチ更新 → PR (to main)
  2) Actions 成功を確認
  3) マージ
