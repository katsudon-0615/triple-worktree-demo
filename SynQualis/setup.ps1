[CmdletBinding()]
param(
	[switch]$AutoInit,
	[switch]$VerboseMode
)
#requires -Version 7.0
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Info([string]$msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warn([string]$msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Ok([string]$msg)   { Write-Host "[OK]  $msg" -ForegroundColor Green }
function Fail([string]$msg) { Write-Error "[ERROR] $msg"; exit 1 }

function Ensure-Command([string]$cmd, [string]$friendly) {
	if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Fail "$friendly ($cmd) が見つかりません。インストールしてください。" }
}

function Detect-PM {
	if (Get-Command pnpm -ErrorAction SilentlyContinue) { return 'pnpm' }
	elseif (Get-Command yarn -ErrorAction SilentlyContinue) { return 'yarn' }
	elseif (Get-Command npm -ErrorAction SilentlyContinue) { return 'npm' }
	else { Fail 'パッケージマネージャ (pnpm|yarn|npm) が見つかりません。' }
}

function Read-Json([string]$path) {
	if (-not (Test-Path $path)) { return $null }
	try { return Get-Content $path -Raw | ConvertFrom-Json -Depth 100 } catch { Fail "JSON の読み込みに失敗しました: $path ($_ )" }
}

function Write-Json([object]$obj, [string]$path) {
	($obj | ConvertTo-Json -Depth 100) | Out-File -FilePath $path -Encoding utf8
}

function Ensure-Directory([string]$path) {
	if (-not (Test-Path $path)) { New-Item -ItemType Directory -Path $path | Out-Null }
}

function Set-Or-Replace-EnvVar([string]$filePath, [string]$key, [string]$value) {
	if (-not (Test-Path $filePath)) { New-Item -ItemType File -Path $filePath -Force | Out-Null }
	$content = Get-Content $filePath -Raw -ErrorAction SilentlyContinue
	if ($null -eq $content) { $content = '' }
	if ($content -match "(?m)^$([Regex]::Escape($key))=*") {
		$updated = [Regex]::Replace($content, "(?m)^$([Regex]::Escape($key))=.*$", "$key=$value")
	} else {
		$newline = if ($content.Trim().Length -gt 0) { "`r`n" } else { '' }
		$updated = $content + $newline + "$key=$value"
	}
	$updated | Out-File -FilePath $filePath -Encoding utf8
}

function Ensure-Branch([string]$branch, [string]$startPoint) {
	$exists = $false
	try { & git rev-parse --verify $branch 2>$null | Out-Null; $exists = $true } catch { $exists = $false }
	if (-not $exists) {
		& git branch $branch $startPoint | Out-Null
		Write-Ok "ブランチ作成: $branch ($startPoint)"
	} else { Write-Info "ブランチ存在: $branch" }
}

function Ensure-Worktree([string]$path, [string]$branch) {
	$worktrees = (& git worktree list --porcelain) -join "`n"
	if ($worktrees -match [Regex]::Escape($path)) { Write-Info "worktree 存在: $path"; return }
	& git worktree add $path $branch | Out-Null
	Write-Ok "worktree 追加: $path -> $branch"
}

function Ensure-CursorSettings([string]$root) {
	$vs = Join-Path $root '.vscode'
	Ensure-Directory $vs
	$settingsPath = Join-Path $vs 'settings.json'
	$settings = @{
		"files.autoSave" = "off"
		"editor.formatOnSave" = $false
		"cursor.backgroundTasks.enabled" = $false
	}
	if (Test-Path $settingsPath) {
		try { $existing = Get-Content $settingsPath -Raw | ConvertFrom-Json -Depth 100 } catch { $existing = @{} }
		foreach ($k in $settings.Keys) { $existing[$k] = $settings[$k] }
		Write-Json $existing $settingsPath
	} else { Write-Json $settings $settingsPath }
	Write-Ok ".vscode/settings.json 更新: $root"
}

function Ensure-LayerEnv([string]$filePath, [string]$layer, [string]$port) {
	$disabledKeys = @(
		'OPENAI_API_KEY','ANTHROPIC_API_KEY','AZURE_OPENAI_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY',
		'HUGGINGFACEHUB_API_TOKEN','HF_TOKEN','MISTRAL_API_KEY','COHERE_API_KEY','DEEPSEEK_API_KEY',
		'TOGETHER_API_KEY','XAI_API_KEY','GROQ_API_KEY','NVIDIA_API_KEY'
	)
	Set-Or-Replace-EnvVar $filePath 'Z_LAYER' $layer
	Set-Or-Replace-EnvVar $filePath 'PORT' $port
	foreach ($k in $disabledKeys) { Set-Or-Replace-EnvVar $filePath $k '__DISABLED__' }
}

function Ensure-DevScripts([string]$root) {
	$pkgPath = Join-Path $root 'package.json'
	$pkg = Read-Json $pkgPath
	if ($null -eq $pkg) { $pkg = [ordered]@{ name = "synqualis"; private = $true; version = "0.0.0"; scripts = @{}; devDependencies = @{} } }
	if ($null -eq $pkg.scripts) { $pkg | Add-Member -NotePropertyName scripts -NotePropertyValue @{} }
	if ($null -eq $pkg.devDependencies) { $pkg | Add-Member -NotePropertyName devDependencies -NotePropertyValue @{} }

	# Next.js 用の dev スクリプト（要件通りに固定）
	$pkg.scripts."dev:now"  = "cross-env NODE_ENV=development dotenv -e .env.now next dev"
	$pkg.scripts."dev:past" = "cross-env NODE_ENV=development dotenv -e .env.past next dev"
	$pkg.scripts."dev:next" = "cross-env NODE_ENV=development dotenv -e .env.next next dev"

	# ローカル LLM 起動スクリプト（要件通り）
	$pkg.scripts."llm:mistral7b" = "ollama serve --port 11434 & exit 0"
	$pkg.scripts."llm:deepseek6"  = "node tools/start_local.js deepseek-coder-6.7b 11435"
	$pkg.scripts."llm:llama3_8b"  = "node tools/start_local.js llama-3.1-8b 11436"
	$pkg.scripts."llm:qwen2_14b"  = "node tools/start_local.js qwen2-14b 11438"
	$pkg.scripts."llm:gptoss20b"  = "node tools/start_local.js gpt-oss-20b 11439 --quant q4 --cpu-offload"

	# devDependencies の確保
	if (-not ($pkg.devDependencies.PSObject.Properties.Name -contains 'cross-env')) { $pkg.devDependencies.'cross-env' = "^7.0.3" }
	if (-not ($pkg.devDependencies.PSObject.Properties.Name -contains 'dotenv-cli')) { $pkg.devDependencies.'dotenv-cli' = "^7.4.2" }

	Write-Json $pkg $pkgPath
	Write-Ok "package.json スクリプト/依存を更新: $root"
}

function PM-Install([string]$pm, [string]$cwd) {
	Push-Location $cwd
	try {
		switch ($pm) {
			'pnpm' { & pnpm install --frozen-lockfile --prefer-offline }
			'yarn' { & yarn install --frozen-lockfile }
			'npm'  { & npm install --no-audit --fund=false }
		}
		Write-Ok "依存インストール完了: $cwd ($pm)"
	} finally { Pop-Location }
}

function PM-AddDev([string]$pm, [string]$cwd, [string[]]$pkgs) {
	if ($pkgs.Count -eq 0) { return }
	Push-Location $cwd
	try {
		switch ($pm) {
			'pnpm' { & pnpm add -D @pkgs }
			'yarn' { & yarn add -D @pkgs }
			'npm'  { & npm install -D @pkgs --no-audit --fund=false }
		}
		Write-Ok "devDependencies 追加: $($pkgs -join ', ') in $cwd"
	} finally { Pop-Location }
}

# ===== 前提チェック =====
Ensure-Command git 'Git'
Ensure-Command node 'Node.js'
Write-Info (& git --version)
Write-Info (& node --version)
$pm = Detect-PM
Write-Info "Package Manager: $pm"

# Git ルート検出 / 必要なら初期化
$gitRoot = $null
try { $gitRoot = (& git rev-parse --show-toplevel 2>$null).Trim() } catch { $gitRoot = $null }
if (-not $gitRoot) {
	if ($AutoInit) {
		Write-Info 'Git リポジトリが見つかりません。ここで初期化します。'
		& git init | Out-Null
		& git add -A | Out-Null
		& git -c user.name='auto' -c user.email='auto@local' commit -m 'init' | Out-Null
		$gitRoot = (& git rev-parse --show-toplevel 2>$null).Trim()
	} else {
		Fail 'Git リポジトリ直下で実行してください。もしくは -AutoInit を指定してください。'
	}
}
if ((Get-Location).Path -ne $gitRoot) { Write-Info "Git ルートへ移動: $gitRoot"; Set-Location $gitRoot }

# 基準リビジョン: origin/main 優先、無ければ HEAD
$baseRef = 'HEAD'
try { $r = (& git ls-remote --heads origin main 2>$null); if ($r -and $r.Trim().Length -gt 0) { $baseRef = 'origin/main' } } catch {}
Write-Info "Base ref: $baseRef"

# ===== 最新化 =====
Write-Info 'git fetch --all --prune 実行'
& git fetch --all --prune | Out-Null

# ===== ブランチ/ワークツリー =====
$repoRoot = (Get-Location).Path
$parent = Split-Path -Parent $repoRoot
$layersRoot = Join-Path $parent 'z'
Ensure-Directory $layersRoot
$pathNow  = Join-Path $layersRoot 'now'
$pathPast = Join-Path $layersRoot 'past'
$pathNext = Join-Path $layersRoot 'next'

Ensure-Branch 'z/now'  $baseRef
Ensure-Branch 'z/past' $baseRef
Ensure-Branch 'z/next' $baseRef
Ensure-Worktree $pathNow  'z/now'
Ensure-Worktree $pathPast 'z/past'
Ensure-Worktree $pathNext 'z/next'

# ===== 環境ファイル =====
Ensure-LayerEnv '.env.now'  'now'  '3000'
Ensure-LayerEnv '.env.past' 'past' '3001'
Ensure-LayerEnv '.env.next' 'next' '3002'
# 各 worktree にも配置
Copy-Item -Path '.env.now'  -Destination (Join-Path $pathNow  '.env.now')  -Force
Copy-Item -Path '.env.past' -Destination (Join-Path $pathPast '.env.past') -Force
Copy-Item -Path '.env.next' -Destination (Join-Path $pathNext '.env.next') -Force

# ===== package.json スクリプト整備 =====
Ensure-DevScripts $repoRoot
Copy-Item -Path (Join-Path $repoRoot 'package.json') -Destination (Join-Path $pathPast 'package.json') -Force
Copy-Item -Path (Join-Path $repoRoot 'package.json') -Destination (Join-Path $pathNext 'package.json') -Force
Copy-Item -Path (Join-Path $repoRoot 'package.json') -Destination (Join-Path $pathNow  'package.json') -Force

# ===== Cursor 衝突回避設定 =====
Ensure-CursorSettings $repoRoot
Ensure-CursorSettings $pathNow
Ensure-CursorSettings $pathPast
Ensure-CursorSettings $pathNext

# ===== 依存導入 =====
$devPkgs = @('cross-env','dotenv-cli')
PM-AddDev $pm $repoRoot $devPkgs
PM-Install $pm $repoRoot
PM-AddDev $pm $pathNow  $devPkgs
PM-Install $pm $pathNow
PM-AddDev $pm $pathPast $devPkgs
PM-Install $pm $pathPast
PM-AddDev $pm $pathNext $devPkgs
PM-Install $pm $pathNext

# ===== git worktree list 出力 =====
Write-Host ''
Write-Ok 'worktree 一覧:'
& git worktree list

# ===== 起動ヘルパー（任意） =====
function Start-Dev([string]$cwd, [string]$script) {
	$cmd = switch ($pm) { 'pnpm' { "pnpm run $script" } 'yarn' { "yarn $script" } 'npm' { "npm run $script" } }
	Start-Process -FilePath pwsh -ArgumentList @('-NoExit','-NoLogo','-Command', $cmd) -WorkingDirectory $cwd -WindowStyle Normal | Out-Null
}

Write-Host ''
Write-Ok '起動コマンド（手動実行用）:'
Write-Host "[NOW]   cd `"$pathNow`";  $pm run dev:now"
Write-Host "[PAST]  cd `"$pathPast`"; $pm run dev:past"
Write-Host "[NEXT]  cd `"$pathNext`"; $pm run dev:next"

Write-Host ''
Write-Ok 'セットアップ完了。'


