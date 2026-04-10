# Uninstall Loren Code CLI globally
$binDir = "$env:APPDATA\npm"
$cmdPath = "$binDir\loren.cmd"

if (Test-Path $cmdPath) {
    Remove-Item -Path $cmdPath -Force
    Write-Host "✓ Loren Code CLI uninstalled!" -ForegroundColor Green
} else {
    Write-Host "Loren Code CLI not found. Nothing to uninstall." -ForegroundColor Yellow
}
