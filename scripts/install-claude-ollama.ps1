$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$userProfile = [Environment]::GetFolderPath("UserProfile")
$appData = [Environment]::GetFolderPath("ApplicationData")
$workspaceSettingsDir = Join-Path $appData "Code\\User"
$workspaceSettingsPath = Join-Path $workspaceSettingsDir "settings.json"
$claudeDir = Join-Path $userProfile ".claude"
$claudeSettingsPath = Join-Path $claudeDir "settings.json"
$launcherSourcePath = Join-Path $repoRoot "scripts\\ClaudeWrapperLauncher.cs"
$launcherExePath = Join-Path $repoRoot "scripts\\ClaudeWrapperLauncher.exe"
$envPath = Join-Path $repoRoot ".env.local"

if (-not (Test-Path $envPath)) {
  throw ".env.local not found. Create it first with OLLAMA_API_KEYS."
}

New-Item -ItemType Directory -Force -Path $workspaceSettingsDir | Out-Null
New-Item -ItemType Directory -Force -Path $claudeDir | Out-Null

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
$workspaceSettings["claudeCode.claudeProcessWrapper"] = $launcherExePath
$workspaceSettings["claudeCode.disableLoginPrompt"] = $true
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

$defaultModel = if ($aliases.ContainsKey("ollama-free-auto")) { "ollama-free-auto" } else { $availableModels[0] }
$claudeSettings["model"] = $defaultModel
$claudeSettings["availableModels"] = $availableModels
Write-JsonFile -Path $claudeSettingsPath -Data $claudeSettings

Write-Host "Installation completed."
Write-Host "Claude launcher:" $launcherExePath
Write-Host "VS Code user settings:" $workspaceSettingsPath
Write-Host "Claude user settings:" $claudeSettingsPath
Write-Host ""
Write-Host "Restart VS Code. Claude Code will use the bridge in any project."
