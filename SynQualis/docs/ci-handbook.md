# CI運用ハンドブック

本書は、ゲート＆監査をCIに統合した際の失敗時対応・再構築手順をまとめた運用メモです。z/past ブランチ系へ封じ込め、3分ルールでの迅速な復旧を徹底します。

## 基本方針
- 逸脱（Gate/Audit失敗やテスト失敗）は検知即時に封じ込める
- 失敗原因の特定と再現最小化（ログ・ジョブID・コミットID）
- 3分ルール：3分以内に再構築（ロールバック or 最小修正）を完了
- main への取り込みは常にグリーンのみ

## 失敗時の共通チェックリスト（60秒）
1. Actions 画面で失敗ステップのログを確認（Gate Left/Right、Audit、Test、Build）
2. SynQualis/tools/*.js の該当ツールが正常かをローカルで再現（例: `node tools/audit_external.js`）
3. `pnpm install` の警告やロックファイル差分を確認
4. 直近コミット差分を確認（設定ファイル、スクリプトの変更有無）
5. `Z_LAYER` 等の環境変数・前提条件の崩れがないか確認

## ローカル再現と封じ込め（z/past）
- ローカルで以下の順に実行し、失敗箇所を特定
  - `pnpm gate:left && pnpm -r run test:unit --if-present && pnpm -r run test:e2e --if-present && pnpm -r run build --if-present && pnpm gate:right && node tools/audit_external.js`
- 再現した場合：修正コミットを z/past/* に積み、PRで検証
- 再現しない場合：キャッシュクリア、依存パージ後に再試行
  - `pnpm store prune && rm -rf node_modules && pnpm install`

## 再構築の3分ルール
- 1分：原因仮説の特定（どのステップで、どの前提が崩れたか）
- 1分：最小修正またはロールバック案の適用
- 1分：再実行と結果確認（CI・ローカル両方）
- 3分で緑化できない場合：一旦ロールバックして封じ込め、別ブランチで原因追跡

## 代表的な失敗パターンと対処
- Gate失敗：guard_layer.js の検証不一致 → Z_LAYER と実レイヤの定義見直し
- Test失敗：テストスクリプト未整備 → `--if-present` でCIは継続、整備は別PRで
- Build失敗：環境差異・依存競合 → lock更新かバージョン固定、`pnpm store prune`
- Audit失敗：外部監査の差分検出 → WBS/ログの同期、除外規則の見直し

## 付録：CI構成の要点
- ワークディレクトリ：SynQualis
- 主要コマンド：`pnpm gate:left` / `pnpm gate:right`、`node tools/audit_external.js`
- `pnpm run test:unit|test:e2e|build` は `--if-present` で存在時のみ実行
- いずれかのステップが失敗すればジョブは失敗

---

## PR作成手順（z/now/past/next → main）
1. 作業ブランチ（例: `z/past/feature-xxx`）で変更をコミット
2. `origin` へ push（例: `git push -u origin z/past/feature-xxx`）
3. GitHub 上で `main` 宛に PR を作成
4. CI（`build_test_audit`）が完了するまで待機し、レビュー依頼
5. 最低 1 承認後、Squash or Merge（linear history を推奨）

## CIが赤のときの対応
- どのフェーズで失敗したかを特定（Left Gate / Test / Build / Right Gate / Audit）
- 対応ポリシー：該当フェーズへ差し戻し＋1分/3分ルール
  - 1分：原因仮説の特定と最小修正
  - 3分：緑化できなければ z/* に封じ込め、別PRで追跡

## ブランチ命名規則とレビューポイント
- 命名規則：`z/<layer>/<type>-<topic>`（例: `z/past/feat-ci-dag`）
- レビュー観点：
  - 非課金（外部APIキーは `__DISABLED__`）
  - 証拠（ログ/スクショ/生成物）を提示
  - `UNKNOWN=0`（右ゲート基準）を満たす
  - 逸脱は z/past へ封じ込め、復旧手順の明記
