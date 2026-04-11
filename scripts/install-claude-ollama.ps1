$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$userProfile = [Environment]::GetFolderPath("UserProfile")
$appData = [Environment]::GetFolderPath("ApplicationData")
$lorenHome = if ($env:LOREN_HOME) { $env:LOREN_HOME } else { Join-Path $userProfile ".lorencode" }
$workspaceSettingsDir = Join-Path $appData "Code\\User"
$workspaceSettingsPath = Join-Path $workspaceSettingsDir "settings.json"
$claudeDir = Join-Path $userProfile ".claude"
$claudeSettingsPath = Join-Path $claudeDir "settings.json"
$launcherSourcePath = Join-Path $repoRoot "scripts\\ClaudeWrapperLauncher.cs"
$launcherExePath = Join-Path $repoRoot "scripts\\ClaudeWrapperLauncher.exe"
$envTemplatePath = Join-Path $repoRoot ".env.example"
$legacyEnvPath = Join-Path $repoRoot ".env.local"
$envPath = Join-Path $lorenHome ".env.local"
$npmBinDir = Join-Path $appData "npm"
$claudeCmdPath = Join-Path $npmBinDir "claude.cmd"
$claudeShellPath = Join-Path $npmBinDir "claude"
$claudePs1Path = Join-Path $npmBinDir "claude.ps1"
$claudeCmdBackupPath = Join-Path $npmBinDir "claude.loren-backup.cmd"
$claudeShellBackupPath = Join-Path $npmBinDir "claude.loren-backup"
$claudePs1BackupPath = Join-Path $npmBinDir "claude.loren-backup.ps1"

New-Item -ItemType Directory -Force -Path $workspaceSettingsDir | Out-Null
New-Item -ItemType Directory -Force -Path $claudeDir | Out-Null
New-Item -ItemType Directory -Force -Path $lorenHome | Out-Null
New-Item -ItemType Directory -Force -Path $npmBinDir | Out-Null

if (-not (Test-Path $envPath)) {
  if (Test-Path $legacyEnvPath) {
    Copy-Item -LiteralPath $legacyEnvPath -Destination $envPath -Force
  } elseif (Test-Path $envTemplatePath) {
    Copy-Item -LiteralPath $envTemplatePath -Destination $envPath -Force
  } else {
    Set-Content -LiteralPath $envPath -Value "OLLAMA_API_KEYS=`nBRIDGE_HOST=127.0.0.1`nBRIDGE_PORT=8788`n" -Encoding UTF8
  }
}

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

function Get-EnvValue {
  param(
    [string]$Path,
    [string]$Name
  )

  $lines = Get-Content -LiteralPath $Path
  foreach ($line in $lines) {
    if ($line -match "^\s*$Name=(.+)$") {
      return $Matches[1].Trim()
    }
  }

  return $null
}

function Get-CSharpCompiler {
  $command = Get-Command csc -ErrorAction SilentlyContinue
  if ($command -and $command.Source -and (Test-Path $command.Source)) {
    return $command.Source
  }

  $runtimeDir = [Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
  if (-not [string]::IsNullOrWhiteSpace($runtimeDir)) {
    $runtimeCandidate = Join-Path $runtimeDir "csc.exe"
    if (Test-Path $runtimeCandidate) {
      return $runtimeCandidate
    }
  }

  $candidates = @(
    "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "C# compiler not found. Unable to generate the launcher .exe."
}

function Backup-IfNeeded {
  param(
    [string]$SourcePath,
    [string]$BackupPath
  )

  if ((Test-Path $SourcePath) -and -not (Test-Path $BackupPath)) {
    Move-Item -LiteralPath $SourcePath -Destination $BackupPath -Force
  }
}

function Get-OllamaAvailableModels {
  param(
    [string]$EnvPath,
    [hashtable]$Aliases
  )

  $models = [System.Collections.ArrayList]::new()

  foreach ($alias in $Aliases.Keys) {
    if (-not $models.Contains($alias)) {
      [void]$models.Add($alias)
    }
  }

  foreach ($target in $Aliases.Values) {
    if (-not [string]::IsNullOrWhiteSpace($target) -and -not $models.Contains($target)) {
      [void]$models.Add($target)
    }
  }

  $apiKeysRaw = Get-EnvValue -Path $EnvPath -Name "OLLAMA_API_KEYS"
  if (-not $apiKeysRaw) {
    $apiKeysRaw = Get-EnvValue -Path $EnvPath -Name "OLLAMA_API_KEY"
  }

  if (-not $apiKeysRaw) {
    return $models
  }

  $apiKey = ($apiKeysRaw -split ",")[0].Trim()
  if ([string]::IsNullOrWhiteSpace($apiKey)) {
    return $models
  }

  try {
    $headers = @{ Authorization = "Bearer $apiKey" }
    $response = Invoke-WebRequest -UseBasicParsing -Headers $headers "https://ollama.com/api/tags"
    $payload = $response.Content | ConvertFrom-Json
    foreach ($model in $payload.models) {
      $name = [string]$model.model
      if ([string]::IsNullOrWhiteSpace($name)) {
        $name = [string]$model.name
      }

      if (-not [string]::IsNullOrWhiteSpace($name) -and -not $models.Contains($name)) {
        [void]$models.Add($name)
      }
    }
  } catch {
    Write-Warning "Unable to load the model list from Ollama Cloud. Continuing with local aliases and targets."
  }

  return $models
}

$compilerPath = Get-CSharpCompiler
& $compilerPath "/nologo" "/target:exe" "/out:$launcherExePath" $launcherSourcePath | Out-Null
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $launcherExePath)) {
  if (Test-Path $launcherExePath) {
    Write-Warning "Launcher compilation failed, but an existing launcher will be used."
  } else {
    throw "Launcher compilation failed."
  }
}

$workspaceSettings = Read-JsonFile -Path $workspaceSettingsPath
$bridgeHost = Get-EnvValue -Path $envPath -Name "BRIDGE_HOST"
if (-not $bridgeHost) {
  $bridgeHost = "127.0.0.1"
}

$bridgePort = Get-EnvValue -Path $envPath -Name "BRIDGE_PORT"
if (-not $bridgePort) {
  $bridgePort = "8788"
}

$bridgeBaseUrl = "http://${bridgeHost}:${bridgePort}"

$workspaceSettings["claudeCode.claudeProcessWrapper"] = $launcherExePath
$workspaceSettings["claudeCode.disableLoginPrompt"] = $true
$workspaceSettings["claudeCode.environmentVariables"] = @(
  @{
    name = "LOREN_HOME"
    value = $lorenHome
  },
  @{
    name = "ANTHROPIC_BASE_URL"
    value = $bridgeBaseUrl
  },
  @{
    name = "ANTHROPIC_API_KEY"
    value = "bridge-local"
  },
  @{
    name = "ANTHROPIC_AUTH_TOKEN"
    value = ""
  },
  @{
    name = "CLAUDE_CODE_SKIP_AUTH_LOGIN"
    value = "1"
  }
)
Write-JsonFile -Path $workspaceSettingsPath -Data $workspaceSettings

$claudeSettings = Read-JsonFile -Path $claudeSettingsPath
$aliasJson = Get-EnvValue -Path $envPath -Name "OLLAMA_MODEL_ALIASES"
if (-not $aliasJson) {
  throw "OLLAMA_MODEL_ALIASES not found in .env.local"
}

$parsedAliases = $aliasJson | ConvertFrom-Json
$aliases = @{}
foreach ($property in $parsedAliases.PSObject.Properties) {
  $aliases[$property.Name] = [string]$property.Value
}
$availableModels = Get-OllamaAvailableModels -EnvPath $envPath -Aliases $aliases

if ($availableModels.Count -eq 0) {
  throw "OLLAMA_MODEL_ALIASES does not contain any models"
}

$configuredDefaultModel = Get-EnvValue -Path $envPath -Name "DEFAULT_MODEL_ALIAS"
if (
  -not [string]::IsNullOrWhiteSpace($configuredDefaultModel) -and
  -not $availableModels.Contains($configuredDefaultModel)
) {
  [void]$availableModels.Insert(0, $configuredDefaultModel)
}
if (
  -not [string]::IsNullOrWhiteSpace($configuredDefaultModel) -and
  $availableModels.Contains($configuredDefaultModel)
) {
  $defaultModel = $configuredDefaultModel
} elseif ($aliases.ContainsKey("ollama-free-auto")) {
  $defaultModel = "ollama-free-auto"
} else {
  $defaultModel = $availableModels[0]
}
$claudeSettings["model"] = $defaultModel
$claudeSettings["availableModels"] = $availableModels
Write-JsonFile -Path $claudeSettingsPath -Data $claudeSettings

Backup-IfNeeded -SourcePath $claudeCmdPath -BackupPath $claudeCmdBackupPath
Backup-IfNeeded -SourcePath $claudeShellPath -BackupPath $claudeShellBackupPath
Backup-IfNeeded -SourcePath $claudePs1Path -BackupPath $claudePs1BackupPath

$cmdContent = @"
@echo off
"$launcherExePath" %*
"@
Set-Content -LiteralPath $claudeCmdPath -Value $cmdContent -Encoding ASCII

$shellLauncherPath = ($launcherExePath -replace "\\", "/")
$shellContent = @"
#!/bin/sh
"$shellLauncherPath" "$@"
"@
Set-Content -LiteralPath $claudeShellPath -Value $shellContent -Encoding ASCII

$ps1Content = @"
& "$launcherExePath" @args
"@
Set-Content -LiteralPath $claudePs1Path -Value $ps1Content -Encoding UTF8

Write-Host "Installation completed."
Write-Host ""
Write-Host "Claude Code is now wired to Loren."
Write-Host "Restart VS Code and open a fresh chat."
Write-Host "The global 'claude' command now goes through Loren too."
Write-Host "Tiny goblins have been escorted away from the terminal."
