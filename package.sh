#!/bin/bash

# Package JSON Viewer Extension for Chrome Web Store

echo "Packaging JSON Viewer Extension..."

# Remove old package if exists
rm -f json-viewer-extension.zip

# Create the package (excluding dev/build files)
zip -r json-viewer-extension.zip \
  manifest.json \
  src/ \
  icons/ \
  -x "*.DS_Store" \
  -x "*.git*" \
  -x "*.d.ts" \
  -x "*.map" \
  -x "*.ts"

echo "✓ Package created: json-viewer-extension.zip"

# Show package contents for verification
echo ""
echo "Package contents:"
unzip -l json-viewer-extension.zip | tail -n +4 | head -n -2

echo ""
echo "Next steps:"
echo "1. Verify the package contents above"
echo "2. Upload to Chrome Web Store Developer Dashboard"
echo "   https://chrome.google.com/webstore/devconsole"
