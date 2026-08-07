# PowerShell script to package the system for distribution
# Run this from the OLT MONITORING folder

$source = $PSScriptRoot
$output = "c:\Users\Administrator\Desktop\ISP-Monitor-v1.0.zip"

# Things to EXCLUDE from the distribution ZIP
$exclude = @(
    ".env",           # Contains YOUR secrets - buyers get .env.example only
    "*.sqlite",       # Don't include your database - buyer starts fresh
    "*.db*",          # Catch-all for any other DB files
    "node_modules",   # Too large - buyer runs npm install on first launch
    ".git",
    "dist",
    "*.exe",
    "*.log",
    "public\uploads\*" # Your uploaded files
)

Write-Host "Packaging ISP Management System..." -ForegroundColor Cyan

# Create temp dir
$temp = "c:\Users\Administrator\Desktop\ISP-Monitor-TEMP"
if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
Copy-Item $source $temp -Recurse

# Remove excluded items
foreach ($item in $exclude) {
    Get-ChildItem $temp -Include $item -Recurse | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

# Compress
if (Test-Path $output) { Remove-Item $output -Force }
Compress-Archive -Path "$temp\*" -DestinationPath $output

# Cleanup temp
Remove-Item $temp -Recurse -Force

$size = [math]::Round((Get-Item $output).Length / 1MB, 1)
Write-Host ""
Write-Host "✅ Done! Package created: $output" -ForegroundColor Green
Write-Host "   Size: $size MB" -ForegroundColor Green
Write-Host ""
Write-Host "What the customer does:" -ForegroundColor Yellow
Write-Host "  1. Install Node.js from nodejs.org"
Write-Host "  2. Extract ZIP to C:\ISP-Monitor\"
Write-Host "  3. Double-click START.bat"
Write-Host "  4. Open browser → http://localhost:3000/admin/setup.html"
