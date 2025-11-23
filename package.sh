#!/bin/bash

# Package JSON Viewer Extension for Chrome Web Store

echo "Packaging JSON Viewer Extension..."

# Remove old package if exists
rm -f json-viewer-extension.zip

# Create the package
zip -r json-viewer-extension.zip \
  manifest.json \
  src/ \
  icons/ \
  -x "*.DS_Store" \
  -x "*.git*" \
  -x "test.html"

echo "✓ Package created: json-viewer-extension.zip"
echo ""
echo "Next steps:"
echo "1. Add icons to your extension (16x16, 48x48, 128x128)"
echo "2. Update manifest.json with icon paths"
echo "3. Upload to Chrome Web Store Developer Dashboard"
echo "   https://chrome.google.com/webstore/devconsole"
