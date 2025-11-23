import { Icons } from './Icons.js';
import { Toast } from './Toast.js';
import { jsonToYaml } from '../utils/yaml.js';
import { TreeView } from './TreeView.js';

export class YamlView {
    constructor(data, searchQuery = '') {
        this.data = data;
        this.searchQuery = searchQuery;
        this.element = document.createElement('div');
        this.element.className = 'jv-schema-container'; // Reuse schema container styles
        this.render();
    }

    render() {
        try {
            const yamlString = jsonToYaml(this.data);

            // Create Tree View first so we can reference it
            const tree = new TreeView(this.data, this.searchQuery, 'yaml');

        // Toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'jv-schema-toolbar';

        const expandBtn = document.createElement('button');
        expandBtn.className = 'jv-btn';
        expandBtn.innerHTML = `${Icons.expand} <span>Expand All</span>`;
        expandBtn.onclick = () => tree.expandAll();
        toolbar.appendChild(expandBtn);

        const collapseBtn = document.createElement('button');
        collapseBtn.className = 'jv-btn';
        collapseBtn.innerHTML = `${Icons.collapse} <span>Collapse All</span>`;
        collapseBtn.onclick = () => tree.collapseAll();
        toolbar.appendChild(collapseBtn);

        // Separator
        const sep = document.createElement('div');
        sep.className = 'jv-separator';
        toolbar.appendChild(sep);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'jv-btn';
        copyBtn.innerHTML = `${Icons.copy} <span>Copy YAML</span>`;
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(yamlString).then(() => {
                Toast.show('YAML copied to clipboard');
            }).catch((e) => {
                Toast.show('Failed to copy: ' + e.message);
            });
        };
        toolbar.appendChild(copyBtn);

        this.element.appendChild(toolbar);

        // Content (Tree View in YAML mode)
        const treeContainer = document.createElement('div');
        treeContainer.className = 'jv-schema-tree';
        treeContainer.style.flex = '1';
        treeContainer.style.overflow = 'auto';

        treeContainer.appendChild(tree.element);

        this.element.appendChild(treeContainer);
        } catch (e) {
            console.error('Failed to convert to YAML:', e);
            this.element.innerHTML = '';
            const errorMsg = document.createElement('div');
            errorMsg.style.padding = '1rem';
            errorMsg.style.color = 'var(--null-color)';
            errorMsg.textContent = 'Failed to convert to YAML: ' + e.message;
            this.element.appendChild(errorMsg);
        }
    }
}
