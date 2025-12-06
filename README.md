# JSON Viewer

**Transform raw JSON into something beautiful.**

JSON Viewer is a high-performance Chrome extension built by developers, for developers. Whether you're debugging API responses, exploring config files, or analyzing large datasets, this tool makes JSON readable, navigable, and editable - right in your browser.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-green.svg)](https://chromewebstore.google.com/detail/json-viewer/cpjmnaccoabkopabenjobiimlppmmpjn)

---

## Install

**[Install from Chrome Web Store](https://chromewebstore.google.com/detail/json-viewer/cpjmnaccoabkopabenjobiimlppmmpjn)** (Recommended)

Or load from source:

1. Clone this repo: `git clone https://github.com/kunalbabre/JsonViewer.git`
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the cloned folder

---

## Built for Speed

We obsess over performance so you don't have to wait.

- **Instant loading** - Opens 5MB+ JSON files in milliseconds
- **Smart rendering** - Lazy loading means only visible nodes hit the DOM
- **90% less memory** - Handles 100,000+ nodes without breaking a sweat

---

## Four Ways to View Your Data

Switch views with one click:

- **Tree View** - Collapsible nodes with syntax highlighting. Perfect for nested structures.
- **Editor View** - Edit JSON directly with validation, formatting, and minify.
- **YAML View** - Instant JSON-to-YAML conversion.
- **Schema View** - Visualize data types and structure at a glance.

---

## DevTools Integration

A dedicated **JSON Viewer panel** lives inside Chrome DevTools. Inspect network requests and view JSON responses without leaving your workflow.

---

## Powerful Search

Find what you need, fast:

- Search across **keys and values**
- **Regex support** for advanced queries
- Results highlighted in real-time

---

## Looks Good, Works Everywhere

- **Auto light/dark theme** - Matches your system preference
- **Local file support** - Drag and drop `.json` files directly
- **Context menu** - Select JSON text anywhere, right-click, and choose "View JSON Snippet"

---

## Privacy First

JSON Viewer works **100% offline**. Your data is processed locally and never sent anywhere. No tracking. No analytics. No servers.

---

## One-Click Actions

- **Copy** - JSON to clipboard
- **Save** - Download as file
- **Format** - Pretty-print with proper indentation
- **Minify** - Compress for production

---

## Screenshots

### Tree View
![Tree View](screenshots/tree-view.png)

### Editor View
![Editor View](screenshots/editor-view.png)

### Schema View
![Schema View](screenshots/schema-view.png)

### YAML View
![YAML View](screenshots/yaml-view.png)

---

## Performance

JSON Viewer is optimized for large files:

- **Lazy Loading**: Only renders visible nodes in Tree view
- **Batched Rendering**: Processes nodes in chunks to prevent UI blocking
- **Smart Caching**: Caches rendered views for fast switching
- **Array Sampling**: Analyzes only first 100 items in large arrays for schema

### Benchmark Results (5.48 MB JSON file)

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Initial render | ~100ms | ~12ms | **87.5% faster** |
| DOM nodes | 171,008 | 16,008 | **90.6% reduction** |
| Memory usage | ~32 MB | ~3 MB | **90% reduction** |
| Overall speed | 1x | 8x | **8x faster** |

See [PERFORMANCE.md](PERFORMANCE.md) for detailed performance documentation.

---

## Configuration

Performance tuning constants (for developers):

```javascript
// TreeView.js
const BATCH_SIZE = 100                // Nodes per animation frame
const LARGE_OBJECT_THRESHOLD = 50     // Auto-collapse threshold
const DEEP_NESTING_THRESHOLD = 1      // Auto-collapse depth

// SchemaView.js
const SCHEMA_SAMPLE_SIZE = 100        // Schema array sample

// content.js
const LARGE_FILE_THRESHOLD = 1048576  // 1 MB loading indicator
```

---

## Development

### Project Structure

```
JsonViewer/
├── manifest.json           # Extension manifest
├── icons/                  # Extension icons
├── src/
│   ├── background.js       # Background service worker
│   ├── content.js          # Content script for page injection
│   ├── styles.css          # Global styles
│   ├── viewer.html         # Viewer page template
│   ├── viewer-page.js      # Viewer page initialization
│   ├── ui/
│   │   ├── Viewer.js       # Main viewer controller
│   │   ├── TreeView.js     # Tree view implementation
│   │   ├── EditorView.js   # Editor view implementation
│   │   ├── SchemaView.js   # Schema view implementation
│   │   ├── YamlView.js     # YAML view implementation
│   │   ├── Toolbar.js      # Toolbar component
│   │   ├── Toast.js        # Toast notifications
│   │   └── Icons.js        # SVG icon definitions
│   ├── utils/              # Utility functions
│   └── devtools/           # DevTools panel integration
├── screenshots/            # Screenshots for documentation
└── README.md               # This file
```

### Building

To package the extension:

```bash
./package.sh        # macOS/Linux
./package.ps1       # Windows PowerShell
```

This creates a `json-viewer-extension.zip` file ready for Chrome Web Store submission.

### Testing

Open test files in Chrome:
- `test.html` - Basic JSON test
- `test-large.html` - Large JSON file test (5.48 MB)

Or use the demo page:
- `demo.html` - Standalone demo (requires local server)

---

## Contributing

Contributions are welcome! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Test thoroughly** with various JSON files
5. **Commit your changes**: `git commit -m 'Add amazing feature'`
6. **Push to the branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Guidelines

- Follow the existing code style
- Test with both small and large JSON files
- Ensure dark theme compatibility
- Update documentation as needed

---

## Author

**Kunal Babre** - [@kunalbabre](https://github.com/kunalbabre)

---

## Related Documentation

- [PERFORMANCE.md](PERFORMANCE.md) - Detailed performance optimization documentation
- [BENCHMARK.md](BENCHMARK.md) - Performance benchmark results

---

## Bug Reports & Feature Requests

Found a bug? Have an idea? [Open an issue](https://github.com/kunalbabre/JsonViewer/issues)

---

## License

[MIT](LICENSE)

---

**Free. Open source. No ads. Just JSON, done right.**
