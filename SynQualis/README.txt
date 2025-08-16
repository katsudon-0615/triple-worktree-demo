3-worktree 並列開発ガイド (Windows / PowerShell)
=================================================

目的
- Git worktree を使って、同一リポジトリを main / feature/a / feature/b の 3 作業ツリーで安全に並列開発する
- 各ツリーはポート・環境変数・Cursor 設定を分離し、衝突を防止

成果物
- 3 つの作業ツリー: repo(=現在) / ../repo-feature-a / ../repo-feature-b
- 環境ファイル: .env, .env.dev-a, .env.dev-b
- package.json 追記済みスクリプト: dev:main / dev:a / dev:b
- .vscode/settings.json (衝突回避設定)
- setup.ps1 (一括ブートストラップ)

前提
- ここ (リポジトリ直下) で実行します
- Windows 11 / PowerShell 7 を使用
- Node.js とパッケージマネージャ (pnpm > yarn > npm) のいずれかがインストール済み
- 既存 main 作業ツリーが開いている状態

セットアップ手順
1) リポジトリ直下で以下を実行:
   pwsh -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1
   - ../z/now (ブランチ z/now)、../z/past (z/past)、../z/next (z/next) が作成されます
   - .env.now/.env.past/.env.next が生成され、Z_LAYER と PORT、外部APIキー(__DISABLED__)が設定されます
   - package.json に dev:now/dev:past/dev:next と LLM 起動スクリプトが追記されます
   - 最後に git worktree list が出力されます

2) スクリプトが行うこと:
   - git fetch --all --prune の実行
   - feature/a, feature/b ブランチの用意 (origin/main から)
   - worktree 追加: ../repo-feature-a, ../repo-feature-b
   - .env, .env.dev-a, .env.dev-b の作成/更新（PORT=3000/3001/3002）
   - フレームワーク (Next/Vite/Express) 自動判定 → package.json に dev スクリプトを追記
   - cross-env / dotenv-cli の導入（必要に応じて）
   - .vscode/settings.json （衝突回避設定）を各ツリーに配置
   - 依存インストール（3 ツリー分）
   - 3 本の dev を個別ウィンドウで起動（手動実行コマンドも表示）

ポート/起動コマンド（手動実行する場合）
- NOW:   cd ../z/now;  <pm> run dev:now   (PORT=3000)
- PAST:  cd ../z/past; <pm> run dev:past  (PORT=3001)
- NEXT:  cd ../z/next; <pm> run dev:next  (PORT=3002)

Cursor 衝突回避の既定 (.vscode/settings.json)
- files.autoSave = off
- editor.formatOnSave = false
- cursor.backgroundTasks.enabled = false

開発フロー（推奨）
- main: 安定ブランチ (レビュー済)
- feature/a: 機能 A の開発（作業ツリー A で実装）
- feature/b: 機能 B の開発（作業ツリー B で実装）
- 部分コミット推奨: 作業単位を小さくして PR 品質を上げる
- PR 手順: 各 feature/* → main へ PR。CI/レビュー後にマージ

クリーンアップ手順（不要になったら）
- dev 終了 → worktree を削除
  git worktree remove ../repo-feature-a
  git worktree remove ../repo-feature-b
- ブランチも不要であれば削除
  git branch -D feature/a
  git branch -D feature/b

トラブルシューティング
- cross-env/dotenv-cli が無い: setup.ps1 を再実行
- パッケージマネージャを変更したい: 先に pnpm を入れておくと自動優先されます
- .env.now/.env.past/.env.next が無い: setup.ps1 を再実行

Cursor 3 ウィンドウ運用（推奨）
- Desktop1(now) に ../z/now を開き UI/実装を主に作業
- Desktop2(past) に ../z/past を開き ログ・監査・比較を主に作業
- Desktop3(next) に ../z/next を開き 設計・検証を主に作業
- Alt+Tab は「今のデスクトップのみ」に設定、PowerToys FancyZones で UI/ログ分割を推奨

LLM 量子化と CPU オフロード
- 20B は Q4 量子化と CPU オフロード前提（8GB VRAM 環境など）
- ローカルのみで動作（外部APIキーは __DISABLED__）。必要に応じて hosts/FW で外部遮断

ライセンス/注意
- 本手順はローカル開発向けです。CI/CD には影響しません
- 生成物やポート番号は必要に応じて変更してください


ローカルLLM起動（非課金・ローカル限定）
-------------------------------------
- 推奨: 量子化 Q4、20B は CPU オフロード前提（8GB VRAM 目安）
- 既定はローカルのみ。外部APIは __DISABLED__。必要なら hosts/FW で遮断。
- 使い方（例）:
  - pnpm llm:mistral7b
  - pnpm llm:deepseek6
  - pnpm llm:llama3_8b
  - pnpm llm:qwen2_14b
  - pnpm llm:gptoss20b
- ログ: `logs/local/llm-<model>-<port>.ndjson`
