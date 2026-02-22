// Simple notification function (used before Toast is available)
function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 2147483647;
        padding: 12px 20px; border-radius: 8px; font-family: system-ui, sans-serif;
        font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        background: ${isError ? '#fee2e2' : '#f0fdf4'};
        color: ${isError ? '#dc2626' : '#166534'};
        border: 1px solid ${isError ? '#fca5a5' : '#86efac'};
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 4000);
}

// Simple JSON detection logic
function isJSON(text) {
    if (!text) return false;
    text = text.trim();
    // Check basic structure
    if (!((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']')))) {
        return false;
    }
    // For large files, do a lightweight validation on a prefix instead of full parse
    if (text.length > 50000) {
        try {
            // Parse first 1KB to check for valid JSON structure
            const sample = text.substring(0, 1024);
            // Check that the sample contains valid JSON tokens (keys, colons, commas)
            const hasJsonTokens = /^\s*[{[]\s*("([^"\\]|\\.)*"\s*:\s*|"|\d|true|false|null|\[|\{)/.test(sample);
            return hasJsonTokens;
        } catch (e) {
            return false;
        }
    }
    try {
        JSON.parse(text);
        return true;
    } catch (e) {
        return false;
    }
}

// Detect JSON Lines (.jsonl / .ndjson) — each line is a separate JSON object
function isJSONL(text) {
    if (!text) return false;
    text = text.trim();
    // Must start with { and have multiple lines
    if (!text.startsWith('{')) return false;
    const firstNewline = text.indexOf('\n');
    if (firstNewline === -1) return false;
    // Try parsing the first line
    try {
        JSON.parse(text.substring(0, firstNewline).trim());
        return true;
    } catch (e) {
        return false;
    }
}

// Convert JSONL text to a JSON array string
function jsonlToArray(text) {
    const lines = text.trim().split('\n').filter(l => l.trim());
    const objects = [];
    for (const line of lines) {
        try {
            objects.push(JSON.parse(line.trim()));
        } catch (e) {
            // Skip malformed lines
        }
    }
    return objects;
}

// Performance tuning constants - optimized for 50MB+ files
const LARGE_FILE_THRESHOLD = 5242880; // 5 MB threshold for showing loading indicator (increased from 1MB)
const VERY_LARGE_FILE_THRESHOLD = 10485760; // 10 MB threshold for using Web Worker (non-blocking parse)

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
                    showNotification('Selected text does not look like JSON', true);
                    sendResponse({ success: false });
                    return true;
                }

                const json = JSON.parse(text);
                showModal(json, text);
                sendResponse({ success: true });
            } catch (e) {
                showNotification('Invalid JSON: ' + e.message, true);
                sendResponse({ success: false, error: e.message });
            }
            return true;
        }
        sendResponse({ success: true });
        return true;
    });
}

let currentModalCleanup = null;
let currentModalViewer = null;

function showModal(json, rawData) {
    // Cleanup existing modal if any
    if (currentModalCleanup) {
        currentModalCleanup();
    }

    // Double check DOM just in case
    const existing = document.getElementById('jv-modal-root');
    if (existing) existing.remove();

    // Prevent background scrolling
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Handle Escape
    let escHandler;
    const closeModal = () => {
        // Clean up viewer to prevent memory leaks
        if (currentModalViewer?.destroy) {
            currentModalViewer.destroy();
        }
        currentModalViewer = null;

        const m = document.getElementById('jv-modal-root');
        if (m) m.remove();
        document.body.style.overflow = originalOverflow;
        if (escHandler) document.removeEventListener('keydown', escHandler);
        currentModalCleanup = null;
    };

    currentModalCleanup = closeModal;

    // Create Modal Container
    const modal = document.createElement('div');
    modal.id = 'jv-modal-root';
    modal.className = 'jv-modal-overlay';
    
    // Close on click outside
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    // Modal Content
    const content = document.createElement('div');
    content.className = 'jv-modal-content';

    // Viewer Container
    const viewerRoot = document.createElement('div');
    viewerRoot.className = 'jv-modal-viewer';
    content.appendChild(viewerRoot);

    modal.appendChild(content);
    document.body.appendChild(modal);

    // Initialize theme for modal based on current state, stored preference, or system preference
    const hasManualDarkTheme = document.body.classList.contains('dark-theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    let storedTheme = null;
    try {
        storedTheme = localStorage.getItem('json-viewer-theme');
    } catch (e) {
        // localStorage might not be available in all contexts
    }
    
    const shouldUseDark = hasManualDarkTheme || 
                         storedTheme === 'dark' || 
                         (!document.body.classList.contains('light-theme') && !storedTheme && systemPrefersDark);
    
    if (shouldUseDark) {
        modal.classList.add('dark-theme');
        content.classList.add('dark-theme');
    }

    // Initialize Viewer
    // We need to ensure Viewer is loaded
    const options = { expandAll: true, onClose: () => closeModal() };
    if (typeof window.Viewer !== 'undefined') {
        currentModalViewer = new window.Viewer(viewerRoot, json, rawData, options);
    } else {
        // Should be loaded by now, but just in case
        (async () => {
            const src = chrome.runtime.getURL('src/ui/Viewer.js');
            const module = await import(src);
            // Check if modal was closed during async load
            if (!document.getElementById('jv-modal-root')) return;
            currentModalViewer = new module.Viewer(viewerRoot, json, rawData, options);
        })();
    }
    
    // Handle Escape
    escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    };
    document.addEventListener('keydown', escHandler);
}

// isValidJson delegates to isJSON for consistency
function isValidJson(text) {
    if (!text || text.length < 2) return false;
    return isJSON(text);
}

function injectViewButton(element, jsonText) {
    // Check if button already exists to prevent duplicates
    if (element.querySelector('.jv-sticky-wrapper')) return;

    // Ensure element is positioned so we can absolute position the button
    const style = window.getComputedStyle(element);
    if (style.position === 'static') {
        element.classList.add('jv-relative');
    }

    // Create sticky wrapper to keep button in view during scroll
    const wrapper = document.createElement('div');
    wrapper.className = 'jv-sticky-wrapper';

    const btn = document.createElement('button');
    btn.className = 'jv-snippet-btn';
    btn.title = 'View in JSON Viewer';
    // Use the tree icon
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><line x1="10" y1="6.5" x2="14" y2="6.5"/><path d="M6.5 10v8h7.5"/></svg>';
    
    btn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        try {
            const json = JSON.parse(jsonText);
            // Pass expandAll: true to ensure tree is expanded
            showModal(json, jsonText);
        } catch (e) {
            console.error('Failed to parse JSON', e);
        }
    };

    wrapper.appendChild(btn);
    
    // Prepend to element so sticky positioning works correctly from the top
    if (element.firstChild) {
        element.insertBefore(wrapper, element.firstChild);
    } else {
        element.appendChild(wrapper);
    }
}

// Polyfill for requestIdleCallback
const idleCallback = window.requestIdleCallback || function(cb) {
    return setTimeout(() => {
        const start = Date.now();
        cb({
            didTimeout: false,
            timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
        });
    }, 1);
};

let codeBlockObserver;

function scanForJsonCodeBlocks() {
    // Initialize observer once
    if (!codeBlockObserver) {
        codeBlockObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    /** @type {HTMLElement} */
                    const element = /** @type {HTMLElement} */ (entry.target);

                    // Stop observing once processed
                    codeBlockObserver.unobserve(element);

                    if (element.dataset.jvProcessed) return;
                    if (element.closest('#json-viewer-root') || element.closest('#jv-modal-root')) return;
                    
                    const text = element.textContent;
                    // Quick check before expensive parse
                    if (text.length > 2 && (text.trim().startsWith('{') || text.trim().startsWith('['))) {
                        // Defer parsing to idle time to avoid blocking scroll
                        idleCallback(() => {
                            // Check again in case it was processed while waiting in queue (e.g. by parent PRE)
                            if (element.dataset.jvProcessed) return;

                            if (isValidJson(text)) {
                                injectViewButton(element, text);
                                element.dataset.jvProcessed = 'true';
                                // Mark children code blocks as processed too
                                if (element.tagName === 'PRE') {
                                    element.querySelectorAll('code').forEach(c => /** @type {HTMLElement} */ (c).dataset.jvProcessed = 'true');
                                }
                            }
                        }, { timeout: 1000 });
                    }
                }
            });
        }, {
            rootMargin: '200px' // Pre-load slightly before visible
        });
    }

    // 1. Look for PRE elements
    document.querySelectorAll('pre').forEach(pre => {
        if (!pre.dataset.jvProcessed) codeBlockObserver.observe(pre);
    });

    // 2. Look for CODE elements (that weren't handled by PRE)
    document.querySelectorAll('code').forEach(code => {
        if (!code.dataset.jvProcessed) codeBlockObserver.observe(code);
    });
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

            // Scan for code blocks
            setTimeout(scanForJsonCodeBlocks, 1000);
            // Optional: Observe for dynamic content
            const mutationObserver = new MutationObserver((_mutations) => {
                // Simple debounce
                if (window.jvScanTimeout) clearTimeout(window.jvScanTimeout);
                window.jvScanTimeout = setTimeout(scanForJsonCodeBlocks, 1000);
            });
            mutationObserver.observe(document.body, { childList: true, subtree: true });

            // Clean up observers on page unload
            window.addEventListener('unload', () => {
                mutationObserver.disconnect();
                if (codeBlockObserver) {
                    codeBlockObserver.disconnect();
                }
            });

            // Detect raw JSON on any page (including file://)
            let content = '';
            let isRawJson = false;
            let isJsonLines = false;

            // Check URL for known JSON/JSONL extensions
            const urlPath = window.location.pathname.toLowerCase();
            const isJsonlUrl = urlPath.endsWith('.jsonl') || urlPath.endsWith('.ndjson');
            // const isJsonUrl = urlPath.endsWith('.json');

            // Strict check: Only activate full viewer if the page is clearly a JSON response.
            // We avoid activating on regular HTML pages that happen to have a code block.

            // 1. Check Content-Type header (if available)
            const jsonContentTypes = ['application/json', 'text/json', 'application/vnd.api+json', 'application/x-ndjson'];
            if (jsonContentTypes.includes(document.contentType)) {
                content = document.body.innerText;
                isRawJson = true;
                // If content type is ndjson, mark as JSONL
                if (document.contentType === 'application/x-ndjson') {
                    isJsonLines = true;
                }
            }
            // 2. Check URL extension for .jsonl/.ndjson files (often served as text/plain)
            else if (isJsonlUrl) {
                const text = document.body.innerText.trim();
                if (text && isJSONL(text)) {
                    content = text;
                    isRawJson = true;
                    isJsonLines = true;
                }
            }
            // 3. Check for Chrome/Firefox default view (Single PRE element wrapping the content)
            else if (document.body.children.length === 1 && document.body.firstElementChild.tagName === 'PRE') {
                const text = /** @type {HTMLElement} */ (document.body.firstElementChild).innerText.trim();
                if (isJSON(text)) {
                    content = text;
                    isRawJson = true;
                } else if (isJSONL(text)) {
                    content = text;
                    isRawJson = true;
                    isJsonLines = true;
                }
            }
            // 3. Check for Plain Text body (no HTML tags, just text)
            else if (document.body.children.length === 0 && document.body.innerText.trim().length > 0) {
                const text = document.body.innerText.trim();
                if (isJSON(text)) {
                    content = text;
                    isRawJson = true;
                } else if (isJSONL(text)) {
                    content = text;
                    isRawJson = true;
                    isJsonLines = true;
                }
            }

            if (!isRawJson) {
                console.log('JSON Viewer: Page is not raw JSON, skipping full viewer.');
                return;
            }

            if (!isJSON(content) && !isJsonLines) {
                console.log('JSON Viewer: Not valid JSON content');
                return;
            }
            console.log('JSON Viewer: JSON detected!' + (isJsonLines ? ' (JSONL format)' : ''));

            try {
                // Show loading indicator for large files
                const isLargeFile = content.length > LARGE_FILE_THRESHOLD;
                const isVeryLargeFile = content.length > VERY_LARGE_FILE_THRESHOLD;
                
                if (isLargeFile) {
                    // Preserve original content before replacing
                    const originalContent = document.createElement('div');
                    originalContent.id = 'jv-original-content';
                    originalContent.style.display = 'none';
                    while (document.body.firstChild) {
                        originalContent.appendChild(document.body.firstChild);
                    }
                    document.body.appendChild(originalContent);

                    document.body.classList.add('json-viewer-active');
                    const loader = document.createElement('div');
                    loader.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-size:18px;color:#666;gap:10px;';
                    const sizeText = (content.length / 1024 / 1024).toFixed(2);

                    const loadingMsg = document.createElement('div');
                    loadingMsg.textContent = `Loading large JSON file (${sizeText} MB)...`;
                    loader.appendChild(loadingMsg);

                    const subMsg = document.createElement('div');
                    subMsg.style.cssText = 'font-size:14px;color:#999;';
                    subMsg.textContent = 'This may take a moment';
                    loader.appendChild(subMsg);

                    document.body.appendChild(loader);
                }

                // For very large files, use Web Worker if available
                const parseJSON = (text) => {
                    return new Promise((resolve, reject) => {
                        if (isVeryLargeFile && typeof Worker !== 'undefined') {
                            // Use Web Worker for large files to avoid blocking UI
                            try {
                                // Check if chrome.runtime is available
                                if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) {
                                    // No chrome.runtime, fall back to main thread
                                    resolve(JSON.parse(text));
                                    return;
                                }

                                const workerUrl = chrome.runtime.getURL('src/workers/parse-worker.js');
                                const worker = new Worker(workerUrl);

                                // Timeout for worker - fall back to main thread after 30s
                                const workerTimeout = setTimeout(() => {
                                    console.warn('JSON Viewer: Parse worker timeout, falling back to main thread');
                                    worker.terminate();
                                    try {
                                        resolve(JSON.parse(text));
                                    } catch (e) {
                                        reject(e);
                                    }
                                }, 30000);

                                worker.onmessage = (e) => {
                                    clearTimeout(workerTimeout);
                                    worker.terminate();
                                    if (e.data.success) {
                                        resolve(e.data.data);
                                    } else {
                                        reject(new Error(e.data.error));
                                    }
                                };

                                worker.onerror = (err) => {
                                    // Worker failed (likely CSP), fall back to main thread
                                    console.warn('JSON Viewer: Parse worker failed, falling back to main thread:', err);
                                    clearTimeout(workerTimeout);
                                    worker.terminate();
                                    try {
                                        resolve(JSON.parse(text));
                                    } catch (e) {
                                        reject(e);
                                    }
                                };

                                worker.postMessage(text);
                            } catch (e) {
                                // Fallback to main thread if Worker creation fails
                                console.warn('JSON Viewer: Worker creation failed, falling back to main thread:', e);
                                try {
                                    resolve(JSON.parse(text));
                                } catch (parseError) {
                                    reject(parseError);
                                }
                            }
                        } else {
                            // Use main thread for smaller files or if Worker not available
                            try {
                                resolve(JSON.parse(text));
                            } catch (e) {
                                reject(e);
                            }
                        }
                    });
                };

                // Use setTimeout to allow UI to update before parsing
                setTimeout(async () => {
                    try {
                        let json;
                        let rawForViewer = content;
                        if (isJsonLines) {
                            // Convert JSONL to array
                            json = jsonlToArray(content);
                            rawForViewer = JSON.stringify(json, null, 2);
                        } else {
                            json = await parseJSON(content);
                        }

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
                        new Viewer(root, json, rawForViewer);
                    } catch (e) {
                        console.error('JSON Viewer: Failed to parse JSON', e);
                        // If we showed a loader, show an error and restore original content
                        if (isLargeFile) {
                            // Remove loader
                            const loader = document.body.querySelector('div[style*="justify-content:center"]');
                            if (loader) loader.remove();

                            const errorDiv = document.createElement('div');
                            errorDiv.style.cssText = 'padding: 20px; color: red;';
                            errorDiv.textContent = 'Failed to parse JSON: ' + e.message;
                            document.body.appendChild(errorDiv);

                            // Restore original content visibility
                            const original = document.getElementById('jv-original-content');
                            if (original) {
                                original.style.display = 'block';
                                document.body.classList.remove('json-viewer-active');
                            }
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