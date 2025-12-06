import { Icons } from './Icons.js';
import { Toast } from './Toast.js';
import { EditorView } from './EditorView.js';

export class SchemaView {
    constructor(data, searchQuery = '') {
        this.data = data;
        this.searchQuery = searchQuery;
        this.element = document.createElement('div');
        this.element.className = 'jv-schema-container';
        this.editorView = null;
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
            const SCHEMA_SAMPLE_SIZE = 1000;
            const MAX_SCHEMA_DEPTH = 50;

            self.onmessage = function(e) {
                const { data } = e.data;
                try {
                    const innerSchema = generateSchema(data, 0);
                    // Wrap with JSON Schema draft-07 metadata
                    const schema = {
                        "$schema": "http://json-schema.org/draft-07/schema#",
                        "title": "Generated schema for Root",
                        ...innerSchema
                    };
                    self.postMessage({ schema });
                } catch (err) {
                    self.postMessage({ error: err.message });
                }
            };

            function generateSchema(data, depth) {
                if (depth > MAX_SCHEMA_DEPTH) {
                    return { type: 'object' };
                }

                const type = getType(data);

                if (type === 'object') {
                    const keys = Object.keys(data);
                    const schema = { 
                        type: 'object', 
                        properties: {},
                        required: keys.length > 0 ? keys : undefined
                    };
                    keys.forEach(key => {
                        schema.properties[key] = generateSchema(data[key], depth + 1);
                    });
                    // Remove required if empty
                    if (!schema.required || schema.required.length === 0) {
                        delete schema.required;
                    }
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
                            schema.items = itemSchemas.reduce((acc, curr) => mergeSchemas(acc, curr));
                        }
                    }
                    return schema;
                }

                // For primitives: string, number, boolean, null
                return { type };
            }

            function mergeSchemas(a, b) {
                if (!a) return b;
                if (!b) return a;

                const typesA = Array.isArray(a.type) ? a.type : [a.type];
                const typesB = Array.isArray(b.type) ? b.type : [b.type];
                
                const uniqueTypes = [...new Set([...typesA, ...typesB])];
                
                const result = { type: uniqueTypes.length === 1 ? uniqueTypes[0] : uniqueTypes };

                // If object type is present, merge properties and required
                if (uniqueTypes.includes('object')) {
                    const propsA = a.properties || {};
                    const propsB = b.properties || {};
                    const allKeys = [...new Set([...Object.keys(propsA), ...Object.keys(propsB)])];
                    
                    if (allKeys.length > 0) {
                        result.properties = {};
                        allKeys.forEach(key => {
                            if (propsA[key] && propsB[key]) {
                                result.properties[key] = mergeSchemas(propsA[key], propsB[key]);
                            } else {
                                result.properties[key] = propsA[key] || propsB[key];
                            }
                        });
                    }
                    
                    // Merge required - only include keys that are required in both
                    const reqA = a.required || [];
                    const reqB = b.required || [];
                    const commonRequired = reqA.filter(k => reqB.includes(k));
                    if (commonRequired.length > 0) {
                        result.required = commonRequired;
                    }
                }

                // If array type is present, merge items
                if (uniqueTypes.includes('array')) {
                    if (a.items || b.items) {
                        result.items = mergeSchemas(a.items, b.items);
                    }
                }

                return result;
            }

            function getType(value) {
                if (value === null) return 'null';
                if (Array.isArray(value)) return 'array';
                if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
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
        
        // Store schema for copying
        this.schema = schema;
        
        // Use EditorView to display the schema (read-only style)
        this.editorView = new EditorView(schema, null, { isRaw: false });
        this.element.appendChild(this.editorView.element);
    }
    
    getSchemaString() {
        return this.schema ? JSON.stringify(this.schema, null, 2) : '';
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
