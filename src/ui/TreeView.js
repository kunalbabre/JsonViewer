import { Icons } from './Icons.js';
import { Toast } from './Toast.js';

// Performance tuning constants
const BATCH_SIZE = 100; // Number of nodes to render per animation frame
const LARGE_OBJECT_THRESHOLD = 50; // Objects with more items auto-collapse
const DEEP_NESTING_THRESHOLD = 1; // Nodes deeper than this auto-collapse

export class TreeView {
    constructor(data, searchQuery = '', mode = 'json') {
        this.data = data;
        this.searchQuery = searchQuery.toLowerCase();
        this.mode = mode; // 'json' or 'yaml'
        this.element = document.createElement('div');
        this.element.className = 'jv-tree';
        if (this.mode === 'yaml') {
            this.element.classList.add('jv-yaml-mode');
        }
        this.renderBatch(this.data, this.element, '', 0);
    }

    // Batch rendering to prevent blocking the main thread
    renderBatch(data, container, path, depth = 0) {
        if (typeof data === 'object' && data !== null) {
            const isArray = Array.isArray(data);
            const keys = Object.keys(data);

            if (keys.length === 0) {
                const empty = document.createElement('span');
                empty.className = 'jv-val-null';
                empty.textContent = isArray ? '[]' : '{}';
                container.appendChild(empty);
                return;
            }

            // For large datasets, render in chunks to avoid blocking
            let index = 0;

            const renderChunk = () => {
                const end = Math.min(index + BATCH_SIZE, keys.length);
                
                for (; index < end; index++) {
                    const key = keys[index];
                    const value = data[key];
                    const currentPath = path ? (isArray ? `${path}[${key}]` : `${path}.${key}`) : key;
                    const node = this.createNode(key, value, currentPath, isArray, depth);
                    container.appendChild(node);
                }

                if (index < keys.length) {
                    // Use requestAnimationFrame for smooth rendering
                    requestAnimationFrame(renderChunk);
                }
            };

            renderChunk();
        } else {
            container.appendChild(this.createValueSpan(data));
        }
    }

    createNode(key, value, currentPath, isArray, depth) {
        const node = document.createElement('div');
        node.className = 'jv-node';

        const header = document.createElement('div');
        header.className = 'jv-node-header';

        const isExpandable = typeof value === 'object' && value !== null && Object.keys(value).length > 0;

        // Toggler for objects/arrays
        if (isExpandable) {
            const toggler = document.createElement('span');
            const valueKeys = Object.keys(value);
            // Start collapsed for deep nesting or large arrays/objects
            const shouldCollapse = depth > DEEP_NESTING_THRESHOLD || valueKeys.length > LARGE_OBJECT_THRESHOLD;
            toggler.className = shouldCollapse ? 'jv-toggler' : 'jv-toggler expanded';
            toggler.textContent = '▶';
            toggler.onclick = (e) => {
                e.stopPropagation();
                this.toggleNodeLazy(node, toggler, value, currentPath, depth);
            };
            header.appendChild(toggler);
            header.onclick = (e) => {
                if (!e.target.closest('.jv-actions')) {
                    this.toggleNodeLazy(node, toggler, value, currentPath, depth);
                }
            };
        } else {
            const spacer = document.createElement('span');
            spacer.className = 'jv-toggler'; // Invisible spacer
            header.appendChild(spacer);
        }

        // Key / Array Item Indicator
        const keySpan = document.createElement('span');
        keySpan.className = 'jv-key';

        if (this.mode === 'yaml') {
            if (isArray) {
                keySpan.textContent = '- ';
                keySpan.style.color = 'var(--text-color)';
            } else {
                keySpan.textContent = `${key}: `;
            }
        } else {
            // JSON Mode
            keySpan.textContent = `${key}:`;
        }

        // Highlight search match in key
        if (this.searchQuery && key.toLowerCase().includes(this.searchQuery)) {
            keySpan.style.backgroundColor = '#fef08a';
            keySpan.style.color = '#000';
        }

        header.appendChild(keySpan);

        // Value Preview or Type Indicator
        if (typeof value !== 'object' || value === null) {
            const valSpan = this.createValueSpan(value);
            header.appendChild(valSpan);
        } else {
            // For YAML, we don't usually show "Object" or "Array" text, just the structure
            // But keeping item count is useful
            if (this.mode === 'json') {
                const typeSpan = document.createElement('span');
                typeSpan.className = 'jv-val-null';
                typeSpan.textContent = Array.isArray(value) ? `Array` : 'Object';
                header.appendChild(typeSpan);
            }

            const countSpan = document.createElement('span');
            countSpan.className = 'jv-item-count';
            const count = valueKeys.length;
            countSpan.textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
            header.appendChild(countSpan);
        }

        // Hover Actions
        const actions = document.createElement('div');
        actions.className = 'jv-actions';

        const copyValBtn = this.createActionButton(Icons.copy, 'Copy Value', () => {
            const valToCopy = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
            this.copyText(valToCopy);
        });
        actions.appendChild(copyValBtn);

        const copyPathBtn = this.createActionButton(Icons.link, 'Copy Path', () => {
            this.copyText(currentPath);
        });
        actions.appendChild(copyPathBtn);

        header.appendChild(actions);
        node.appendChild(header);

        // Children Container - create placeholder if expandable
        if (isExpandable) {
            const children = document.createElement('div');
            children.className = 'jv-children';
            const toggler = node.querySelector('.jv-toggler');
            const isInitiallyExpanded = toggler && toggler.classList.contains('expanded');
            
            if (isInitiallyExpanded) {
                // Render children for initially expanded nodes
                this.renderBatch(value, children, currentPath, depth + 1);
            } else {
                // Hide children for collapsed nodes
                children.classList.add('hidden');
            }
            node.appendChild(children);
        }

        return node;
    }

    // Lazy toggle - only render children when expanding
    toggleNodeLazy(node, toggler, value, currentPath, depth) {
        toggler.classList.toggle('expanded');
        const childrenContainer = node.querySelector('.jv-children');
        
        if (childrenContainer) {
            const isExpanding = toggler.classList.contains('expanded');
            
            if (isExpanding && childrenContainer.children.length === 0) {
                // Lazy load: render children only when first expanded
                this.renderBatch(value, childrenContainer, currentPath, depth + 1);
            }
            
            childrenContainer.classList.toggle('hidden');
        }
    }

    render(data, container, path) {
        // Legacy method kept for compatibility, delegates to renderBatch
        this.renderBatch(data, container, path, 0);
    }

    // Legacy method kept for backward compatibility - delegates to lazy version
    toggleNode(node, toggler) {
        // Find the value and path to enable lazy loading
        const childrenContainer = node.querySelector('.jv-children');
        if (childrenContainer && childrenContainer.children.length === 0) {
            // If children not loaded yet, this is called from old code
            // We can't lazy load without the value, so just toggle visibility
            console.warn('toggleNode called without lazy loading context - use toggleNodeLazy instead');
        }
        toggler.classList.toggle('expanded');
        if (childrenContainer) {
            childrenContainer.classList.toggle('hidden');
        }
    }

    createValueSpan(value) {
        const span = document.createElement('span');

        if (value === null) {
            span.className = 'jv-val-null';
            span.textContent = 'null';
        } else if (typeof value === 'boolean') {
            span.className = 'jv-val-boolean';
            span.textContent = value.toString();
        } else if (typeof value === 'number') {
            span.className = 'jv-val-number';
            span.textContent = value.toString();
        } else {
            // String handling (Links, Colors, Images)
            span.className = 'jv-val-string';
            const strVal = String(value);

            if (strVal.match(/^https?:\/\//)) {
                // Link
                const link = document.createElement('a');
                link.href = strVal;
                link.target = '_blank';
                link.className = 'jv-val-link';
                // YAML strings don't need quotes usually, unless special chars
                link.textContent = this.mode === 'yaml' ? strVal : `"${strVal}"`;

                // Image Preview on hover (simple implementation)
                if (strVal.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
                    link.title = 'Click to open image';
                }

                return link;
            } else if (strVal.match(/^#[0-9a-f]{3,6}$/i) || strVal.match(/^rgb/)) {
                // Color
                const colorPreview = document.createElement('span');
                colorPreview.className = 'jv-color-preview';
                colorPreview.style.backgroundColor = strVal;

                const wrapper = document.createElement('span');
                wrapper.appendChild(colorPreview);
                wrapper.appendChild(document.createTextNode(this.mode === 'yaml' ? strVal : `"${strVal}"`));
                wrapper.className = 'jv-val-string';
                return wrapper;
            }

            span.textContent = this.mode === 'yaml' ? strVal : `"${strVal}"`;
        }

        // Highlight search match
        if (this.searchQuery && span.textContent.toLowerCase().includes(this.searchQuery)) {
            span.style.backgroundColor = '#fef08a';
            span.style.color = '#000';
        }

        return span;
    }

    createActionButton(iconHtml, title, onClick) {
        const btn = document.createElement('div');
        btn.className = 'jv-action-btn';
        btn.title = title;
        btn.innerHTML = iconHtml;
        // Scale down icon
        const svg = btn.querySelector('svg');
        if (svg) {
            svg.setAttribute('width', '12');
            svg.setAttribute('height', '12');
        }
        btn.onclick = (e) => {
            e.stopPropagation();
            onClick();
        };
        return btn;
    }

    copyText(text) {
        navigator.clipboard.writeText(text).then(() => {
            Toast.show('Copied!');
        });
    }

    expandAll() {
        const togglers = this.element.querySelectorAll('.jv-toggler:not(.expanded)');
        togglers.forEach(t => {
            t.classList.add('expanded');
            const node = t.closest('.jv-node');
            const children = node.querySelector('.jv-children');
            if (children) children.classList.remove('hidden');
        });
    }

    collapseAll() {
        const togglers = this.element.querySelectorAll('.jv-toggler.expanded');
        togglers.forEach(t => {
            t.classList.remove('expanded');
            const node = t.closest('.jv-node');
            const children = node.querySelector('.jv-children');
            if (children) children.classList.add('hidden');
        });
    }
}
