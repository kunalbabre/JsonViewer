import { Viewer } from '../ui/Viewer.js';

let currentViewer = null;
let lastSelectedView = null;

// Initialize
setupTheme();
setupClearButton();
setupManualButton();
setupSearch();

// Listen for network requests
chrome.devtools.network.onRequestFinished.addListener(request => {
    if (!request.response || !request.response.content) return;

    const mimeType = (request.response.content.mimeType || '').toLowerCase();
    
    // Filter out known binary/media types to avoid performance issues
    // We allow text/*, application/* (except specific binaries), etc.
    const isMedia = mimeType.startsWith('image/') || 
                    mimeType.startsWith('audio/') || 
                    mimeType.startsWith('video/') || 
                    mimeType.startsWith('font/');

    if (!isMedia) {
        // Only fetch content for types that could be JSON
        const isLikelyJson = mimeType.includes('json') || 
                             mimeType === 'text/plain' || 
                             mimeType === 'application/octet-stream' ||
                             mimeType === 'application/x-amz-json-1.1' ||
                             mimeType === '';
        if (!isLikelyJson) return;

        // Fetch content to verify it's not empty
        request.getContent((content, _encoding) => {
            if (chrome.runtime.lastError || !content) return;

            // Skip empty responses
            if (content.trim().length === 0) return;
            
            addRequestToList(request, content);
        });
    }
});

// Clear on navigation
chrome.devtools.network.onNavigated.addListener(() => {
    clearList();
});

function setupSearch() {
    const searchInput = /** @type {HTMLInputElement} */ (document.getElementById('request-search'));
    const jsonFilter = /** @type {HTMLInputElement} */ (document.getElementById('json-only-filter'));

    const filterRequests = () => {
        const query = searchInput ? searchInput.value.toLowerCase() : '';
        const jsonOnly = jsonFilter ? jsonFilter.checked : false;

        const items = document.querySelectorAll('.jv-request-item');

        items.forEach(el => {
            const item = /** @type {HTMLElement} */ (el);
            const method = item.querySelector('.jv-request-method').textContent.toLowerCase();
            const url = /** @type {HTMLElement} */ (item.querySelector('.jv-request-url')).title.toLowerCase();
            const name = item.querySelector('.jv-request-url').textContent.toLowerCase();
            const status = item.querySelector('.jv-request-status').textContent.toLowerCase();
            const isJson = item.dataset.isJson === 'true';

            const matchesText = !query || method.includes(query) || url.includes(query) || name.includes(query) || status.includes(query);
            const matchesType = !jsonOnly || isJson;

            if (matchesText && matchesType) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    };

    if (searchInput) searchInput.addEventListener('input', filterRequests);
    if (jsonFilter) jsonFilter.addEventListener('change', filterRequests);
}

function setupClearButton() {
    const btn = document.getElementById('clear-btn');
    if (btn) {
        btn.onclick = clearList;
    }
}

function setupManualButton() {
    const btn = document.getElementById('manual-btn');
    if (btn) {
        btn.onclick = () => {
            // Deselect list items
            document.querySelectorAll('.jv-request-item').forEach(i => i.classList.remove('active'));
            
            // Destroy previous viewer to prevent memory leaks
            if (currentViewer?.destroy) currentViewer.destroy();

            const root = document.getElementById('viewer-root');
            root.innerHTML = '';
            
            // Open viewer in "invalid" mode (Editor view) with empty content
            // This allows the user to paste anything
            currentViewer = new Viewer(root, null, "", { isInvalid: true });
            
            // Try to focus the textarea if possible
            setTimeout(() => {
                const textarea = root.querySelector('textarea');
                if (textarea) textarea.focus();
            }, 100);
        };
    }
}

function clearList() {
    const list = document.getElementById('request-list');
    if (list) list.innerHTML = '';
    
    // Destroy previous viewer to prevent memory leaks
    if (currentViewer?.destroy) currentViewer.destroy();

    const root = document.getElementById('viewer-root');
    if (root) {
        root.innerHTML = `
            <div class="jv-placeholder">
                <div style="text-align: center;">
                    <p>Select a JSON request to view</p>
                    <p style="font-size: 0.8em; opacity: 0.7;">Monitoring network traffic...</p>
                    <div style="margin-top: 20px; font-size: 0.85em; opacity: 0.6; max-width: 280px; line-height: 1.5;">
                        Note: Extensions cannot modify the native Network tab. Use this panel to inspect JSON, or right-click a request and "Open in new tab".
                    </div>
                </div>
            </div>
        `;
    }
    currentViewer = null;
}

function setupTheme() {
    const updateTheme = () => {
        if (chrome.devtools.panels.themeName === 'dark') {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    };
    
    updateTheme();
    
    // Try to listen for theme changes (Chrome 54+)
    if (chrome.devtools.panels.onThemeChanged) {
        chrome.devtools.panels.onThemeChanged.addListener(updateTheme);
    }
}

function addRequestToList(request, content) {
    const list = document.getElementById('request-list');
    const item = document.createElement('div');
    item.className = 'jv-request-item';
    
    let url;
    try {
        url = new URL(request.request.url);
    } catch (e) {
        url = { pathname: request.request.url, hostname: '' };
    }
    
    const name = url.pathname.split('/').pop() || url.hostname || 'Request';
    
    // Check if it's likely JSON
    const mimeType = (request.response.content.mimeType || '').toLowerCase();
    let isJson = mimeType.includes('json') || mimeType.includes('application/x-amz-json-1.1');
    
    // If not explicitly JSON, check content for JSON-like structure
    if (!isJson && content) {
        const trimmed = content.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            isJson = true;
        }
    }
    
    item.dataset.isJson = isJson;

    // Build item content using DOM manipulation to prevent XSS
    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;align-items:center;';

    const methodSpan = document.createElement('span');
    methodSpan.className = 'jv-request-method';
    methodSpan.textContent = request.request.method;
    row1.appendChild(methodSpan);

    const urlSpan = document.createElement('span');
    urlSpan.className = 'jv-request-url';
    urlSpan.title = request.request.url;
    urlSpan.textContent = name;
    row1.appendChild(urlSpan);

    const statusDiv = document.createElement('div');
    statusDiv.className = 'jv-request-status';
    statusDiv.textContent = `${request.response.status} ${request.response.statusText}`;

    item.appendChild(row1);
    item.appendChild(statusDiv);

    // Apply current filters
    const searchInput = /** @type {HTMLInputElement} */ (document.getElementById('request-search'));
    const jsonFilter = /** @type {HTMLInputElement} */ (document.getElementById('json-only-filter'));

    if (searchInput || jsonFilter) {
        const query = searchInput ? searchInput.value.toLowerCase() : '';
        const jsonOnly = jsonFilter ? jsonFilter.checked : false;
        
        const method = request.request.method.toLowerCase();
        const urlStr = request.request.url.toLowerCase();
        const nameStr = name.toLowerCase();
        const status = (request.response.status + ' ' + request.response.statusText).toLowerCase();
        
        const matchesText = !query || method.includes(query) || urlStr.includes(query) || nameStr.includes(query) || status.includes(query);
        const matchesType = !jsonOnly || isJson;

        if (!matchesText || !matchesType) {
            item.style.display = 'none';
        }
    }
    
    item.onclick = () => {
        // Highlight
        document.querySelectorAll('.jv-request-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        // Show loading state
        const root = document.getElementById('viewer-root');
        root.innerHTML = '<div class="jv-placeholder">Loading...</div>';

        // Load content
        request.getContent((content, _encoding) => {
            if (chrome.runtime.lastError) {
                root.innerHTML = '';
                const errorDiv = document.createElement('div');
                errorDiv.style.cssText = 'padding:20px;color:red;';
                errorDiv.textContent = 'Error loading content: ' + chrome.runtime.lastError.message;
                root.appendChild(errorDiv);
                return;
            }

            if (!content) {
                root.innerHTML = `<div style="padding:20px;color:var(--null-color);">No content available</div>`;
                return;
            }

            try {
                // Trim content to handle potential BOM or trailing whitespace issues
                const json = JSON.parse(content.trim());
                renderViewer(json, content);
            } catch (e) {
                // Not JSON, render as raw text
                renderViewer(null, content, { isInvalid: true });
            }
        });
    };
    
    list.appendChild(item);
}

function renderViewer(json, rawData, options = {}) {
    const root = document.getElementById('viewer-root');

    // Destroy previous viewer to prevent memory leaks
    if (currentViewer?.destroy) currentViewer.destroy();

    root.innerHTML = ''; // Clear placeholder
    
    // Merge options with sticky view preference
    const viewerOptions = {
        ...options,
        initialView: lastSelectedView || options.initialView,
        onViewChange: (view) => {
            lastSelectedView = view;
        }
    };

    currentViewer = new Viewer(root, json, rawData, viewerOptions);
}

// Listen for context menu snippet
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'viewSnippetFromContextMenu') {
        // Check if this panel is inspecting the tab where the selection happened
        if (message.tabId === chrome.devtools.inspectedWindow.tabId) {
            
            // Deselect any active request
            document.querySelectorAll('.jv-request-item').forEach(i => i.classList.remove('active'));

            // Render the content
            try {
                const json = JSON.parse(message.content);
                renderViewer(json, message.content);
            } catch (e) {
                renderViewer(null, message.content, { isInvalid: true });
            }
            
            // Notify background that we handled it
            sendResponse({ received: true });
        }
    }
});

