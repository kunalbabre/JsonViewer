// Simple JSON detection logic
function isJSON(text) {
    if (!text) return false;
    text = text.trim();
    if (!((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']')))) {
        return false;
    }
    try {
        JSON.parse(text);
        return true;
    } catch (e) {
        return false;
    }
}

// Performance tuning constant
const LARGE_FILE_THRESHOLD = 1048576; // 1 MB threshold for showing loading indicator

(async function () {
    try {
        let Viewer;

        // Check environment
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
            // Extension Environment
            const src = chrome.runtime.getURL('src/ui/Viewer.js');
            const module = await import(src);
            Viewer = module.Viewer;
        } else {
            // Local Test Environment (test.html)
            // We assume this script is loaded as a module in test.html, so we can import relatively
            // Since content.js is in src/, and Viewer is in src/ui/, we need ./ui/Viewer.js
            const module = await import('./ui/Viewer.js');
            Viewer = module.Viewer;
        }

        function init() {
            console.log('JSON Viewer: Checking page...');

            // Detect raw JSON on any page (including file://)
            let content = '';
            // 1️⃣ Prefer a <pre> element if the page wraps the JSON in one
            const pre = document.querySelector('pre');
            if (pre) {
                content = pre.innerText.trim();
            } else {
                // 2️⃣ Fallback to the whole body text (covers plain‑JSON files with no HTML wrapper)
                content = document.body.innerText.trim();
            }

            if (!isJSON(content)) {
                console.log('JSON Viewer: Not valid JSON content');
                return;
            }
            console.log('JSON Viewer: JSON detected!');

            try {
                // Show loading indicator for large files
                const isLargeFile = content.length > LARGE_FILE_THRESHOLD;
                if (isLargeFile) {
                    document.body.innerHTML = '';
                    document.body.classList.add('json-viewer-active');
                    const loader = document.createElement('div');
                    loader.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;font-size:18px;color:#666;';
                    loader.innerHTML = '<div>Loading large JSON file...</div>';
                    document.body.appendChild(loader);
                }

                // Use setTimeout to allow UI to update before parsing
                setTimeout(() => {
                    const json = JSON.parse(content);

                    // Clear existing content
                    document.body.innerHTML = '';
                    document.body.classList.add('json-viewer-active');

                    // Create root element
                    const root = document.createElement('div');
                    root.id = 'json-viewer-root';
                    document.body.appendChild(root);

                    // Initialize Viewer
                    new Viewer(root, json, content);
                }, isLargeFile ? 100 : 0);
            } catch (e) {
                console.error('JSON Viewer: Failed to parse JSON', e);
            }
        }

        // Run initialization
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    } catch (e) {
        console.error('JSON Viewer: Failed to load modules', e);
    }
})();