import { Viewer } from './ui/Viewer.js';

document.addEventListener('DOMContentLoaded', () => {
    // Get viewer content ID from URL params, fallback to legacy key
    const params = new URLSearchParams(window.location.search);
    const viewerId = params.get('id') || 'viewerContent';

    chrome.storage.local.get([viewerId], (result) => {
        const content = result[viewerId];

        // Clean up stored content to prevent stale data and wasted storage
        chrome.storage.local.remove([viewerId]);

        const root = document.getElementById('root');
        
        if (!content) {
            root.innerHTML = '<div style="padding: 20px;">No content to display.</div>';
            return;
        }

        let json = null;
        let isInvalid = false;

        try {
            json = JSON.parse(content);
        } catch (e) {
            isInvalid = true;
        }

        new Viewer(root, json, content, { isInvalid });
        
        // Update title if possible
        if (!isInvalid && json) {
            document.title = 'JSON Viewer';
        } else {
            document.title = 'JSON Viewer (Raw)';
        }
    });
});