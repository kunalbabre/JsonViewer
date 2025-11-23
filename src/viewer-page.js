import { Viewer } from './ui/Viewer.js';

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['viewerContent'], (result) => {
        const content = result.viewerContent;
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