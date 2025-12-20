/**
 * Parse Worker - handles JSON parsing for large files
 * Runs in a separate thread to avoid blocking the UI
 */

self.onmessage = function(e) {
    try {
        const parsed = JSON.parse(e.data);
        self.postMessage({ success: true, data: parsed });
    } catch (error) {
        self.postMessage({ success: false, error: error.message });
    }
};
