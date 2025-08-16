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
    try {
        return Get-Content $path -Raw | ConvertFrom-Json -Depth 100
    } catch {
        Fail "JSON の読み込みに失敗しました: $path ($_ )"
    }
}

function Write-Json([object]$obj, [string]$path) {
    $json = $obj | ConvertTo-Json -Depth 100
    $json | Out-File -FilePath $path -Encoding utf8
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
    } else {
        Write-Info "ブランチ存在: $branch"
    }
}

function Ensure-Worktree([string]$path, [string]$branch) {
    $worktrees = (& git worktree list --porcelain) -join "`n"
    if ($worktrees -match [Regex]::Escape((Resolve-Path -LiteralPath (Split-Path -Path $path -Parent) -ErrorAction SilentlyContinue))) { }
    if ($worktrees -match [Regex]::Escape($path)) {
        Write-Info "worktree 存在: $path"
        return
    }
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
        try {
            $existing = Get-Content $settingsPath -Raw | ConvertFrom-Json -Depth 100
        } catch { $existing = @{} }
        foreach ($k in $settings.Keys) { $existing[$k] = $settings[$k] }
        Write-Json $existing $settingsPath
    } else {
        Write-Json $settings $settingsPath
    }
    Write-Ok ".vscode/settings.json 更新: $root"
}

function Ensure-DevScripts([string]$root, [bool]$needsDotenvCli) {
    $pkgPath = Join-Path $root 'package.json'
    $pkg = Read-Json $pkgPath
    if ($null -eq $pkg) { $pkg = [ordered]@{ name = "synqualis"; private = $true; version = "0.0.0"; scripts = @{}; devDependencies = @{} } }

    if ($null -eq $pkg.scripts) { $pkg | Add-Member -NotePropertyName scripts -NotePropertyValue @{} }
    if ($null -eq $pkg.devDependencies) { $pkg | Add-Member -NotePropertyName devDependencies -NotePropertyValue @{} }

    $deps = @{}
    $deps += @($pkg.dependencies | Get-Member -MemberType NoteProperty | ForEach-Object { $_.Name })
    $devDeps = @{}
    $devDeps += @($pkg.devDependencies | Get-Member -MemberType NoteProperty | ForEach-Object { $_.Name })

    $hasNext   = $deps -contains 'next' -or $devDeps -contains 'next'
    $hasVite   = $deps -contains 'vite' -or $devDeps -contains 'vite'
    $hasExpress= $deps -contains 'express' -or $devDeps -contains 'express'
    $hasNodemon= $devDeps -contains 'nodemon'

    $scriptMain = ''
    $scriptA = ''
    $scriptB = ''

    if ($hasVite) {
        $scriptMain = "vite --port 3000 --mode development"
        $scriptA = "vite --port 3001 --mode dev-a"
        $scriptB = "vite --port 3002 --mode dev-b"
        $needsDotenvCli = $false
    } elseif ($hasNext) {
        if ($needsDotenvCli) {
            $scriptMain = "next dev -p 3000"
            $scriptA = "dotenv -e .env.dev-a -- next dev -p 3001"
            $scriptB = "dotenv -e .env.dev-b -- next dev -p 3002"
        } else {
            $scriptMain = "next dev -p 3000"
            $scriptA = "cross-env PORT=3001 next dev -p 3001"
            $scriptB = "cross-env PORT=3002 next dev -p 3002"
        }
    } elseif ($hasExpress) {
        $entry = 'server.js'
        if ($pkg.scripts.PSObject.Properties.Name -contains 'start' -and ($pkg.scripts.start -match 'node\s+([^\s]+\.m?js)')) { $entry = $Matches[1] }
        if ($hasNodemon) {
            if ($needsDotenvCli) {
                $scriptMain = "dotenv -e .env -- nodemon $entry"
                $scriptA = "dotenv -e .env.dev-a -- nodemon $entry"
                $scriptB = "dotenv -e .env.dev-b -- nodemon $entry"
            } else {
                $scriptMain = "cross-env PORT=3000 nodemon $entry"
                $scriptA = "cross-env PORT=3001 nodemon $entry"
                $scriptB = "cross-env PORT=3002 nodemon $entry"
            }
        } else {
            if ($needsDotenvCli) {
                $scriptMain = "dotenv -e .env -- node $entry"
                $scriptA = "dotenv -e .env.dev-a -- node $entry"
                $scriptB = "dotenv -e .env.dev-b -- node $entry"
            } else {
                $scriptMain = "cross-env PORT=3000 node $entry"
                $scriptA = "cross-env PORT=3001 node $entry"
                $scriptB = "cross-env PORT=3002 node $entry"
            }
        }
    } else {
        # フレームワーク不明: Next 互換の形で生成
        $scriptMain = "next dev -p 3000"
        $scriptA = "dotenv -e .env.dev-a -- next dev -p 3001"
        $scriptB = "dotenv -e .env.dev-b -- next dev -p 3002"
        $needsDotenvCli = $true
    }

    $pkg.scripts."dev:main" = $scriptMain
    $pkg.scripts."dev:a"    = $scriptA
    $pkg.scripts."dev:b"    = $scriptB

    if (-not ($pkg.devDependencies.PSObject.Properties.Name -contains 'cross-env')) { $pkg.devDependencies.'cross-env' = "^7.0.3" }
    if ($needsDotenvCli -and -not ($pkg.devDependencies.PSObject.Properties.Name -contains 'dotenv-cli')) { $pkg.devDependencies.'dotenv-cli' = "^7.4.2" }

    Write-Json $pkg $pkgPath
    Write-Ok "package.json スクリプト/依存を更新: $root"

    return $needsDotenvCli
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

if (-not (Test-Path '.git')) { Fail 'このスクリプトは Git リポジトリ直下で実行してください (.git が見つかりません)。' }

# ===== 最新化 =====
Write-Info 'git fetch --all --prune 実行'
& git fetch --all --prune | Out-Null

# ===== ブランチ/ワークツリー =====
$repoRoot = (Get-Location).Path
$parent = Split-Path -Parent $repoRoot
$pathA = Join-Path $parent 'repo-feature-a'
$pathB = Join-Path $parent 'repo-feature-b'

Ensure-Branch 'feature/a' 'HEAD'
Ensure-Branch 'feature/b' 'HEAD'
Ensure-Worktree $pathA 'feature/a'
Ensure-Worktree $pathB 'feature/b'

# ===== .env 分離 =====
if (-not (Test-Path '.env')) {
	Write-Warn '.env が存在しません。テンプレートを作成します。'
	@(
		'# Base env file (auto-generated)',
		'PORT=3000'
	) | Out-File -FilePath '.env' -Encoding utf8
}
Set-Or-Replace-EnvVar '.env' 'PORT' '3000'
Set-Or-Replace-EnvVar '.env.dev-a' 'PORT' '3001'
Set-Or-Replace-EnvVar '.env.dev-b' 'PORT' '3002'
# 各 worktree 配下にも配置
Copy-Item -Path '.env' -Destination (Join-Path $pathA '.env') -Force
Copy-Item -Path '.env' -Destination (Join-Path $pathB '.env') -Force
Set-Or-Replace-EnvVar (Join-Path $pathA '.env.dev-a') 'PORT' '3001'
Set-Or-Replace-EnvVar (Join-Path $pathB '.env.dev-b') 'PORT' '3002'

# ===== package.json スクリプト整備（フレームワーク自動判定） =====
$needsDotenvCliMain = Ensure-DevScripts $repoRoot $true
Copy-Item -Path (Join-Path $repoRoot 'package.json') -Destination (Join-Path $pathA 'package.json') -Force
Copy-Item -Path (Join-Path $repoRoot 'package.json') -Destination (Join-Path $pathB 'package.json') -Force

# ===== Cursor 衝突回避設定 =====
Ensure-CursorSettings $repoRoot
Ensure-CursorSettings $pathA
Ensure-CursorSettings $pathB

# ===== 依存導入 =====
$devPkgs = @('cross-env')
if ($needsDotenvCliMain) { $devPkgs += 'dotenv-cli' }
PM-AddDev $pm $repoRoot $devPkgs
PM-Install $pm $repoRoot
PM-AddDev $pm $pathA $devPkgs
PM-Install $pm $pathA
PM-AddDev $pm $pathB $devPkgs
PM-Install $pm $pathB

# ===== 起動ヘルパー =====
Write-Host ''
Write-Ok '3本の開発サーバを起動します（各ウィンドウ）。'

function Start-Dev([string]$cwd, [string]$script) {
	$cmd = switch ($pm) { 'pnpm' { "pnpm run $script" } 'yarn' { "yarn $script" } 'npm' { "npm run $script" } }
	Start-Process -FilePath pwsh -ArgumentList @('-NoExit','-NoLogo','-Command', $cmd) -WorkingDirectory $cwd -WindowStyle Normal | Out-Null
}

Start-Dev $repoRoot 'dev:main'
Start-Dev $pathA 'dev:a'
Start-Dev $pathB 'dev:b'

Write-Host ''
Write-Ok '起動コマンド（手動実行用）:'
Write-Host "[MAIN]   cd `"$repoRoot`"; $pm run dev:main"
Write-Host "[A]      cd `"$pathA`"; $pm run dev:a"
Write-Host "[B]      cd `"$pathB`"; $pm run dev:b"

Write-Host ''
Write-Ok 'セットアップ完了。'


