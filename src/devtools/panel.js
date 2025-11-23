import { Viewer } from '../ui/Viewer.js';

let currentViewer = null;

// Initialize
setupTheme();
setupClearButton();

// Listen for network requests
chrome.devtools.network.onRequestFinished.addListener(request => {
    if (!request.response || !request.response.content) return;

    const mimeType = (request.response.content.mimeType || '').toLowerCase();
    
    // Initial filter by MIME type
    const isJsonMime = mimeType.includes('json') || 
                   mimeType.includes('javascript') || 
                   mimeType.includes('application/vnd.api+json');

    if (isJsonMime) {
        // Verify content is actually valid JSON before adding to list
        request.getContent((content, encoding) => {
            if (chrome.runtime.lastError || !content) return;

            // Optimization: Check first/last char before parsing
            const trimmed = content.trim();
            if (trimmed.length < 2) return;
            
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                try {
                    // Only add if it parses successfully
                    JSON.parse(trimmed);
                    addRequestToList(request);
                } catch (e) {
                    // Not valid JSON, ignore
                }
            }
        });
    }
});

// Clear on navigation
chrome.devtools.network.onNavigated.addListener(() => {
    clearList();
});

function setupClearButton() {
    const btn = document.getElementById('clear-btn');
    if (btn) {
        btn.onclick = clearList;
    }
}

function clearList() {
    const list = document.getElementById('request-list');
    if (list) list.innerHTML = '';
    
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

function addRequestToList(request) {
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
    
    item.innerHTML = `
        <div style="display:flex;align-items:center;">
            <span class="jv-request-method">${request.request.method}</span>
            <span class="jv-request-url" title="${request.request.url}">${name}</span>
        </div>
        <div class="jv-request-status">${request.response.status} ${request.response.statusText}</div>
    `;
    
    item.onclick = () => {
        // Highlight
        document.querySelectorAll('.jv-request-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        // Show loading state
        const root = document.getElementById('viewer-root');
        root.innerHTML = '<div class="jv-placeholder">Loading...</div>';

        // Load content
        request.getContent((content, encoding) => {
            if (chrome.runtime.lastError) {
                root.innerHTML = `<div style="padding:20px;color:red;">Error loading content: ${chrome.runtime.lastError.message}</div>`;
                return;
            }

            if (!content) {
                root.innerHTML = `<div style="padding:20px;color:var(--null-color);">No content available</div>`;
                return;
            }

            try {
                const json = JSON.parse(content);
                renderViewer(json, content);
            } catch (e) {
                console.error('Failed to parse JSON', e);
                root.innerHTML = `<div style="padding:20px;color:red;">Failed to parse JSON: ${e.message}<br><br><pre style="font-size:11px;color:var(--text-color);">${content.substring(0, 500)}...</pre></div>`;
            }
        });
    };
    
    list.appendChild(item);
}

function renderViewer(json, rawData) {
    const root = document.getElementById('viewer-root');
    root.innerHTML = ''; // Clear placeholder
    
    // Re-apply theme class to root if needed (Viewer might expect it on body, which we have)
    currentViewer = new Viewer(root, json, rawData, { expandAll: false });
}
