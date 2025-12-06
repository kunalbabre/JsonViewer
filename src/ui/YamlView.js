import { Toast } from './Toast.js';
import { jsonToYaml } from '../utils/yaml.js';
import { EditorView } from './EditorView.js';

export class YamlView {
    constructor(data, searchQuery = '') {
        this.data = data;
        this.searchQuery = searchQuery;
        this.yamlString = null;
        this.editorView = null;
        this.element = document.createElement('div');
        this.element.className = 'jv-schema-container';
        this.render();
    }

    render() {
        // Show loading state
        this.element.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 1rem; color: var(--text-color);">
                <div class="jv-spinner"></div>
                <div>Converting to YAML...</div>
            </div>
        `;
        
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
