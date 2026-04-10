$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$userProfile = [Environment]::GetFolderPath("UserProfile")
$appData = [Environment]::GetFolderPath("ApplicationData")
$workspaceSettingsPath = Join-Path $appData "Code\\User\\settings.json"
$claudeSettingsPath = Join-Path $userProfile ".claude\\settings.json"
$bridgePidPath = Join-Path $repoRoot ".runtime\\bridge.pid"
$launcherExePath = Join-Path $repoRoot "scripts\\ClaudeWrapperLauncher.exe"

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

if (Test-Path $workspaceSettingsPath) {
  $settings = Read-JsonFile -Path $workspaceSettingsPath
  [void]$settings.Remove("claudeCode.claudeProcessWrapper")
  [void]$settings.Remove("claudeCode.disableLoginPrompt")
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

Write-Host "Global configuration removed."
