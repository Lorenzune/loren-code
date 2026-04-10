# Install Loren Code CLI globally
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

# Create bin directory if it doesn't exist
$binDir = "$env:APPDATA\npm"
if (!(Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
}

# Create the loren.cmd wrapper
$cmdContent = @"
@echo off
node "$projectRoot\scripts\loren.js" %*
"@

$cmdPath = "$binDir\loren.cmd"
$cmdContent | Out-File -FilePath $cmdPath -Encoding ASCII

Write-Host "Loren Code CLI installed globally!" -ForegroundColor Green
Write-Host ""
Write-Host "You can now use 'loren' from anywhere:" -ForegroundColor Cyan
Write-Host "  loren help" -ForegroundColor White
Write-Host "  loren model:list" -ForegroundColor White
Write-Host "  loren model:set <model>" -ForegroundColor White
Write-Host ""
Write-Host "To uninstall, run: powershell -ExecutionPolicy Bypass -File scripts/uninstall-loren.ps1" -ForegroundColor Yellow
