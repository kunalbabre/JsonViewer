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

# Remove unwanted files from temp directory
Get-ChildItem $tempDir -Recurse -Include "*.DS_Store", ".git*", "test.html" | Remove-Item -Force -ErrorAction SilentlyContinue

# Create the zip file
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipFile -Force

# Clean up temp directory
Remove-Item $tempDir -Recurse -Force

Write-Host ""
Write-Host "Package created: $zipFile" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Add icons to your extension (16x16, 48x48, 128x128)"
Write-Host "2. Update manifest.json with icon paths"
Write-Host "3. Upload to Chrome Web Store Developer Dashboard"
Write-Host "   https://chrome.google.com/webstore/devconsole"
