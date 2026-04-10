$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$userProfile = [Environment]::GetFolderPath("UserProfile")
$appData = [Environment]::GetFolderPath("ApplicationData")
$workspaceSettingsPath = Join-Path $appData "Code\\User\\settings.json"
$claudeSettingsPath = Join-Path $userProfile ".claude\\settings.json"
$bridgePidPath = Join-Path $repoRoot ".runtime\\bridge.pid"
$launcherExePath = Join-Path $repoRoot "scripts\\ClaudeWrapperLauncher.exe"
$npmBinDir = Join-Path $appData "npm"
$claudeCmdPath = Join-Path $npmBinDir "claude.cmd"
$claudeShellPath = Join-Path $npmBinDir "claude"
$claudePs1Path = Join-Path $npmBinDir "claude.ps1"
$claudeCmdBackupPath = Join-Path $npmBinDir "claude.loren-backup.cmd"
$claudeShellBackupPath = Join-Path $npmBinDir "claude.loren-backup"
$claudePs1BackupPath = Join-Path $npmBinDir "claude.loren-backup.ps1"

function Read-JsonFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return @{}
  }

  $raw = Get-Content -LiteralPath $Path -Raw
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return @{}
  }

  $parsed = $raw | ConvertFrom-Json
  if ($null -eq $parsed) {
    return @{}
  }

  $result = @{}
  foreach ($property in $parsed.PSObject.Properties) {
    $result[$property.Name] = $property.Value
  }

  return $result
}

function Write-JsonFile {
  param(
    [string]$Path,
    [hashtable]$Data
  )

  $json = $Data | ConvertTo-Json -Depth 20
  Set-Content -LiteralPath $Path -Value ($json + "`n") -Encoding UTF8
}

function Restore-BackupIfPresent {
  param(
    [string]$BackupPath,
    [string]$TargetPath
  )

  if (Test-Path $BackupPath) {
    if (Test-Path $TargetPath) {
      Remove-Item -LiteralPath $TargetPath -Force -ErrorAction SilentlyContinue
    }
    Move-Item -LiteralPath $BackupPath -Destination $TargetPath -Force
  }
}

if (Test-Path $workspaceSettingsPath) {
  $settings = Read-JsonFile -Path $workspaceSettingsPath
  [void]$settings.Remove("claudeCode.claudeProcessWrapper")
  [void]$settings.Remove("claudeCode.disableLoginPrompt")
  [void]$settings.Remove("claudeCode.environmentVariables")
  Write-JsonFile -Path $workspaceSettingsPath -Data $settings
}

if (Test-Path $claudeSettingsPath) {
  $settings = Read-JsonFile -Path $claudeSettingsPath
  [void]$settings.Remove("model")
  [void]$settings.Remove("availableModels")
  Write-JsonFile -Path $claudeSettingsPath -Data $settings
}

if (Test-Path $bridgePidPath) {
  try {
    $pid = [int](Get-Content -LiteralPath $bridgePidPath -Raw).Trim()
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
  } catch {
  }
  Remove-Item -LiteralPath $bridgePidPath -Force -ErrorAction SilentlyContinue
}

if (Test-Path $launcherExePath) {
  Remove-Item -LiteralPath $launcherExePath -Force -ErrorAction SilentlyContinue
}

Restore-BackupIfPresent -BackupPath $claudeCmdBackupPath -TargetPath $claudeCmdPath
Restore-BackupIfPresent -BackupPath $claudeShellBackupPath -TargetPath $claudeShellPath
Restore-BackupIfPresent -BackupPath $claudePs1BackupPath -TargetPath $claudePs1Path

Write-Host "Global configuration removed."
