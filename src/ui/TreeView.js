import { Icons } from './Icons.js';
import { Toast } from './Toast.js';

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
        this.render(this.data, this.element, '');
    }

    render(data, container, path) {
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

            keys.forEach((key, index) => {
                const value = data[key];
                const currentPath = path ? (isArray ? `${path}[${key}]` : `${path}.${key}`) : key;
                const node = document.createElement('div');
                node.className = 'jv-node';

                const header = document.createElement('div');
                header.className = 'jv-node-header';

                // Toggler for objects/arrays
                if (typeof value === 'object' && value !== null && Object.keys(value).length > 0) {
                    const toggler = document.createElement('span');
                    toggler.className = 'jv-toggler expanded';
                    toggler.textContent = '▶';
                    toggler.onclick = (e) => {
                        e.stopPropagation();
                        this.toggleNode(node, toggler);
                    };
                    header.appendChild(toggler);
                    header.onclick = (e) => {
                        if (!e.target.closest('.jv-actions')) {
                            this.toggleNode(node, toggler);
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
                    const count = Object.keys(value).length;
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

                // Children Container
                if (typeof value === 'object' && value !== null && Object.keys(value).length > 0) {
                    const children = document.createElement('div');
                    children.className = 'jv-children';
                    this.render(value, children, currentPath);
                    node.appendChild(children);
                }

                container.appendChild(node);
            });
        } else {
            container.appendChild(this.createValueSpan(data));
        }
    }

    toggleNode(node, toggler) {
        toggler.classList.toggle('expanded');
        const childrenContainer = node.querySelector('.jv-children');
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
