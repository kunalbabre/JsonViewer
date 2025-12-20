/**
 * Promo tile HTML templates for Chrome Web Store
 * These create visually appealing promotional images at the required sizes
 */

// Sample JSON that looks good in promo images
const PROMO_JSON = {
    "name": "JSON Viewer",
    "version": "1.0",
    "features": ["Tree View", "Editor", "Schema", "YAML"],
    "settings": {
        "theme": "dark",
        "syntaxHighlight": true
    },
    "stats": {
        "rating": 4.8,
        "downloads": 10000
    }
};

/**
 * Small promo tile template (440x280)
 * Compact view with branding and JSON preview
 */
export function getSmallPromoHTML() {
    return `<!DOCTYPE html>
<html>
<head>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            width: 440px;
            height: 280px;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: white;
            display: flex;
            overflow: hidden;
        }
        .left-panel {
            width: 180px;
            padding: 24px 20px;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        .icon {
            width: 48px;
            height: 48px;
            background: linear-gradient(135deg, #10b981, #0d9488);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 16px;
        }
        .title {
            font-size: 22px;
            font-weight: 700;
            margin-bottom: 8px;
            line-height: 1.1;
        }
        .subtitle {
            font-size: 11px;
            opacity: 0.8;
            line-height: 1.4;
        }
        .right-panel {
            flex: 1;
            padding: 16px 16px 16px 0;
            display: flex;
            align-items: center;
        }
        .json-preview {
            background: #0d1117;
            border-radius: 8px;
            padding: 12px;
            font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            font-size: 10px;
            line-height: 1.5;
            width: 100%;
            height: 100%;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .key { color: #7ee787; }
        .string { color: #a5d6ff; }
        .number { color: #ffa657; }
        .bracket { color: #8b949e; }
        .bool { color: #ff7b72; }
        .indent { margin-left: 12px; }
        .indent2 { margin-left: 24px; }
    </style>
</head>
<body>
    <div class="left-panel">
        <div class="icon">{ }</div>
        <div class="title">JSON<br>Viewer</div>
        <div class="subtitle">Beautiful JSON viewer<br>for Chrome</div>
    </div>
    <div class="right-panel">
        <div class="json-preview">
            <span class="bracket">{</span><br>
            <span class="indent"><span class="key">"name"</span>: <span class="string">"JSON Viewer"</span>,</span><br>
            <span class="indent"><span class="key">"features"</span>: <span class="bracket">[</span></span><br>
            <span class="indent2"><span class="string">"Tree View"</span>,</span><br>
            <span class="indent2"><span class="string">"Editor"</span>,</span><br>
            <span class="indent2"><span class="string">"Schema"</span></span><br>
            <span class="indent"><span class="bracket">]</span>,</span><br>
            <span class="indent"><span class="key">"theme"</span>: <span class="string">"dark"</span>,</span><br>
            <span class="indent"><span class="key">"rating"</span>: <span class="number">4.8</span></span><br>
            <span class="bracket">}</span>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Marquee promo tile template (1400x560)
 * Wide banner with full JSON viewer preview
 */
export function getMarqueePromoHTML() {
    return `<!DOCTYPE html>
<html>
<head>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            width: 1400px;
            height: 560px;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: white;
            display: flex;
            overflow: hidden;
        }
        .left-panel {
            width: 400px;
            padding: 60px 50px;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        .icon {
            width: 72px;
            height: 72px;
            background: linear-gradient(135deg, #10b981, #0d9488);
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
            font-weight: bold;
            margin-bottom: 24px;
            box-shadow: 0 4px 20px rgba(16, 185, 129, 0.3);
        }
        .title {
            font-size: 42px;
            font-weight: 700;
            margin-bottom: 16px;
            line-height: 1.1;
        }
        .subtitle {
            font-size: 18px;
            opacity: 0.85;
            line-height: 1.5;
            margin-bottom: 24px;
        }
        .features {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .feature {
            background: rgba(255,255,255,0.1);
            padding: 6px 12px;
            border-radius: 16px;
            font-size: 12px;
            backdrop-filter: blur(10px);
        }
        .right-panel {
            flex: 1;
            padding: 40px 50px 40px 20px;
            display: flex;
            align-items: center;
        }
        .viewer-mock {
            background: #0d1117;
            border-radius: 12px;
            width: 100%;
            height: 100%;
            overflow: hidden;
            box-shadow: 0 8px 40px rgba(0,0,0,0.4);
            display: flex;
            flex-direction: column;
        }
        .mock-toolbar {
            background: #161b22;
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 16px;
            border-bottom: 1px solid #30363d;
        }
        .mock-tabs {
            display: flex;
            gap: 4px;
        }
        .mock-tab {
            padding: 6px 14px;
            border-radius: 6px;
            font-size: 13px;
            color: #8b949e;
        }
        .mock-tab.active {
            background: #238636;
            color: white;
        }
        .mock-search {
            flex: 1;
            max-width: 300px;
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 6px 12px;
            color: #8b949e;
            font-size: 12px;
        }
        .mock-actions {
            display: flex;
            gap: 8px;
            margin-left: auto;
        }
        .mock-btn {
            background: #21262d;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 6px 12px;
            color: #c9d1d9;
            font-size: 12px;
        }
        .mock-content {
            flex: 1;
            padding: 20px;
            font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.7;
            overflow: hidden;
        }
        .key { color: #7ee787; }
        .string { color: #a5d6ff; }
        .number { color: #ffa657; }
        .bracket { color: #8b949e; }
        .bool { color: #ff7b72; }
        .toggle { color: #8b949e; margin-right: 6px; }
        .node { margin-left: 0; }
        .node-indent { margin-left: 24px; }
        .node-indent2 { margin-left: 48px; }
    </style>
</head>
<body>
    <div class="left-panel">
        <div class="icon">{ }</div>
        <div class="title">JSON Viewer</div>
        <div class="subtitle">Transform raw JSON into something beautiful. Fast, offline, developer-friendly.</div>
        <div class="features">
            <span class="feature">Tree View</span>
            <span class="feature">Editor</span>
            <span class="feature">Schema</span>
            <span class="feature">YAML</span>
            <span class="feature">Dark Mode</span>
            <span class="feature">Search</span>
        </div>
    </div>
    <div class="right-panel">
        <div class="viewer-mock">
            <div class="mock-toolbar">
                <div class="mock-tabs">
                    <span class="mock-tab active">Tree</span>
                    <span class="mock-tab">Editor</span>
                    <span class="mock-tab">Schema</span>
                    <span class="mock-tab">YAML</span>
                    <span class="mock-tab">Raw</span>
                </div>
                <div class="mock-search">Find in document...</div>
                <div class="mock-actions">
                    <span class="mock-btn">Expand</span>
                    <span class="mock-btn">Copy</span>
                    <span class="mock-btn">Save</span>
                </div>
            </div>
            <div class="mock-content">
                <div class="node"><span class="toggle">▼</span><span class="key">"api"</span>: <span class="bracket">{</span> <span style="color:#6e7681">Object 4 items</span></div>
                <div class="node-indent"><span class="toggle">▼</span><span class="key">"endpoints"</span>: <span class="bracket">[</span> <span style="color:#6e7681">Array 3 items</span></div>
                <div class="node-indent2"><span class="key">"0"</span>: <span class="string">"/users"</span></div>
                <div class="node-indent2"><span class="key">"1"</span>: <span class="string">"/products"</span></div>
                <div class="node-indent2"><span class="key">"2"</span>: <span class="string">"/orders"</span></div>
                <div class="node-indent"><span class="key">"version"</span>: <span class="string">"2.0"</span></div>
                <div class="node-indent"><span class="key">"rateLimit"</span>: <span class="number">1000</span></div>
                <div class="node-indent"><span class="key">"authenticated"</span>: <span class="bool">true</span></div>
                <div class="node"><span class="toggle">▶</span><span class="key">"metadata"</span>: <span class="bracket">{</span> <span style="color:#6e7681">Object 3 items</span> <span class="bracket">}</span></div>
                <div class="node"><span class="toggle">▶</span><span class="key">"config"</span>: <span class="bracket">{</span> <span style="color:#6e7681">Object 5 items</span> <span class="bracket">}</span></div>
            </div>
        </div>
    </div>
</body>
</html>`;
}
