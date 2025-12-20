import { Toast } from './Toast.js';
import { jsonToYaml } from '../utils/yaml.js';
import { EditorView } from './EditorView.js';

// Maximum data size for YAML conversion (5MB of JSON typically produces ~7MB of YAML)
const MAX_YAML_SIZE = 5000000;

export class YamlView {
    /**
     * @param {any} data - JSON data to convert to YAML
     * @param {string} searchQuery - Optional search query
     * @param {string|null} preConvertedYaml - Pre-converted YAML string (for instant rendering)
     * @param {number} [dataSize=0] - Size of original data in bytes (for size checks)
     */
    constructor(data, searchQuery = '', preConvertedYaml = null, dataSize = 0) {
        this.data = data;
        this.searchQuery = searchQuery;
        this.yamlString = preConvertedYaml;
        this.dataSize = dataSize;
        this.editorView = null;
        this.element = document.createElement('div');
        this.element.className = 'jv-schema-container';
        this.render();
    }

    render() {
        // If we have pre-converted YAML, render immediately
        if (this.yamlString) {
            this.renderYaml();
            return;
        }

        // Check if data is too large for YAML conversion
        // Estimate size by checking if dataSize was provided or stringify a sample
        let estimatedSize = this.dataSize;
        if (!estimatedSize && this.data) {
            try {
                // Quick size estimate - stringify is expensive but we need to know
                const sample = JSON.stringify(this.data);
                estimatedSize = sample.length;
            } catch (e) {
                estimatedSize = MAX_YAML_SIZE + 1; // Assume too large if can't stringify
            }
        }

        if (estimatedSize > MAX_YAML_SIZE) {
            this.renderTooLarge(estimatedSize);
            return;
        }

        // Show loading state using DOM manipulation
        this.element.innerHTML = '';
        const loadingContainer = document.createElement('div');
        loadingContainer.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 1rem; color: var(--text-color);';

        const spinner = document.createElement('div');
        spinner.className = 'jv-spinner';
        loadingContainer.appendChild(spinner);

        const loadingText = document.createElement('div');
        loadingText.textContent = 'Converting to YAML...';
        loadingContainer.appendChild(loadingText);

        this.element.appendChild(loadingContainer);

        // Convert in next tick to allow UI to update
        setTimeout(() => {
            try {
                this.yamlString = jsonToYaml(this.data);
                this.renderYaml();
            } catch (e) {
                console.error('Failed to convert to YAML:', e);
                this.renderError(e.message);
            }
        }, 10);
    }

    renderYaml() {
        this.element.innerHTML = '';

        // Use EditorView with yaml mode
        this.editorView = new EditorView(this.yamlString, null, {
            mode: 'yaml',
            isRaw: false
        });
        this.element.appendChild(this.editorView.element);
    }

    renderTooLarge(size) {
        const sizeMB = (size / 1024 / 1024).toFixed(1);
        this.element.innerHTML = '';

        const container = document.createElement('div');
        container.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 1rem; color: var(--text-color); text-align: center; padding: 2rem;';

        // Warning icon (static SVG is safe)
        const iconContainer = document.createElement('div');
        iconContainer.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.5;"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>';
        container.appendChild(iconContainer);

        const title = document.createElement('div');
        title.style.cssText = 'font-size: 1.1rem; font-weight: 500;';
        title.textContent = 'File too large for YAML conversion';
        container.appendChild(title);

        const message = document.createElement('div');
        message.style.cssText = 'opacity: 0.7; max-width: 400px;';

        // Build message with DOM manipulation instead of innerHTML for security
        const line1 = document.createElement('span');
        line1.textContent = 'This file is ';
        message.appendChild(line1);

        const sizeSpan = document.createElement('strong');
        sizeSpan.textContent = sizeMB;
        message.appendChild(sizeSpan);

        const line2 = document.createElement('span');
        line2.textContent = ' MB. YAML conversion is limited to files under 5 MB to prevent browser freezing.';
        message.appendChild(line2);

        message.appendChild(document.createElement('br'));
        message.appendChild(document.createElement('br'));

        const line3 = document.createElement('span');
        line3.textContent = 'Use the ';
        message.appendChild(line3);

        const editorStrong = document.createElement('strong');
        editorStrong.textContent = 'Editor';
        message.appendChild(editorStrong);

        const line4 = document.createElement('span');
        line4.textContent = ' or ';
        message.appendChild(line4);

        const rawStrong = document.createElement('strong');
        rawStrong.textContent = 'Raw';
        message.appendChild(rawStrong);

        const line5 = document.createElement('span');
        line5.textContent = ' tab to view this file.';
        message.appendChild(line5);

        container.appendChild(message);

        this.element.appendChild(container);
    }

    renderError(message) {
        this.element.innerHTML = '';
        const errorMsg = document.createElement('div');
        errorMsg.style.padding = '1rem';
        errorMsg.style.color = 'var(--null-color)';
        errorMsg.textContent = 'Failed to convert to YAML: ' + message;
        this.element.appendChild(errorMsg);
    }

    getYamlString() {
        return this.yamlString || '';
    }
}
