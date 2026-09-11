<#
.SYNOPSIS
  Create the private GitHub repository and push this project to it.

.DESCRIPTION
  Run this in your own terminal (the DSH sandbox cannot reach the network for
  non-Node tools). It:

    1. verifies git and sets up the commit if needed,
    2. probes GitHub connectivity, using the proxy when one is given and falling
       back to the OpenSSL TLS backend if Windows' schannel refuses,
    3. creates the private repository (GitHub CLI when installed, otherwise the
       browser flow), and pushes.

.PARAMETER Proxy
  HTTP proxy for GitHub. Defaults to the office proxy; pass -Proxy '' to connect
  directly.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/push-to-github.ps1
  powershell -ExecutionPolicy Bypass -File scripts/push-to-github.ps1 -Proxy ''
  powershell -ExecutionPolicy Bypass -File scripts/push-to-github.ps1 -Visibility public
#>
[CmdletBinding()]
param(
  [string]$Owner = 'luyue-0010',
  [string]$Name = 'dsh-desktop',
  [ValidateSet('private', 'public')][string]$Visibility = 'private',
  [string]$Proxy = 'http://10.28.2.62:8118',
  [string]$Message = 'DeepSeek Harness desktop shell: Electron wrapper with three-zone sidebar, dark artwork theme and a settings window'
)

$ErrorActionPreference = 'Stop'

function Write-Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Write-Ok($text) { Write-Host "   $text" -ForegroundColor Green }
function Write-Warn2($text) { Write-Host "   $text" -ForegroundColor Yellow }

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Invoke-GitQuiet([string[]]$GitArgs) {
  # Returns @{ Ok = <bool>; Output = <combined text> } and never throws.
  $output = & git @GitArgs 2>&1 | Out-String
  return @{ Ok = ($LASTEXITCODE -eq 0); Output = $output.Trim() }
}

Write-Step '检查环境'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw '没有找到 git，请先安装 Git for Windows：https://git-scm.com/download/win'
}
Write-Ok "git $(git --version)"
if (-not (Test-Path (Join-Path $repoRoot 'package.json'))) { throw "这里看起来不是项目根目录：$repoRoot" }
if (-not (Test-Path (Join-Path $repoRoot '.git'))) {
  Write-Warn2 '尚未初始化仓库，正在执行 git init'
  git init -b main | Out-Null
}

Write-Step '探测 GitHub 连通性'
$tlsBackend = $null
if ($Proxy) { Write-Ok "使用代理 $Proxy" } else { Write-Warn2 '不使用代理（直连）' }

$probeArgs = @()
if ($Proxy) { $probeArgs += @('-c', "http.proxy=$Proxy") }
$probe = Invoke-GitQuiet ($probeArgs + @('ls-remote', 'https://github.com/git/git', 'HEAD'))

if (-not $probe.Ok -and $probe.Output -match 'schannel|SSL|AcquireCredentialsHandle') {
  Write-Warn2 'Windows schannel 不可用，改用 OpenSSL 后端重试'
  $probe = Invoke-GitQuiet ($probeArgs + @('-c', 'http.sslBackend=openssl', 'ls-remote', 'https://github.com/git/git', 'HEAD'))
  if ($probe.Ok) { $tlsBackend = 'openssl' }
}

if (-not $probe.Ok) {
  Write-Host $probe.Output -ForegroundColor DarkGray
  throw @'
连不上 GitHub。按报错对号入座：
  * schannel / AcquireCredentialsHandle  →  本机 Windows TLS 不可用，脚本已尝试 openssl 后端仍失败
  * Failed to connect / Connection reset →  网络或代理不对，用 -Proxy <http://host:port> 指定，或换网络
  * 其它                                  →  把上面那行报错发我
'@
}
Write-Ok "连通正常（TLS 后端：$(if ($tlsBackend) { 'openssl' } else { '默认' })）"

# Persist the working transport for this checkout only (.git/config is never committed).
if ($Proxy) { git config http.proxy $Proxy; Write-Ok '已写入本仓库配置 http.proxy' }
if ($tlsBackend) { git config http.sslBackend $tlsBackend; Write-Ok '已写入本仓库配置 http.sslBackend' }

Write-Step '提交本地改动'
if (-not (git config user.name)) { git config user.name $Owner }
if (-not (git config user.email)) { git config user.email "$Owner@users.noreply.github.com" }
if (git status --porcelain) {
  git add -A
  git commit -m $Message | Out-Null
  Write-Ok "已创建提交：$(git log -1 --pretty=%s)"
} else {
  Write-Ok '工作区干净，无需提交'
}
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Ok "当前分支 $branch"

$remote = "https://github.com/$Owner/$Name.git"
$gh = Get-Command gh -ErrorAction SilentlyContinue

if ($gh) {
  Write-Step '用 GitHub CLI 建仓并推送'
  $exists = $false
  try { gh repo view "$Owner/$Name" --json name | Out-Null; $exists = $true } catch { $exists = $false }
  if ($exists) {
    Write-Warn2 "远端仓库 $Owner/$Name 已存在，直接推送"
    if (git remote) { git remote set-url origin $remote } else { git remote add origin $remote }
    git push -u origin $branch
  } else {
    gh repo create "$Owner/$Name" "--$Visibility" --source . --remote origin --push
  }
  Write-Ok "完成：$remote"
  exit 0
}

Write-Step '没有 gh CLI：改为浏览器建仓 + 推送'
$newUrl = "https://github.com/new?name=$Name&visibility=$Visibility"
Write-Host "   1) 打开 $newUrl" -ForegroundColor Yellow
Write-Host "   2) Repository name 填 $Name，可见性选 $Visibility"
Write-Host "   3) 不要勾 Add a README / .gitignore / license（本地已有提交，勾了会冲突）"
Write-Host "   4) 点 Create repository，然后回到这里按回车"
Start-Process $newUrl
Read-Host '   建好后按回车继续'

if (git remote) { git remote set-url origin $remote } else { git remote add origin $remote }
Write-Ok "origin -> $remote"

Write-Step '推送（首次会要求登录 GitHub）'
Write-Host "   会弹出 Git Credential Manager，选 'Sign in with your browser' 授权即可。`n" -ForegroundColor Yellow
git push -u origin $branch

Write-Host "`n完成：$remote" -ForegroundColor Green
Write-Host @"

后续排查：
  * 想清掉旧凭据：cmdkey /delete:git:https://github.com
  * 想改成直连：git config --unset http.proxy
"@ -ForegroundColor DarkGray
