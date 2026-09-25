# Pugying 本地开发一键启动（单机一体：本机 Server + Desktop）
# 用法：
#   ./start.ps1              # 启动 server (watch) + desktop (electron-vite)
#   ./start.ps1 -Help
#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot
Set-Location $Root

$ServerPort = if ($env:SERVER_PORT) { $env:SERVER_PORT } else { '3928' }
# 开发态外部 Server 不会走 Electron 的 credential-key.bin；
# 缺省沿用历史本地默认值，否则已有 pugying.db 中的 Cookie 无法解密。
if (-not $env:PLATFORM_CREDENTIAL_SECRET) {
  $env:PLATFORM_CREDENTIAL_SECRET = 'pugying-dev-secret-change-me'
}

# Windows Terminal / VS Code 终端通常支持 ANSI；否则退回无色
$ESC = [char]27
$script:UseColor = $false
try {
  if ($Host.UI.SupportsVirtualTerminal) {
    $script:UseColor = $true
  }
} catch { }
if ($env:WT_SESSION -or $env:TERM_PROGRAM -eq 'vscode') {
  $script:UseColor = $true
}

if ($script:UseColor) {
  $C_SERVER = "${ESC}[0;34m"
  $C_DESKTOP = "${ESC}[0;35m"
  $C_INFO = "${ESC}[0;36m"
  $C_ERR = "${ESC}[0;31m"
  $C_RESET = "${ESC}[0m"
} else {
  $C_SERVER = ''
  $C_DESKTOP = ''
  $C_INFO = ''
  $C_ERR = ''
  $C_RESET = ''
}

function Write-Info([string]$Message) {
  Write-Host "${C_INFO}${Message}${C_RESET}"
}

function Write-ErrMsg([string]$Message) {
  [Console]::Error.WriteLine("${C_ERR}${Message}${C_RESET}")
}

function Show-Usage {
  @'
Pugying 本地开发一键启动（单机一体）

用法:
  ./start.ps1 [选项]

选项:
  -h, -Help, --help   显示帮助

服务:
  server    NestJS（watch）  http://127.0.0.1:3928   Swagger: /api
  desktop   Electron         业务主窗 + 授权壳（electron-vite）

首次请安装依赖:
  (cd server; npm install)
  (cd desktop; npm install)

说明:
  开发模式下 Desktop 通过 PUGYING_EXTERNAL_SERVER=1 连接本脚本拉起的 Server，
  避免与 Electron 内再嵌入一份冲突。发行版由 Desktop 托管内嵌 Server。

  本脚本会注入 PLATFORM_CREDENTIAL_SECRET（可用环境变量覆盖），供平台 Cookie
  加解密；发行版则由 Electron 从本机 credential-key.bin 注入。
'@
}

foreach ($a in $args) {
  switch -Regex ($a) {
    '^-{1,2}[Hh](elp)?$' {
      Show-Usage
      exit 0
    }
    default {
      Write-ErrMsg "未知参数: $a"
      Show-Usage | ForEach-Object { [Console]::Error.WriteLine($_) }
      exit 1
    }
  }
}

$needInstall = $false
if (-not (Test-Path (Join-Path $Root 'server\node_modules'))) {
  Write-ErrMsg '缺少 server/node_modules，请先: (cd server; npm install)'
  $needInstall = $true
}
if (-not (Test-Path (Join-Path $Root 'desktop\node_modules'))) {
  Write-ErrMsg '缺少 desktop/node_modules，请先: (cd desktop; npm install)'
  $needInstall = $true
}
if ($needInstall) {
  exit 1
}

# Windows 上 npm 为 npm.cmd；CreateProcess 时需显式指定
$npmCmdInfo = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCmdInfo) {
  $npmCmd = $npmCmdInfo.Source
} else {
  $npmCmd = (Get-Command npm -ErrorAction Stop).Source
}

$script:ChildProcs = New-Object System.Collections.Generic.List[System.Diagnostics.Process]
$script:EventSubs = New-Object System.Collections.Generic.List[System.Management.Automation.PSEventJob]

function Stop-Children {
  Write-Host ''
  Write-Info '正在停止…'

  foreach ($sub in @($script:EventSubs)) {
    if ($null -ne $sub) {
      Unregister-Event -SourceIdentifier $sub.Name -ErrorAction SilentlyContinue
      Remove-Job $sub -Force -ErrorAction SilentlyContinue | Out-Null
    }
  }
  $script:EventSubs.Clear()

  foreach ($p in @($script:ChildProcs)) {
    if ($null -eq $p) {
      continue
    }
    try {
      if (-not $p.HasExited) {
        # taskkill /T：结束 npm 及其 node 子进程树
        & taskkill.exe /PID $p.Id /T /F 2>$null | Out-Null
      }
    } catch { }
  }
  $script:ChildProcs.Clear()
}

function Start-PrefixedNpm {
  param(
    [Parameter(Mandatory)][string]$WorkingDirectory,
    [Parameter(Mandatory)][string]$NpmScript,
    [Parameter(Mandatory)][hashtable]$EnvVars,
    [string[]]$RemoveEnvVars = @(),
    [Parameter(Mandatory)][string]$Prefix,
    [Parameter(Mandatory)][string]$PrefixColor
  )

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $npmCmd
  $psi.Arguments = "run $NpmScript"
  $psi.WorkingDirectory = $WorkingDirectory
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  # ProcessStartInfo 默认已带当前环境副本，此处覆盖 / 剔除业务变量
  foreach ($key in $EnvVars.Keys) {
    $psi.EnvironmentVariables[$key] = [string]$EnvVars[$key]
  }
  foreach ($key in $RemoveEnvVars) {
    if ($psi.EnvironmentVariables.ContainsKey($key)) {
      [void]$psi.EnvironmentVariables.Remove($key)
    }
  }

  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  [void]$proc.Start()

  $msg = @{ Prefix = $Prefix; Color = $PrefixColor; Reset = $C_RESET }
  $onOut = {
    if ($null -ne $EventArgs.Data) {
      [Console]::WriteLine("$($Event.MessageData.Color)$($Event.MessageData.Prefix)$($Event.MessageData.Reset) $($EventArgs.Data)")
    }
  }
  $onErr = {
    if ($null -ne $EventArgs.Data) {
      [Console]::Error.WriteLine("$($Event.MessageData.Color)$($Event.MessageData.Prefix)$($Event.MessageData.Reset) $($EventArgs.Data)")
    }
  }

  $outSub = Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -Action $onOut -MessageData $msg
  $errSub = Register-ObjectEvent -InputObject $proc -EventName ErrorDataReceived -Action $onErr -MessageData $msg
  $proc.BeginOutputReadLine()
  $proc.BeginErrorReadLine()

  [void]$script:ChildProcs.Add($proc)
  [void]$script:EventSubs.Add($outSub)
  [void]$script:EventSubs.Add($errSub)

  return $proc
}

function Test-ServerReady {
  param([string]$Port)
  foreach ($path in @('/api-json', '/api')) {
    try {
      $null = Invoke-WebRequest -Uri "http://127.0.0.1:${Port}${path}" -UseBasicParsing -TimeoutSec 2
      return $true
    } catch { }
  }
  return $false
}

try {
  Write-Info "启动本机 Server (PORT=${ServerPort})…"
  $serverProc = Start-PrefixedNpm `
    -WorkingDirectory (Join-Path $Root 'server') `
    -NpmScript 'start:dev' `
    -EnvVars @{
      PORT                       = $ServerPort
      HOST                       = '127.0.0.1'
      PLATFORM_CREDENTIAL_SECRET = $env:PLATFORM_CREDENTIAL_SECRET
    } `
    -Prefix '[server]' `
    -PrefixColor $C_SERVER

  Write-Info '等待 Server 就绪…'
  $ready = $false
  for ($i = 0; $i -lt 90; $i++) {
    if ($serverProc.HasExited) {
      Write-ErrMsg "Server 进程已退出（exit=$($serverProc.ExitCode)）"
      exit 1
    }
    if (Test-ServerReady -Port $ServerPort) {
      $ready = $true
      break
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) {
    Write-ErrMsg "等待 Server 就绪超时（http://127.0.0.1:${ServerPort}）"
    exit 1
  }

  Write-Info '启动 Desktop…'
  # 显式去掉 ELECTRON_RUN_AS_NODE（若继承自 Cursor 等宿主会令 Electron 无法起窗）
  $desktopEnv = @{
    PUGYING_EXTERNAL_SERVER = '1'
    PUGYING_API_BASE_URL    = "http://127.0.0.1:${ServerPort}"
  }
  $desktopProc = Start-PrefixedNpm `
    -WorkingDirectory (Join-Path $Root 'desktop') `
    -NpmScript 'dev' `
    -EnvVars $desktopEnv `
    -RemoveEnvVars @('ELECTRON_RUN_AS_NODE') `
    -Prefix '[desktop]' `
    -PrefixColor $C_DESKTOP

  Write-Info '已启动。Ctrl+C 结束全部进程。'

  # 任一子进程退出则结束；轮询以便响应 Ctrl+C 并进入 finally
  while ($true) {
    if ($serverProc.HasExited -or $desktopProc.HasExited) {
      break
    }
    Start-Sleep -Milliseconds 500
  }
} finally {
  Stop-Children
}
