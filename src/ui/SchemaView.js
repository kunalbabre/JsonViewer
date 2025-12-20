import { Icons } from './Icons.js';
import { Toast } from './Toast.js';
import { EditorView } from './EditorView.js';

const SCHEMA_SAMPLE_SIZE = 1000;
const MAX_SCHEMA_DEPTH = 50;

// Protect against prototype pollution
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isSafeKey = (key) => !UNSAFE_KEYS.has(key);

export class SchemaView {
    constructor(data, searchQuery = '') {
        this.data = data;
        this.searchQuery = searchQuery;
        this.element = document.createElement('div');
        this.element.className = 'jv-schema-container';
        this.editorView = null;
        this.worker = null;
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

        this.generateSchema();
    }

    generateSchema() {
        // Try worker first, fall back to main thread
        try {
            this.initWorker();
            if (this.worker) {
                this.worker.postMessage({ data: this.data });
            } else {
                // Worker creation failed, process on main thread
                this.generateSchemaOnMainThread();
            }
        } catch (err) {
            console.warn('Worker failed, using main thread:', err);
            this.generateSchemaOnMainThread();
        }
    }

    initWorker() {
        try {
            // Use external worker file to comply with CSP (blob URLs are blocked)
            // Check if chrome.runtime is available (may not be in all contexts)
            if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) {
                this.worker = null;
                return;
            }
            const workerUrl = chrome.runtime.getURL('src/workers/schema-worker.js');
            this.worker = new Worker(workerUrl);

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

            this.worker.onerror = (err) => {
                // Worker failed (likely CSP restriction), fall back to main thread
                console.warn('SchemaView: Worker failed, falling back to main thread:', err);
                this.worker = null;
                this.generateSchemaOnMainThread();
            };
        } catch (e) {
            // Worker creation failed (likely CSP restriction), will fall back to main thread
            console.warn('SchemaView: Worker creation failed:', e);
            this.worker = null;
        }
    }

    /**
     * Generate schema on main thread (fallback when worker unavailable)
     */
    generateSchemaOnMainThread() {
        try {
            const innerSchema = this.buildSchema(this.data, 0);
            const schema = {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "title": "Generated schema for Root",
                ...innerSchema
            };
            this.renderSchema(schema);
        } catch (err) {
            this.renderError(err.message);
        }
    }

    /**
     * Build JSON schema from data
     * @param {any} data - Data to analyze
     * @param {number} depth - Current recursion depth
     * @returns {Object} JSON Schema object
     */
    buildSchema(data, depth) {
        if (depth > MAX_SCHEMA_DEPTH) {
            return { type: 'object' };
        }

        const type = this.getType(data);

        if (type === 'object') {
            // Filter out unsafe keys to prevent prototype pollution
            const keys = Object.keys(data).filter(isSafeKey);
            const schema = {
                type: 'object',
                properties: {},
                required: keys.length > 0 ? keys : undefined
            };
            keys.forEach(key => {
                schema.properties[key] = this.buildSchema(data[key], depth + 1);
            });
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
                    itemSchemas.push(this.buildSchema(data[i], depth + 1));
                }

                if (itemSchemas.length > 0) {
                    schema.items = itemSchemas.reduce((acc, curr) => this.mergeSchemas(acc, curr));
                }
            }
            return schema;
        }

        return { type };
    }

    /**
     * Merge two schemas together
     * @param {Object} a - First schema
     * @param {Object} b - Second schema
     * @returns {Object} Merged schema
     */
    mergeSchemas(a, b) {
        if (!a) return b;
        if (!b) return a;

        const typesA = Array.isArray(a.type) ? a.type : [a.type];
        const typesB = Array.isArray(b.type) ? b.type : [b.type];

        const uniqueTypes = [...new Set([...typesA, ...typesB])];

        const result = { type: uniqueTypes.length === 1 ? uniqueTypes[0] : uniqueTypes };

        if (uniqueTypes.includes('object')) {
            const propsA = a.properties || {};
            const propsB = b.properties || {};
            const allKeys = [...new Set([...Object.keys(propsA), ...Object.keys(propsB)])];

            if (allKeys.length > 0) {
                result.properties = {};
                allKeys.forEach(key => {
                    if (propsA[key] && propsB[key]) {
                        result.properties[key] = this.mergeSchemas(propsA[key], propsB[key]);
                    } else {
                        result.properties[key] = propsA[key] || propsB[key];
                    }
                });
            }

            const reqA = a.required || [];
            const reqB = b.required || [];
            const commonRequired = reqA.filter(k => reqB.includes(k));
            if (commonRequired.length > 0) {
                result.required = commonRequired;
            }
        }

        if (uniqueTypes.includes('array')) {
            if (a.items || b.items) {
                result.items = this.mergeSchemas(a.items, b.items);
            }
        }

        return result;
    }

    /**
     * Get the JSON Schema type for a value
     * @param {any} value - Value to check
     * @returns {string} JSON Schema type
     */
    getType(value) {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
        return typeof value;
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
