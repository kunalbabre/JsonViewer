import { Icons } from './Icons.js';
import { Toast } from './Toast.js';
import { TreeView } from './TreeView.js';

export class SchemaView {
    constructor(data, searchQuery = '') {
        this.data = data;
        this.searchQuery = searchQuery;
        this.element = document.createElement('div');
        this.element.className = 'jv-schema-container';
        this.render();
    }

    render() {
        // Show loading state
        this.element.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 1rem; color: var(--text-color);">
                <div class="jv-spinner"></div>
                <div>Generating Schema...</div>
            </div>
        `;

        this.initWorker();
        this.worker.postMessage({ data: this.data });
    }

    initWorker() {
        const workerCode = `
            const SCHEMA_SAMPLE_SIZE = 1000; // Increased sample size for better accuracy
            const MAX_SCHEMA_DEPTH = 50; // Increased depth

            self.onmessage = function(e) {
                const { data } = e.data;
                try {
                    const schema = generateSchema(data);
                    self.postMessage({ schema });
                } catch (err) {
                    self.postMessage({ error: err.message });
                }
            };

            // WeakSet is not available for structured clone transfer or across worker boundary for the same object references easily
            // But we are processing a copy of data. We can use a Set of objects if we want to track circular refs within the worker's copy.
            // However, JSON.stringify/parse usually breaks circular refs or throws. 
            // Assuming input data is valid JSON (no circular refs), we don't need WeakSet for that.
            // But if we are traversing, we might need it to prevent infinite loops if the structure is recursive (though JSON isn't).
            
            function generateSchema(data, depth = 0) {
                if (depth > MAX_SCHEMA_DEPTH) {
                    return { type: 'unknown', note: 'Max depth exceeded' };
                }

                const type = getType(data);

                if (type === 'object') {
                    const schema = { type: 'object', properties: {} };
                    Object.keys(data).forEach(key => {
                        schema.properties[key] = generateSchema(data[key], depth + 1);
                    });
                    return schema;
                }

                if (type === 'array') {
                    const schema = { type: 'array' };
                    if (data.length > 0) {
                        const sampleSize = Math.min(SCHEMA_SAMPLE_SIZE, data.length);
                        const itemSchemas = [];
                        for (let i = 0; i < sampleSize; i++) {
                            itemSchemas.push(generateSchema(data[i], depth + 1));
                        }
                        
                        if (itemSchemas.length > 0) {
                            schema.items = itemSchemas.reduce((acc, curr) => mergeSchemas(acc, curr), {});
                        } else {
                            schema.items = {};
                        }
                        
                        if (data.length > sampleSize) {
                            schema.note = \`Schema generated from \${sampleSize} of \${data.length} items\`;
                        }
                    } else {
                        schema.items = {};
                    }
                    return schema;
                }

                return { type };
            }

            function mergeSchemas(a, b) {
                if (!a) return b;
                if (!b) return a;

                const typesA = Array.isArray(a.type) ? a.type : [a.type];
                const typesB = Array.isArray(b.type) ? b.type : [b.type];
                const uniqueTypes = [...new Set([...typesA, ...typesB])];
                const typesEqual = typesA.length === typesB.length && typesA.every(t => typesB.includes(t));

                if (!typesEqual) {
                    return { type: uniqueTypes.length === 1 ? uniqueTypes[0] : uniqueTypes };
                }

                const type = typesA[0];

                if (type === 'object') {
                    const merged = { type: 'object', properties: { ...a.properties } };
                    if (b.properties) {
                        Object.keys(b.properties).forEach(key => {
                            if (merged.properties[key]) {
                                merged.properties[key] = mergeSchemas(merged.properties[key], b.properties[key]);
                            } else {
                                merged.properties[key] = b.properties[key];
                            }
                        });
                    }
                    return merged;
                }

                if (type === 'array') {
                    return { type: 'array', items: mergeSchemas(a.items, b.items) };
                }

                return a;
            }

            function getType(value) {
                if (value === null) return 'null';
                if (Array.isArray(value)) return 'array';
                return typeof value;
            }
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
        
        this.worker.onmessage = (e) => {
            const { schema, error } = e.data;
            if (error) {
                this.renderError(error);
            } else {
                this.renderSchema(schema);
            }
            this.worker.terminate();
            this.worker = null;
        };
    }

    renderSchema(schema) {
        this.element.innerHTML = '';
        const schemaString = JSON.stringify(schema, null, 2);
        const tree = new TreeView(schema, this.searchQuery);

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

        const sep = document.createElement('div');
        sep.className = 'jv-separator';
        toolbar.appendChild(sep);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'jv-btn';
        copyBtn.innerHTML = `${Icons.copy} <span>Copy Schema</span>`;
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(schemaString).then(() => {
                Toast.show('Schema copied to clipboard');
            }).catch((e) => {
                Toast.show('Failed to copy: ' + e.message);
            });
        };
        toolbar.appendChild(copyBtn);

        this.element.appendChild(toolbar);

        const treeContainer = document.createElement('div');
        treeContainer.className = 'jv-schema-tree';
        treeContainer.style.flex = '1';
        treeContainer.style.overflow = 'auto';
        treeContainer.appendChild(tree.element);

        this.element.appendChild(treeContainer);
    }

    renderError(message) {
        this.element.innerHTML = '';
        const errorMsg = document.createElement('div');
        errorMsg.style.padding = '1rem';
        errorMsg.style.color = 'var(--null-color)';
        errorMsg.textContent = 'Failed to generate schema: ' + message;
        this.element.appendChild(errorMsg);
    }
}
