# CI運用ハンドブック（PR運用・保護）

## PR作成手順（z/now/past/next → main）
1. 作業ブランチを作成（例: `z/past/feat-ci-dag`）
2. 変更をコミットし、リモートへ push（`git push -u origin <branch>`）
3. GitHub で `main` 宛の PR を作成
4. CI `build_test_audit` が緑か確認し、レビュー依頼（最低1承認）
5. 緑化・承認後にマージ（linear history 推奨）

## CIが赤のときの対応
- 失敗フェーズを特定（Left Gate / Test / Build / Right Gate / Audit）
- 差し戻し先の原則：該当フェーズの前段に戻す
- 1分/3分ルール：
  - 1分で原因仮説と最小修正を適用
  - 3分で緑化できなければ z/* に封じ込め、別PRで追跡

## ブランチ保護（main）
- Require a pull request before merging（1 approval）
- Require status checks to pass（`build_test_audit`）
- （任意）Require linear history
- Allow force pushes: Off

## 命名規則とレビューポイント
- 命名：`z/<layer>/<type>-<topic>`（例: `z/now/fix-hotpatch-xyz`）
- レビュー観点：
  - 非課金APIのみ（キーは `__DISABLED__`）
  - 証拠（ログ/生成物）を添付
  - `UNKNOWN=0`（右ゲート基準）を満たす
