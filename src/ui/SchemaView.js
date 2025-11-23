import { Icons } from './Icons.js';
import { Toast } from './Toast.js';
import { TreeView } from './TreeView.js';

// Performance tuning constants
const SCHEMA_SAMPLE_SIZE = 100; // Number of array items to sample for schema generation
const MAX_SCHEMA_DEPTH = 20; // Maximum depth to prevent infinite recursion

export class SchemaView {
    constructor(data, searchQuery = '') {
        this.data = data;
        this.searchQuery = searchQuery;
        this.element = document.createElement('div');
        this.element.className = 'jv-schema-container';
        this.seenObjects = new WeakSet(); // Track circular references
        this.render();
    }

    render() {
        try {
            const schema = this.generateSchema(this.data);
            const schemaString = JSON.stringify(schema, null, 2);

            // Create Tree View first so we can reference it
            const tree = new TreeView(schema, this.searchQuery);

        // Toolbar for Schema View
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

        // Schema Content (Tree View)
        const treeContainer = document.createElement('div');
        treeContainer.className = 'jv-schema-tree';
        treeContainer.style.flex = '1';
        treeContainer.style.overflow = 'auto';

        treeContainer.appendChild(tree.element);

        this.element.appendChild(treeContainer);
        } catch (e) {
            console.error('Failed to generate schema:', e);
            this.element.innerHTML = '';
            const errorMsg = document.createElement('div');
            errorMsg.style.padding = '1rem';
            errorMsg.style.color = 'var(--null-color)';
            errorMsg.textContent = 'Failed to generate schema: ' + e.message;
            this.element.appendChild(errorMsg);
        }
    }

    generateSchema(data, depth = 0) {
        // Prevent infinite recursion
        if (depth > MAX_SCHEMA_DEPTH) {
            return { type: 'unknown', note: 'Max depth exceeded' };
        }

        // Detect circular references
        if (typeof data === 'object' && data !== null) {
            if (this.seenObjects.has(data)) {
                return { type: 'circular', note: 'Circular reference detected' };
            }
            this.seenObjects.add(data);
        }

        const type = this.getType(data);

        if (type === 'object') {
            const schema = { type: 'object', properties: {} };
            Object.keys(data).forEach(key => {
                schema.properties[key] = this.generateSchema(data[key], depth + 1);
            });
            return schema;
        }

        if (type === 'array') {
            const schema = { type: 'array' };
            if (data.length > 0) {
                // For large arrays, only sample first items to generate schema
                const sampleSize = Math.min(SCHEMA_SAMPLE_SIZE, data.length);
                const itemSchemas = [];
                for (let i = 0; i < sampleSize; i++) {
                    itemSchemas.push(this.generateSchema(data[i], depth + 1));
                }
                // Safe reduce with initial value
                if (itemSchemas.length > 0) {
                    schema.items = itemSchemas.reduce((acc, curr) => this.mergeSchemas(acc, curr), {});
                } else {
                    schema.items = {};
                }
                
                // Add note if array was sampled
                if (data.length > sampleSize) {
                    schema.note = `Schema generated from ${sampleSize} of ${data.length} items`;
                }
            } else {
                schema.items = {};
            }
            return schema;
        }

        return { type };
    }

    mergeSchemas(a, b) {
        // Handle undefined/empty schemas
        if (!a) return b;
        if (!b) return a;

        // If types don't match, create a union type
        // We need to compare the 'type' field, which could be a string or array
        const typesA = Array.isArray(a.type) ? a.type : [a.type];
        const typesB = Array.isArray(b.type) ? b.type : [b.type];

        // Check if sets of types are different
        const uniqueTypes = [...new Set([...typesA, ...typesB])];

        // If we have multiple types, we can't easily merge properties/items unless we do complex conditional logic
        // For this generator, if types differ (e.g. object vs string), we just return the union type and stop merging details
        // Exception: if both have 'object' in them, we *could* try to merge properties, but it gets messy.
        // Simple approach: If types are strictly equal (and single), merge details. Else, union types.

        const typesEqual = typesA.length === typesB.length && typesA.every(t => typesB.includes(t));

        if (!typesEqual) {
            return { type: uniqueTypes.length === 1 ? uniqueTypes[0] : uniqueTypes };
        }

        // Types are the same, merge details
        const type = typesA[0]; // We assume single type for deep merging for now

        if (type === 'object') {
            const merged = { type: 'object', properties: { ...a.properties } };
            // Merge properties from B
            if (b.properties) {
                Object.keys(b.properties).forEach(key => {
                    if (merged.properties[key]) {
                        merged.properties[key] = this.mergeSchemas(merged.properties[key], b.properties[key]);
                    } else {
                        merged.properties[key] = b.properties[key];
                    }
                });
            }
            return merged;
        }

        if (type === 'array') {
            return { type: 'array', items: this.mergeSchemas(a.items, b.items) };
        }

        return a;
    }

    getType(value) {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        return typeof value;
    }
}
