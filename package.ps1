# Package JSON Viewer Extension for Chrome Web Store

Write-Host "Packaging JSON Viewer Extension..." -ForegroundColor Cyan

# Remove old package if exists
$zipFile = "json-viewer-extension.zip"
if (Test-Path $zipFile) {
    Remove-Item $zipFile -Force
    Write-Host "Removed existing $zipFile" -ForegroundColor Yellow
}

# Define files and folders to include
$filesToInclude = @(
    "manifest.json"
)

$foldersToInclude = @(
    "src"
    "icons"
)

# Create a temporary directory for packaging
$tempDir = "temp_package"
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

# Copy files
foreach ($file in $filesToInclude) {
    if (Test-Path $file) {
        Copy-Item $file -Destination $tempDir
    }
}

# Copy folders (excluding unwanted files)
foreach ($folder in $foldersToInclude) {
    if (Test-Path $folder) {
        Copy-Item $folder -Destination $tempDir -Recurse
    }
}

# Remove unwanted files from temp directory (dev/build files)
Get-ChildItem $tempDir -Recurse -Include "*.DS_Store", ".git*", "*.d.ts", "*.map", "*.ts" | Remove-Item -Force -ErrorAction SilentlyContinue

# Create the zip file
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipFile -Force

# Clean up temp directory
Remove-Item $tempDir -Recurse -Force

Write-Host ""
Write-Host "Package created: $zipFile" -ForegroundColor Green

# Show package contents for verification
Write-Host ""
Write-Host "Package contents:" -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipFile)
$zip.Entries | ForEach-Object { Write-Host "  $_" }
$zip.Dispose()

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Verify the package contents above"
Write-Host "2. Upload to Chrome Web Store Developer Dashboard"
Write-Host "   https://chrome.google.com/webstore/devconsole"
