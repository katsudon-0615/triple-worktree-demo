# CI Handbook

- 必須チェック: DAG Pipeline / build_test_audit (push / pull_request)
- ワークフロー: .github/workflows/dag.yml

## ローカル確認
pnpm install
pnpm gate:left
pnpm test:unit
pnpm test:e2e
pnpm build
pnpm gate:right
node tools/audit_external.js
