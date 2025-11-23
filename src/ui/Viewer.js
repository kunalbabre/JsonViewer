import { Icons } from './Icons.js';
import { Toolbar } from './Toolbar.js';
import { TreeView } from './TreeView.js';
import { SchemaView } from './SchemaView.js';
import { YamlView } from './YamlView.js';
import { Toast } from './Toast.js';

export class Viewer {
    constructor(root, data, rawData) {
        this.root = root;
        this.data = data;
        this.rawData = rawData;
        this.currentView = 'tree'; // tree, grid, raw, schema, yaml
        this.searchQuery = '';
        this.searchMatches = [];
        this.currentMatchIndex = -1;
        this.searchDebounceTimer = null;

        // Detect system theme preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.theme = prefersDark ? 'dark' : 'light';
        console.log('JSON Viewer: Detected theme preference:', this.theme, 'prefersDark:', prefersDark);

        // Apply theme immediately
        if (prefersDark) {
            document.body.classList.add('dark-theme');
            this.root.classList.add('dark');
            console.log('JSON Viewer: Applied dark theme classes');
        }

        this.render();
        this.setupKeyboardShortcuts();
    }

    render() {
        this.root.innerHTML = '';

        // Toolbar
        this.toolbar = new Toolbar({
            onSearch: (query) => this.handleSearch(query),
            onSearchNext: (backwards) => this.handleSearchNext(backwards),
            onViewChange: (view) => this.switchView(view),
            onThemeToggle: () => this.toggleTheme(),
            onCopy: () => this.copyToClipboard(),
            onExpandAll: () => this.handleExpandAll(),
            onCollapseAll: () => this.handleCollapseAll(),
            onSave: () => this.handleSave(),
            currentView: this.currentView
        });
        this.root.appendChild(this.toolbar.element);

        // Content Container
        this.contentContainer = document.createElement('div');
        this.contentContainer.className = 'jv-content';
        this.root.appendChild(this.contentContainer);

        this.renderContent();
    }

    renderContent() {
        this.contentContainer.innerHTML = '';

        // Helper to create the standard toolbar for JSON views
        const createJsonToolbar = (includeTreeActions = false) => {
            const toolbar = document.createElement('div');
            toolbar.className = 'jv-schema-toolbar'; // Reuse existing style

            if (includeTreeActions) {
                const expandBtn = document.createElement('button');
                expandBtn.className = 'jv-btn';
                expandBtn.innerHTML = `${Icons.expand} <span>Expand All</span>`;
                expandBtn.onclick = () => this.handleExpandAll();
                toolbar.appendChild(expandBtn);

                const collapseBtn = document.createElement('button');
                collapseBtn.className = 'jv-btn';
                collapseBtn.innerHTML = `${Icons.collapse} <span>Collapse All</span>`;
                collapseBtn.onclick = () => this.handleCollapseAll();
                toolbar.appendChild(collapseBtn);

                // Separator
                const sep = document.createElement('div');
                sep.className = 'jv-separator';
                toolbar.appendChild(sep);
            }

            const copyBtn = document.createElement('button');
            copyBtn.className = 'jv-btn';
            copyBtn.innerHTML = `${Icons.copy} <span>Copy JSON</span>`;
            copyBtn.onclick = () => this.copyToClipboard();
            toolbar.appendChild(copyBtn);

            const saveBtn = document.createElement('button');
            saveBtn.className = 'jv-btn';
            saveBtn.innerHTML = `${Icons.save} <span>Save JSON</span>`;
            saveBtn.onclick = () => this.handleSave();
            toolbar.appendChild(saveBtn);

            return toolbar;
        };

        if (this.currentView === 'tree') {
            const container = document.createElement('div');
            container.className = 'jv-schema-container';
            container.appendChild(createJsonToolbar(true)); // Include tree actions

            const treeContainer = document.createElement('div');
            treeContainer.className = 'jv-schema-tree'; // Reuse for scrolling
            treeContainer.style.flex = '1';

            this.treeView = new TreeView(this.data, this.searchQuery);
            treeContainer.appendChild(this.treeView.element);

            container.appendChild(treeContainer);
            this.contentContainer.appendChild(container);

            // Auto expand if searching
            if (this.searchQuery.length > 2) {
                this.treeView.expandAll();
            }

        } else if (this.currentView === 'raw') {
            const container = document.createElement('div');
            container.className = 'jv-schema-container';
            container.appendChild(createJsonToolbar());

            const textarea = document.createElement('textarea');
            textarea.className = 'jv-raw';
            textarea.value = this.rawData;
            textarea.readOnly = true;
            textarea.style.flex = '1'; // Ensure it takes remaining space

            container.appendChild(textarea);
            this.contentContainer.appendChild(container);

        } else if (this.currentView === 'schema') {
            const schema = new SchemaView(this.data, this.searchQuery);
            this.contentContainer.appendChild(schema.element);
        } else if (this.currentView === 'yaml') {
            const yaml = new YamlView(this.data, this.searchQuery);
            this.contentContainer.appendChild(yaml.element);
        }
    }

    switchView(view) {
        this.currentView = view;
        this.toolbar.updateActiveView(view);
        this.renderContent();
    }

    handleSearch(query) {
        // Debounce search to avoid excessive re-renders
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
        }

        this.searchDebounceTimer = setTimeout(() => {
            this.performSearch(query);
        }, 300);
    }

    performSearch(query) {
        this.searchQuery = query.toLowerCase();

        // Fast search - just update highlights without re-rendering
        if (!query) {
            // Clear all highlights
            document.querySelectorAll('.jv-highlight, .jv-highlight-current').forEach(el => {
                el.style.backgroundColor = '';
                el.style.color = '';
                el.classList.remove('jv-highlight', 'jv-highlight-current');
            });
            this.searchMatches = [];
            this.currentMatchIndex = -1;
            this.toolbar.updateMatchCounter(0, 0);
            return;
        }

        // Remove old highlights
        document.querySelectorAll('.jv-highlight, .jv-highlight-current').forEach(el => {
            el.style.backgroundColor = '';
            el.style.color = '';
            el.classList.remove('jv-highlight', 'jv-highlight-current');
        });

        // Find and highlight all matches
        this.searchMatches = [];
        const searchLower = query.toLowerCase();

        // Search in all text nodes
        const walker = document.createTreeWalker(
            this.contentContainer,
            NodeFilter.SHOW_TEXT,
            null
        );

        const nodesToHighlight = [];
        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent;
            if (text.toLowerCase().includes(searchLower)) {
                nodesToHighlight.push(node);
            }
        }

        // Highlight matches and store them
        nodesToHighlight.forEach(textNode => {
            const parent = textNode.parentElement;
            if (parent && !parent.classList.contains('jv-btn')) {
                const text = textNode.textContent;
                const lowerText = text.toLowerCase();
                const index = lowerText.indexOf(searchLower);

                if (index !== -1) {
                    parent.style.backgroundColor = '#fef08a';
                    parent.style.color = '#000';
                    parent.classList.add('jv-highlight');
                    this.searchMatches.push(parent);
                }
            }
        });

        // Highlight first match as current
        this.currentMatchIndex = this.searchMatches.length > 0 ? 0 : -1;
        if (this.currentMatchIndex >= 0) {
            this.highlightCurrentMatch();
        }

        this.toolbar.updateMatchCounter(
            this.searchMatches.length > 0 ? 1 : 0,
            this.searchMatches.length
        );
    }

    highlightCurrentMatch() {
        if (this.currentMatchIndex < 0 || this.currentMatchIndex >= this.searchMatches.length) {
            return;
        }

        // Remove current highlight from all
        this.searchMatches.forEach(el => {
            el.style.backgroundColor = '#fef08a';
            el.style.color = '#000';
            el.classList.remove('jv-highlight-current');
        });

        // Highlight current match differently
        const current = this.searchMatches[this.currentMatchIndex];
        current.style.backgroundColor = '#fb923c'; // Orange for current
        current.style.color = '#fff';
        current.classList.add('jv-highlight-current');

        // Expand any collapsed parent nodes to make match visible
        let parent = current.parentElement;
        while (parent && parent !== this.contentContainer) {
            if (parent.classList.contains('jv-node')) {
                const toggler = parent.querySelector('.jv-toggler');
                if (toggler && !toggler.classList.contains('expanded')) {
                    // Expand this node
                    toggler.classList.add('expanded');
                    const childrenContainer = parent.querySelector('.jv-children');
                    if (childrenContainer) {
                        childrenContainer.style.display = 'block';
                    }
                }
            }
            parent = parent.parentElement;
        }

        // Scroll to current match with a slight delay to allow expansion
        setTimeout(() => {
            current.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });

            // Also ensure the scrollable container is properly positioned
            const scrollContainer = current.closest('.jv-content, .jv-schema-tree');
            if (scrollContainer) {
                const rect = current.getBoundingClientRect();
                const containerRect = scrollContainer.getBoundingClientRect();

                // Check if element is outside viewport
                if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
                    current.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                        inline: 'nearest'
                    });
                }
            }
        }, 100);

        // Update counter
        this.toolbar.updateMatchCounter(this.currentMatchIndex + 1, this.searchMatches.length);
    }

    handleSearchNext(backwards = false) {
        if (this.searchMatches.length === 0) return;

        if (backwards) {
            // Shift+Enter - go to previous match
            this.currentMatchIndex--;
            if (this.currentMatchIndex < 0) {
                this.currentMatchIndex = this.searchMatches.length - 1; // Wrap to end
            }
        } else {
            // Enter - go to next match
            this.currentMatchIndex++;
            if (this.currentMatchIndex >= this.searchMatches.length) {
                this.currentMatchIndex = 0; // Wrap to beginning
            }
        }

        this.highlightCurrentMatch();
    }

    handleExpandAll() {
        if (this.currentView === 'tree' && this.treeView) {
            this.treeView.expandAll();
        }
    }

    handleCollapseAll() {
        if (this.currentView === 'tree' && this.treeView) {
            this.treeView.collapseAll();
        }
    }

    handleSave() {
        const blob = new Blob([this.rawData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'data.json';
        a.click();
        URL.revokeObjectURL(url);
        Toast.show('Saved to Downloads');
    }

    toggleTheme() {
        document.body.classList.toggle('dark-theme');
        // Also toggle a class on root for specific overrides if needed
        this.root.classList.toggle('dark');
    }

    copyToClipboard() {
        navigator.clipboard.writeText(this.rawData).then(() => {
            Toast.show('Copied to clipboard');
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                const searchInput = this.root.querySelector('.jv-search');
                if (searchInput) searchInput.focus();
            }
        });
    }
}
