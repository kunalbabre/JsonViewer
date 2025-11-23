import { Viewer } from '../ui/Viewer.js';

let currentViewer = null;

// Initialize
setupTheme();
setupClearButton();
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
        // Fetch content to verify it's not empty
        request.getContent((content, encoding) => {
            if (chrome.runtime.lastError || !content) return;

            // Skip empty responses
            if (content.trim().length === 0) return;
            
            addRequestToList(request);
        });
    }
});

// Clear on navigation
chrome.devtools.network.onNavigated.addListener(() => {
    clearList();
});

function setupSearch() {
    const searchInput = document.getElementById('request-search');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const items = document.querySelectorAll('.jv-request-item');
        
        items.forEach(item => {
            const method = item.querySelector('.jv-request-method').textContent.toLowerCase();
            const url = item.querySelector('.jv-request-url').title.toLowerCase();
            const name = item.querySelector('.jv-request-url').textContent.toLowerCase();
            
            if (method.includes(query) || url.includes(query) || name.includes(query)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    });
}

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

    // Apply current search filter
    const searchInput = document.getElementById('request-search');
    if (searchInput && searchInput.value) {
        const query = searchInput.value.toLowerCase();
        const method = request.request.method.toLowerCase();
        const urlStr = request.request.url.toLowerCase();
        const nameStr = name.toLowerCase();
        
        if (!method.includes(query) && !urlStr.includes(query) && !nameStr.includes(query)) {
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
                // Trim content to handle potential BOM or trailing whitespace issues
                const json = JSON.parse(content.trim());
                renderViewer(json, content);
            } catch (e) {
                console.error('Failed to parse JSON', e);
                // Show viewer with invalid flag
                renderViewer(null, content, { isInvalid: true });
            }
        });
    };
    
    list.appendChild(item);
}

function renderViewer(json, rawData, options = {}) {
    const root = document.getElementById('viewer-root');
    root.innerHTML = ''; // Clear placeholder
    
    currentViewer = new Viewer(root, json, rawData, options);
}

