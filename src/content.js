// Simple JSON detection logic
function isJSON(text) {
    if (!text) return false;
    text = text.trim();
    // Check basic structure
    if (!((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']')))) {
        return false;
    }
    // For large files, skip the expensive parse check here. 
    // We will catch errors during the actual parsing phase.
    if (text.length > 50000) {
        return true;
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

// Listen for toggle command from background script
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'toggle') {
            const root = document.getElementById('json-viewer-root');
            const original = document.getElementById('jv-original-content');
            
            if (root && original) {
                if (root.style.display === 'none') {
                    // Show Viewer
                    root.style.display = 'block';
                    original.style.display = 'none';
                    document.body.classList.add('json-viewer-active');
                } else {
                    // Show Original
                    root.style.display = 'none';
                    original.style.display = 'block';
                    document.body.classList.remove('json-viewer-active');
                }
            }
        } else if (request.action === 'viewSnippet') {
            try {
                const text = request.content.trim();
                // Basic validation
                if (!text.startsWith('{') && !text.startsWith('[')) {
                    alert('Selected text does not look like JSON');
                    return;
                }
                
                const json = JSON.parse(text);
                showModal(json, text);
            } catch (e) {
                alert('Invalid JSON: ' + e.message);
            }
        }
    });
}

function showModal(json, rawData) {
    // Remove existing modal if any
    const existing = document.getElementById('jv-modal-root');
    if (existing) existing.remove();

    // Create Modal Container
    const modal = document.createElement('div');
    modal.id = 'jv-modal-root';
    modal.className = 'jv-modal-overlay';
    
    // Close on click outside
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    // Modal Content
    const content = document.createElement('div');
    content.className = 'jv-modal-content';
    
    // Close Button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'jv-modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => modal.remove();
    content.appendChild(closeBtn);

    // Viewer Container
    const viewerRoot = document.createElement('div');
    viewerRoot.className = 'jv-modal-viewer';
    content.appendChild(viewerRoot);

    modal.appendChild(content);
    document.body.appendChild(modal);

    // Initialize Viewer
    // We need to ensure Viewer is loaded
    if (typeof Viewer !== 'undefined') {
        new Viewer(viewerRoot, json, rawData);
    } else {
        // Should be loaded by now, but just in case
        (async () => {
            const src = chrome.runtime.getURL('src/ui/Viewer.js');
            const module = await import(src);
            new module.Viewer(viewerRoot, json, rawData);
        })();
    }
    
    // Handle Escape
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

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
            // Expose Viewer globally for modal usage
            window.Viewer = Viewer;

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
                    try {
                        const json = JSON.parse(content);

                        // Prepare original content for toggling
                        const originalContainer = document.createElement('div');
                        originalContainer.id = 'jv-original-content';
                        originalContainer.style.display = 'none';
                        
                        // Move all existing body children to originalContainer
                        while (document.body.firstChild) {
                            originalContainer.appendChild(document.body.firstChild);
                        }
                        document.body.appendChild(originalContainer);
                        document.body.classList.add('json-viewer-active');

                        // Create root element
                        const root = document.createElement('div');
                        root.id = 'json-viewer-root';
                        document.body.appendChild(root);

                        // Initialize Viewer
                        new Viewer(root, json, content);
                    } catch (e) {
                        console.error('JSON Viewer: Failed to parse JSON', e);
                        // If we showed a loader, we should probably show an error now
                        if (isLargeFile) {
                            document.body.innerHTML = `<div style="padding: 20px; color: red;">Failed to parse JSON: ${e.message}</div>`;
                        }
                    }
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