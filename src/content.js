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

let currentModalCleanup = null;

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
    
    // Close Button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'jv-modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => closeModal();
    content.appendChild(closeBtn);

    // Viewer Container
    const viewerRoot = document.createElement('div');
    viewerRoot.className = 'jv-modal-viewer';
    content.appendChild(viewerRoot);

    modal.appendChild(content);
    document.body.appendChild(modal);

    // Initialize Viewer
    // We need to ensure Viewer is loaded
    const options = { expandAll: true };
    if (typeof Viewer !== 'undefined') {
        new Viewer(viewerRoot, json, rawData, options);
    } else {
        // Should be loaded by now, but just in case
        (async () => {
            const src = chrome.runtime.getURL('src/ui/Viewer.js');
            const module = await import(src);
            new module.Viewer(viewerRoot, json, rawData, options);
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

// Helper to check if text is valid JSON
function isValidJson(text) {
    if (!text || text.length < 2) return false;
    text = text.trim();
    if (!((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']')))) return false;
    try {
        JSON.parse(text);
        return true;
    } catch (e) {
        return false;
    }
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
const requestIdleCallback = window.requestIdleCallback || function(cb) {
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
                    const element = entry.target;
                    
                    // Stop observing once processed
                    codeBlockObserver.unobserve(element);
                    
                    if (element.dataset.jvProcessed) return;
                    if (element.closest('#json-viewer-root') || element.closest('#jv-modal-root')) return;
                    
                    const text = element.textContent;
                    // Quick check before expensive parse
                    if (text.length > 2 && (text.trim().startsWith('{') || text.trim().startsWith('['))) {
                        // Defer parsing to idle time to avoid blocking scroll
                        requestIdleCallback(() => {
                            // Check again in case it was processed while waiting in queue (e.g. by parent PRE)
                            if (element.dataset.jvProcessed) return;

                            if (isValidJson(text)) {
                                injectViewButton(element, text);
                                element.dataset.jvProcessed = 'true';
                                // Mark children code blocks as processed too
                                if (element.tagName === 'PRE') {
                                    element.querySelectorAll('code').forEach(c => c.dataset.jvProcessed = 'true');
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
            const observer = new MutationObserver((mutations) => {
                // Simple debounce
                if (window.jvScanTimeout) clearTimeout(window.jvScanTimeout);
                window.jvScanTimeout = setTimeout(scanForJsonCodeBlocks, 1000);
            });
            observer.observe(document.body, { childList: true, subtree: true });

            // Detect raw JSON on any page (including file://)

            // Detect raw JSON on any page (including file://)
            let content = '';
            let isRawJson = false;

            // Strict check: Only activate full viewer if the page is clearly a JSON response.
            // We avoid activating on regular HTML pages that happen to have a code block.

            // 1. Check Content-Type header (if available)
            const jsonContentTypes = ['application/json', 'text/json', 'application/vnd.api+json'];
            if (jsonContentTypes.includes(document.contentType)) {
                content = document.body.innerText;
                isRawJson = true;
            }
            // 2. Check for Chrome/Firefox default view (Single PRE element wrapping the content)
            else if (document.body.children.length === 1 && document.body.firstElementChild.tagName === 'PRE') {
                const text = document.body.firstElementChild.innerText.trim();
                if (isJSON(text)) {
                    content = text;
                    isRawJson = true;
                }
            }
            // 3. Check for Plain Text body (no HTML tags, just text)
            else if (document.body.children.length === 0 && document.body.innerText.trim().length > 0) {
                const text = document.body.innerText.trim();
                if (isJSON(text)) {
                    content = text;
                    isRawJson = true;
                }
            }

            if (!isRawJson) {
                console.log('JSON Viewer: Page is not raw JSON, skipping full viewer.');
                return;
            }

            if (!isJSON(content)) {
                console.log('JSON Viewer: Not valid JSON content');
                return;
            }
            console.log('JSON Viewer: JSON detected!');

            try {
                // Show loading indicator for large files
                const isLargeFile = content.length > LARGE_FILE_THRESHOLD;
                const isVeryLargeFile = content.length > VERY_LARGE_FILE_THRESHOLD;
                
                if (isLargeFile) {
                    document.body.innerHTML = '';
                    document.body.classList.add('json-viewer-active');
                    const loader = document.createElement('div');
                    loader.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-size:18px;color:#666;gap:10px;';
                    const sizeText = (content.length / 1024 / 1024).toFixed(2);
                    loader.innerHTML = `
                        <div>Loading large JSON file (${sizeText} MB)...</div>
                        <div style="font-size:14px;color:#999;">This may take a moment</div>
                    `;
                    document.body.appendChild(loader);
                }

                // For very large files, use Web Worker if available
                // Note: Worker code is inlined to avoid CSP issues in extension context
                const parseJSON = (text) => {
                    return new Promise((resolve, reject) => {
                        if (isVeryLargeFile && typeof Worker !== 'undefined') {
                            // Use Web Worker for large files to avoid blocking UI
                            try {
                                const workerCode = `
                                    self.onmessage = function(e) {
                                        try {
                                            const parsed = JSON.parse(e.data);
                                            self.postMessage({ success: true, data: parsed });
                                        } catch (error) {
                                            self.postMessage({ success: false, error: error.message });
                                        }
                                    };
                                `;
                                const blob = new Blob([workerCode], { type: 'application/javascript' });
                                const blobURL = URL.createObjectURL(blob);
                                const worker = new Worker(blobURL);
                                
                                worker.onmessage = (e) => {
                                    worker.terminate();
                                    URL.revokeObjectURL(blobURL); // Clean up blob URL
                                    if (e.data.success) {
                                        resolve(e.data.data);
                                    } else {
                                        reject(new Error(e.data.error));
                                    }
                                };
                                
                                worker.onerror = (error) => {
                                    console.warn('JSON Viewer: Worker failed, falling back to main thread', error.message);
                                    worker.terminate();
                                    URL.revokeObjectURL(blobURL); // Clean up blob URL
                                    // Fallback to main thread
                                    try {
                                        resolve(JSON.parse(text));
                                    } catch (e) {
                                        reject(e);
                                    }
                                };
                                
                                worker.postMessage(text);
                            } catch (e) {
                                // Fallback to main thread if Worker fails
                                resolve(JSON.parse(text));
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
                        const json = await parseJSON(content);

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