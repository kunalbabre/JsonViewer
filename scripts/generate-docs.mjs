#!/usr/bin/env node
/**
 * Documentation Generator for JSON Viewer
 *
 * Generates screenshots and updates README with comprehensive documentation.
 * Run with: npm run doc
 *
 * Chrome Web Store Requirements:
 * - Screenshots: 1280x800 or 640x400, JPEG/PNG (no alpha), up to 5
 * - Small promo tile: 440x280, JPEG/PNG (no alpha)
 * - Marquee promo tile: 1400x560, JPEG/PNG (no alpha)
 *
 * Features captured:
 * - All view modes (Tree, Editor, Schema, YAML, Raw)
 * - Search functionality
 * - Theme (dark mode preferred)
 * - Toolbar actions
 * - DevTools panel
 * - Expand/Collapse controls
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import os from 'os';
import { getSmallPromoHTML, getMarqueePromoHTML } from './promo-templates.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '..');
const screenshotsDir = path.join(extensionPath, 'docs', 'screenshots');
const storeAssetsDir = path.join(extensionPath, 'docs', 'store');
const userDataDir = path.join(os.tmpdir(), 'jv-docs-profile-' + Date.now());

// Chrome Web Store asset sizes
const SCREENSHOT_SIZE = { width: 1280, height: 800 };
const SMALL_PROMO_SIZE = { width: 440, height: 280 };
const MARQUEE_PROMO_SIZE = { width: 1400, height: 560 };

// Sample JSON data for screenshots
const SAMPLE_JSON = {
    "name": "JSON Viewer",
    "version": "1.0.1",
    "description": "Beautiful JSON viewer with multiple view modes",
    "features": [
        "Tree View",
        "Editor View",
        "Schema View",
        "YAML View",
        "Raw View"
    ],
    "author": {
        "name": "Kunal Babre",
        "github": "https://github.com/kunalbabre"
    },
    "settings": {
        "theme": "dark",
        "expandLevel": 2,
        "syntaxHighlight": true
    },
    "stats": {
        "downloads": 10000,
        "rating": 4.8,
        "reviews": 250
    },
    "tags": ["json", "viewer", "chrome", "extension", "developer-tools"],
    "isActive": true,
    "lastUpdated": "2024-01-15T10:30:00Z"
};

// Ensure screenshots directory exists
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// Create a local server to serve test pages
function createServer(port) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');

            const url = req.url.split('?')[0];

            if (url === '/test-json') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(SAMPLE_JSON, null, 2));
                return;
            }

            // Serve files from extension directory
            let filePath;
            if (url === '/') {
                // Serve inline test page
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
<pre>${JSON.stringify(SAMPLE_JSON, null, 2)}</pre>
</body>
</html>`);
                return;
            } else if (url.startsWith('/src/') || url.startsWith('/icons/')) {
                filePath = path.join(extensionPath, url.substring(1));
            } else {
                res.writeHead(404);
                res.end('Not found');
                return;
            }

            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }
                let contentType = 'text/plain';
                if (filePath.endsWith('.js')) contentType = 'application/javascript';
                else if (filePath.endsWith('.css')) contentType = 'text/css';
                else if (filePath.endsWith('.html')) contentType = 'text/html';
                else if (filePath.endsWith('.png')) contentType = 'image/png';
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(data);
            });
        });
        server.listen(port, () => resolve(server));
    });
}

async function captureScreenshots() {
    console.log('='.repeat(60));
    console.log('JSON Viewer - Documentation Generator');
    console.log('='.repeat(60));
    console.log('');

    ensureDir(screenshotsDir);
    ensureDir(storeAssetsDir);

    const PORT = 9889;
    const server = await createServer(PORT);
    console.log(`✓ Test server running on http://localhost:${PORT}`);

    // Use exact Chrome Web Store screenshot size (1280x800)
    const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'msedge',
        headless: false,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--no-sandbox',
        ],
        viewport: SCREENSHOT_SIZE,
        deviceScaleFactor: 1, // Exact pixel dimensions for store
    });
    console.log(`✓ Browser launched (viewport: ${SCREENSHOT_SIZE.width}x${SCREENSHOT_SIZE.height})`);

    let page = context.pages()[0];
    if (!page) {
        page = await context.newPage();
    }

    const screenshots = [];
    const storeScreenshots = [];

    // Screenshot for README docs
    async function screenshot(name, description) {
        const filename = `${name}.png`;
        const filepath = path.join(screenshotsDir, filename);
        // Use clip to ensure exact dimensions
        await page.screenshot({
            path: filepath,
            clip: { x: 0, y: 0, width: SCREENSHOT_SIZE.width, height: SCREENSHOT_SIZE.height }
        });
        screenshots.push({ name, filename, description });
        console.log(`  ✓ Captured: ${filename}`);
    }

    // Screenshot for Chrome Web Store (exact 1280x800)
    async function storeScreenshot(name, description) {
        const filename = `${name}.png`;
        const filepath = path.join(storeAssetsDir, filename);
        // Use clip to ensure exact 1280x800 dimensions required by Chrome Web Store
        await page.screenshot({
            path: filepath,
            clip: { x: 0, y: 0, width: SCREENSHOT_SIZE.width, height: SCREENSHOT_SIZE.height }
        });
        storeScreenshots.push({ name, filename, description, size: '1280x800' });
        console.log(`  ✓ Store screenshot: ${filename} (1280x800)`);
    }

    // Capture promo tiles using custom HTML templates
    async function capturePromoTile(name, size, htmlContent, description) {
        const filename = `${name}.png`;
        const filepath = path.join(storeAssetsDir, filename);

        // Create a new page for the promo tile
        const promoPage = await context.newPage();
        await promoPage.setViewportSize(size);

        // Set the HTML content directly
        await promoPage.setContent(htmlContent);
        await promoPage.waitForTimeout(500);

        // Use clip to ensure exact dimensions required by Chrome Web Store
        await promoPage.screenshot({
            path: filepath,
            clip: { x: 0, y: 0, width: size.width, height: size.height }
        });
        console.log(`  ✓ Promo tile: ${filename} (${size.width}x${size.height})`);

        await promoPage.close();

        return { name, filename, size: `${size.width}x${size.height}`, description };
    }

    try {
        // Navigate to JSON page - extension will activate
        console.log('\n1. Loading JSON page...');
        await page.goto(`http://localhost:${PORT}/test-json`, { waitUntil: 'networkidle' });

        // Wait for extension to render
        await page.waitForSelector('.jv-toolbar-container', { timeout: 10000 });
        await page.waitForTimeout(1000);

        // Force dark theme
        console.log('\n2. Setting dark theme...');

        // Set localStorage preference for dark theme
        await page.evaluate(() => {
            localStorage.setItem('json-viewer-theme', 'dark');
        });

        // Reload to apply theme from storage
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForSelector('.jv-toolbar-container', { timeout: 10000 });
        await page.waitForTimeout(500);

        // Also add dark-theme class directly to ensure it's applied
        await page.evaluate(() => {
            document.body.classList.add('dark-theme');
            const root = document.querySelector('.jv-content')?.parentElement;
            if (root) root.classList.add('dark');
        });

        // Verify dark theme is applied
        const isDark = await page.evaluate(() => document.body.classList.contains('dark-theme'));
        console.log(`  Dark theme applied: ${isDark}`);

        // Screenshot 1: Tree View (default)
        console.log('\n3. Capturing Tree View...');
        await page.waitForSelector('.jv-node', { timeout: 5000 });
        await page.waitForTimeout(500);
        await screenshot('01-tree-view', 'Tree View - Collapsible JSON structure with syntax highlighting');

        // Expand some nodes for better screenshot
        const expandBtns = await page.$$('.jv-toggle');
        for (let i = 0; i < Math.min(3, expandBtns.length); i++) {
            await expandBtns[i].click();
            await page.waitForTimeout(100);
        }
        await page.waitForTimeout(300);
        await screenshot('02-tree-expanded', 'Tree View - Expanded nodes showing nested data');

        // Screenshot 2: Editor View
        console.log('\n4. Capturing Editor View...');
        await page.click('.jv-nav-btn:has-text("Editor")');
        await page.waitForSelector('.jv-editor-wrapper', { timeout: 10000 });
        await page.waitForTimeout(1000);
        await screenshot('03-editor-view', 'Editor View - Edit JSON with syntax highlighting and line numbers');

        // Screenshot 3: Schema View
        console.log('\n5. Capturing Schema View...');
        await page.click('.jv-nav-btn:has-text("Schema")');
        await page.waitForTimeout(1000);
        await screenshot('04-schema-view', 'Schema View - Visualize data types and structure');

        // Screenshot 4: YAML View
        console.log('\n6. Capturing YAML View...');
        await page.click('.jv-nav-btn:has-text("YAML")');
        await page.waitForTimeout(1000);
        await screenshot('05-yaml-view', 'YAML View - JSON converted to YAML format');

        // Screenshot 5: Raw View
        console.log('\n7. Capturing Raw View...');
        await page.click('.jv-nav-btn:has-text("Raw")');
        await page.waitForTimeout(500);
        await screenshot('06-raw-view', 'Raw View - Original JSON with copy option');

        // Screenshot 6: Search functionality
        console.log('\n8. Capturing Search...');
        await page.click('.jv-nav-btn:has-text("Tree")');
        await page.waitForTimeout(500);
        const searchInput = await page.$('.jv-search');
        if (searchInput) {
            await searchInput.fill('version');
            await page.waitForTimeout(800);
            await screenshot('07-search', 'Search - Find keys and values with highlighting');
            await searchInput.fill('');
        }

        // Screenshot 7: Level dropdown
        console.log('\n9. Capturing Level Controls...');
        const levelBtn = await page.$('.jv-level-btn');
        if (levelBtn) {
            await levelBtn.click();
            await page.waitForTimeout(300);
            await screenshot('08-level-controls', 'Level Controls - Expand/collapse to specific depth');
            await page.keyboard.press('Escape');
        }

        // Screenshot 8: Toolbar overview
        console.log('\n10. Capturing Toolbar...');
        await page.waitForTimeout(300);
        // Focus on toolbar area
        await page.evaluate(() => {
            const toolbar = document.querySelector('.jv-toolbar-container');
            if (toolbar) toolbar.scrollIntoView();
        });
        await screenshot('09-toolbar', 'Toolbar - View tabs, search, and action buttons');

        // ============================================
        // CHROME WEB STORE ASSETS
        // ============================================
        console.log('\n' + '='.repeat(60));
        console.log('CHROME WEB STORE ASSETS (1280x800)');
        console.log('='.repeat(60));

        // Store Screenshot 1: Tree View (hero shot)
        console.log('\n11. Store screenshots...');
        await page.click('.jv-nav-btn:has-text("Tree")');
        await page.waitForTimeout(500);
        // Expand nodes for visual appeal
        const allToggles = await page.$$('.jv-toggle');
        for (let i = 0; i < Math.min(5, allToggles.length); i++) {
            const isCollapsed = await allToggles[i].evaluate(el => el.textContent?.includes('▶') || el.classList.contains('collapsed'));
            if (isCollapsed) {
                await allToggles[i].click();
                await page.waitForTimeout(100);
            }
        }
        await page.waitForTimeout(300);
        await storeScreenshot('screenshot-1-tree', 'Tree View with expanded nodes');

        // Store Screenshot 2: Editor View
        await page.click('.jv-nav-btn:has-text("Editor")');
        await page.waitForSelector('.jv-editor-wrapper', { timeout: 10000 });
        await page.waitForTimeout(800);
        await storeScreenshot('screenshot-2-editor', 'Editor View with syntax highlighting');

        // Store Screenshot 3: Schema View
        await page.click('.jv-nav-btn:has-text("Schema")');
        await page.waitForTimeout(800);
        await storeScreenshot('screenshot-3-schema', 'Schema View showing data types');

        // Store Screenshot 4: YAML View
        await page.click('.jv-nav-btn:has-text("YAML")');
        await page.waitForTimeout(800);
        await storeScreenshot('screenshot-4-yaml', 'YAML View conversion');

        // Store Screenshot 5: Search with results
        await page.click('.jv-nav-btn:has-text("Tree")');
        await page.waitForTimeout(500);
        const storeSearchInput = await page.$('.jv-search');
        if (storeSearchInput) {
            await storeSearchInput.fill('name');
            await page.waitForTimeout(600);
        }
        await storeScreenshot('screenshot-5-search', 'Search functionality');
        if (storeSearchInput) {
            await storeSearchInput.fill('');
        }

        // ============================================
        // PROMO TILES (Custom designed templates)
        // ============================================
        console.log('\n12. Promo tiles (custom templates)...');

        // Small promo tile (440x280) - Custom branded design
        await capturePromoTile(
            'promo-small-440x280',
            SMALL_PROMO_SIZE,
            getSmallPromoHTML(),
            'Small promo tile'
        );

        // Marquee promo tile (1400x560) - Full banner with viewer mock
        await capturePromoTile(
            'promo-marquee-1400x560',
            MARQUEE_PROMO_SIZE,
            getMarqueePromoHTML(),
            'Marquee promo tile'
        );

        // ============================================
        // SUMMARY
        // ============================================
        console.log('\n' + '='.repeat(60));
        console.log('ALL ASSETS CAPTURED');
        console.log('='.repeat(60));

        console.log(`\nREADME Screenshots: ${screenshotsDir}`);
        console.log(`Total: ${screenshots.length} screenshots`);
        screenshots.forEach(s => console.log(`  - ${s.filename}`));

        console.log(`\nChrome Web Store: ${storeAssetsDir}`);
        console.log(`Screenshots (1280x800): ${storeScreenshots.length}`);
        storeScreenshots.forEach(s => console.log(`  - ${s.filename}`));
        console.log(`Promo tiles:`);
        console.log(`  - promo-small-440x280.png (440x280)`);
        console.log(`  - promo-marquee-1400x560.png (1400x560)`);

        // Generate README
        console.log('\n13. Generating README...');
        await generateReadme(screenshots);
        console.log('✓ README.md updated');

        // Generate Chrome Web Store submission details
        console.log('\n14. Generating Store Submission Details...');
        generateStoreSubmission(storeScreenshots);

    } catch (error) {
        console.error('\n✗ Error:', error.message);
        console.error(error.stack);
    } finally {
        await page.waitForTimeout(2000);
        server.close();
        await context.close();
        try {
            fs.rmSync(userDataDir, { recursive: true, force: true });
        } catch (e) { /* ignore */ }
    }
}

async function generateReadme(screenshots) {
    const readmePath = path.join(extensionPath, 'README.md');

    const readme = `# JSON Viewer

**Transform raw JSON into something beautiful.**

A high-performance Chrome extension that makes JSON readable, navigable, and editable - right in your browser.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-green.svg)](https://chromewebstore.google.com/detail/json-viewer/cpjmnaccoabkopabenjobiimlppmmpjn)

![JSON Viewer](docs/screenshots/01-tree-view.png)

---

## Install

**[Install from Chrome Web Store](https://chromewebstore.google.com/detail/json-viewer/cpjmnaccoabkopabenjobiimlppmmpjn)** (Recommended)

Or load from source:
1. Clone: \`git clone https://github.com/kunalbabre/JsonViewer.git\`
2. Open \`chrome://extensions/\`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the folder

---

## Features

### Five View Modes

Switch between views instantly with a single click:

| View | Description |
|------|-------------|
| **Tree** | Collapsible nodes with syntax highlighting. Perfect for exploring nested structures. |
| **Editor** | Full-featured JSON editor with line numbers, formatting, and validation. |
| **Schema** | Visualize data types and structure at a glance. |
| **YAML** | Instant JSON-to-YAML conversion for config files. |
| **Raw** | Original JSON string with easy copy option. |

#### Tree View
![Tree View](docs/screenshots/02-tree-expanded.png)
*Expand and collapse nodes to explore your JSON structure*

#### Editor View
![Editor View](docs/screenshots/03-editor-view.png)
*Edit JSON directly with syntax highlighting and line numbers*

#### Schema View
![Schema View](docs/screenshots/04-schema-view.png)
*Understand your data structure with type annotations*

#### YAML View
![YAML View](docs/screenshots/05-yaml-view.png)
*View JSON converted to YAML format*

---

### Powerful Search

Find what you need instantly:

![Search](docs/screenshots/07-search.png)

- Search across **keys and values**
- **Real-time highlighting** as you type
- Navigate matches with **Enter** / **Shift+Enter**
- **Regex support** for advanced queries

---

### Smart Controls

![Toolbar](docs/screenshots/09-toolbar.png)

| Action | Shortcut | Description |
|--------|----------|-------------|
| **Copy** | \`Ctrl/⌘+C\` | Copy JSON to clipboard |
| **Save** | \`Ctrl/⌘+S\` | Download as .json file |
| **Format** | \`Alt+Shift+F\` | Pretty-print with indentation |
| **Find** | \`Ctrl/⌘+F\` | Focus search input |
| **Theme** | \`Ctrl/⌘+D\` | Toggle light/dark mode |

#### Level-Based Expand/Collapse

![Level Controls](docs/screenshots/08-level-controls.png)

Expand or collapse all nodes to a specific depth level (1-5).

---

### DevTools Integration

A dedicated **JSON Viewer** panel in Chrome DevTools lets you:
- Monitor network requests with JSON responses
- Click any request to view formatted JSON
- Filter requests by URL or content type
- Paste JSON manually for quick viewing

---

### Performance Optimized

Built for speed with large files:

| Feature | Benefit |
|---------|---------|
| **Lazy rendering** | Only visible nodes hit the DOM |
| **Batched processing** | Prevents UI blocking on large files |
| **View caching** | Instant tab switching |
| **Virtual scrolling** | Handles 100,000+ nodes smoothly |

**Benchmark (5.5MB JSON file):**
- Initial render: **~12ms** (87% faster than naive approach)
- DOM nodes: **90% reduction** via lazy loading
- Memory: **~3MB** vs ~32MB traditional

---

### Works Everywhere

- **Auto-detects JSON** in browser tabs
- **Local files** - Open .json files directly
- **Context menu** - Right-click selected text → "View JSON Snippet"
- **Light & dark themes** - Matches system preference
- **100% offline** - No data sent anywhere

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| \`Ctrl/⌘ + F\` | Focus search |
| \`Enter\` | Next search match |
| \`Shift + Enter\` | Previous search match |
| \`Ctrl/⌘ + C\` | Copy JSON |
| \`Ctrl/⌘ + S\` | Save to file |
| \`Ctrl/⌘ + T\` | Toggle theme |
| \`Alt + Shift + F\` | Format JSON (Editor) |
| \`Ctrl/⌘ + Enter\` | Apply changes (Editor) |

---

## Privacy

JSON Viewer works **100% offline**. Your data is processed locally and never sent anywhere. No tracking. No analytics. No servers.

---

## Development

### Project Structure

\`\`\`
JsonViewer/
├── manifest.json           # Extension manifest (v3)
├── src/
│   ├── background.js       # Service worker
│   ├── content.js          # Page injection
│   ├── styles.css          # Global styles
│   ├── ui/                 # UI components
│   │   ├── Viewer.js       # Main controller
│   │   ├── TreeView.js     # Tree view
│   │   ├── EditorView.js   # Editor view
│   │   ├── SchemaView.js   # Schema view
│   │   ├── YamlView.js     # YAML view
│   │   ├── Toolbar.js      # Toolbar
│   │   └── Icons.js        # SVG icons
│   ├── utils/              # Utilities
│   └── devtools/           # DevTools panel
├── tests/                  # E2E tests
├── scripts/                # Build scripts
└── docs/                   # Documentation
\`\`\`

### Scripts

\`\`\`bash
npm test              # Run E2E tests
npm run test:devtools # Test DevTools panel
npm run doc           # Generate documentation & screenshots
./package.sh          # Package for Chrome Web Store
\`\`\`

### Testing

\`\`\`bash
# Run all tests
npm test

# Test specific features
node tests/e2e/editor-test.mjs
node tests/e2e/devtools-test.mjs
\`\`\`

---

## Contributing

1. Fork the repository
2. Create a feature branch: \`git checkout -b feature/amazing-feature\`
3. Make your changes
4. Test thoroughly with various JSON files
5. Commit: \`git commit -m 'Add amazing feature'\`
6. Push: \`git push origin feature/amazing-feature\`
7. Open a Pull Request

---

## Author

**Kunal Babre** - [@kunalbabre](https://github.com/kunalbabre)

---

## License

[MIT](LICENSE)

---

**Free. Open source. No ads. Just JSON, done right.**
`;

    fs.writeFileSync(readmePath, readme);
}

function generateStoreSubmission(storeScreenshots) {
    // Read manifest for version
    const manifestPath = path.join(extensionPath, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    const submission = `# Chrome Web Store Submission Details

Generated: ${new Date().toISOString().split('T')[0]}
Version: ${manifest.version}

---

## Basic Information

### Extension Name
\`\`\`
JSON Viewer
\`\`\`

### Summary (132 characters max)
\`\`\`
Beautiful JSON viewer with Tree, Editor, Schema, YAML views. Fast, offline, developer-friendly.
\`\`\`
(94 characters)

### Description
\`\`\`
Transform raw JSON into something beautiful.

JSON Viewer is a high-performance Chrome extension that makes JSON readable, navigable, and editable - right in your browser.

✨ FIVE VIEW MODES
• Tree View - Collapsible nodes with syntax highlighting. Perfect for exploring nested structures.
• Editor View - Full-featured JSON editor with line numbers, formatting, and validation.
• Schema View - Visualize data types and structure at a glance.
• YAML View - Instant JSON-to-YAML conversion for config files.
• Raw View - Original JSON string with easy copy option.

🔍 POWERFUL SEARCH
• Search across keys and values
• Real-time highlighting as you type
• Navigate matches with Enter / Shift+Enter
• Regex support for advanced queries
• Wrap-around navigation with match count feedback

⚡ PERFORMANCE OPTIMIZED
• Lazy rendering - Only visible nodes hit the DOM
• Batched processing - Prevents UI blocking on large files
• View caching - Instant tab switching
• Handles 100,000+ nodes smoothly

🛠️ DEVTOOLS INTEGRATION
• Dedicated JSON Viewer panel in Chrome DevTools
• Monitor network requests with JSON responses
• Click any request to view formatted JSON
• Filter requests by URL or content type

⌨️ KEYBOARD SHORTCUTS
• Ctrl/⌘+F - Focus search
• Ctrl/⌘+C - Copy JSON
• Ctrl/⌘+S - Save to file
• Ctrl/⌘+D - Toggle theme

🌙 WORKS EVERYWHERE
• Auto-detects JSON in browser tabs
• Supports JSONL and NDJSON files
• Local files - Open .json files directly
• Context menu - Right-click selected text → "View JSON Snippet"
• Image URL preview on hover in tree view
• Light & dark themes - Matches system preference

🔒 PRIVACY
100% offline. Your data is processed locally and never sent anywhere. No tracking. No analytics. No servers.

Free. Open source. No ads. Just JSON, done right.
\`\`\`

---

## Category

**Primary Category:** Developer Tools

---

## Language

**Default Language:** English

---

## Screenshots (1280x800)

| # | File | Description |
|---|------|-------------|
| 1 | screenshot-1-tree.png | Tree View - Collapsible JSON structure with syntax highlighting |
| 2 | screenshot-2-editor.png | Editor View - Edit JSON with syntax highlighting and line numbers |
| 3 | screenshot-3-schema.png | Schema View - Visualize data types and structure |
| 4 | screenshot-4-yaml.png | YAML View - JSON converted to YAML format |
| 5 | screenshot-5-search.png | Search - Find keys and values with real-time highlighting |

---

## Promotional Images

| Type | Size | File |
|------|------|------|
| Small Promo Tile | 440x280 | promo-small-440x280.png |
| Marquee Promo Tile | 1400x560 | promo-marquee-1400x560.png |

---

## Privacy

### Single Purpose Description
\`\`\`
This extension displays JSON content in a readable, navigable format with multiple view modes (Tree, Editor, Schema, YAML, Raw) and search functionality.
\`\`\`

### Privacy Policy
\`\`\`
JSON Viewer processes all data locally in your browser. No data is collected, transmitted, or stored externally. The extension works 100% offline.

• No user data collection
• No analytics or tracking
• No external network requests
• No third-party services
• All processing happens locally in your browser
\`\`\`

### Permissions Justification

| Permission | Justification |
|------------|---------------|
| \`contextMenus\` | Required to add "View JSON Snippet" option when right-clicking selected text |
| \`storage\` | Required to save user preferences (theme, expand level) locally |
| \`<all_urls>\` (content script) | Required to detect and format JSON content on any webpage |

---

## Additional Notes

### Why This Extension?
- No ads or premium features
- Open source (MIT License)
- Fast and lightweight
- Privacy-focused (100% offline)
- Modern UI with dark mode support

### Support
- GitHub: https://github.com/kunalbabre/JsonViewer
- Issues: https://github.com/kunalbabre/JsonViewer/issues

---

## Checklist Before Submission

- [ ] All screenshots are 1280x800 PNG files
- [ ] Small promo tile is 440x280 PNG
- [ ] Marquee promo tile is 1400x560 PNG
- [ ] Description is under 16,000 characters
- [ ] Summary is under 132 characters
- [ ] Extension tested in latest Chrome
- [ ] Privacy policy accurate
- [ ] All permissions justified
`;

    const submissionPath = path.join(storeAssetsDir, 'SUBMISSION.md');
    fs.writeFileSync(submissionPath, submission);
    console.log('✓ Store submission details: docs/store/SUBMISSION.md');
}

// Run the generator
captureScreenshots().catch(console.error);
