# Chrome Web Store Submission Details

Generated: 2025-12-20
Version: 1.0.3

---

## Basic Information

### Extension Name
```
JSON Viewer
```

### Summary (132 characters max)
```
Beautiful JSON viewer with Tree, Editor, Schema, YAML views. Fast, offline, developer-friendly.
```
(94 characters)

### Description
```
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
• Ctrl/⌘+T - Toggle theme

🌙 WORKS EVERYWHERE
• Auto-detects JSON in browser tabs
• Local files - Open .json files directly
• Context menu - Right-click selected text → "View JSON Snippet"
• Light & dark themes - Matches system preference

🔒 PRIVACY
100% offline. Your data is processed locally and never sent anywhere. No tracking. No analytics. No servers.

Free. Open source. No ads. Just JSON, done right.
```

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
```
This extension displays JSON content in a readable, navigable format with multiple view modes (Tree, Editor, Schema, YAML, Raw) and search functionality.
```

### Privacy Policy
```
JSON Viewer processes all data locally in your browser. No data is collected, transmitted, or stored externally. The extension works 100% offline.

• No user data collection
• No analytics or tracking
• No external network requests
• No third-party services
• All processing happens locally in your browser
```

### Permissions Justification

| Permission | Justification |
|------------|---------------|
| `contextMenus` | Required to add "View JSON Snippet" option when right-clicking selected text |
| `storage` | Required to save user preferences (theme, expand level) locally |
| `<all_urls>` (content script) | Required to detect and format JSON content on any webpage |

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
