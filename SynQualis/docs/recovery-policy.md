# Recovery Policy

- 2分チェック、3分超過は打切り再生成
- 復旧は `git restore/clean/reset` を用いる
- worktree ごとの再生成手順を補足

## 基本ルール
1. 実行状態を 2 分ごとに確認し、進捗が停滞していれば一時停止して原因切り分け
2. 3 分を超えても改善がなければ打切り、直前の正常状態へロールバック

## 復旧手順 (ローカル)
```bash
# 変更の巻き戻し（未コミット）
git restore .
# 生成物や未追跡を削除
git clean -fd
# HEAD を強制的に戻す
git reset --hard
```

## Worktree の再生成
```bash
# 不要な worktree を除去
git worktree list
# 確認後に remove
git worktree remove ../z/now || true
git worktree remove ../z/past || true
git worktree remove ../z/next || true

# 必要なら再作成
pwsh -NoProfile -ExecutionPolicy Bypass -File ./setup.ps1
```

## 参考: タイムアウトリカバリ（自動）
- `tools/recover.sh` を定期実行（CI/ローカル）して 3 分を超えるロックを検出したら復旧
