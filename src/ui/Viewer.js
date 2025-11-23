import { Icons } from './Icons.js';
import { Toolbar } from './Toolbar.js';
import { TreeView } from './TreeView.js';
import { SchemaView } from './SchemaView.js';
import { YamlView } from './YamlView.js';
import { EditorView } from './EditorView.js';
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
        
        // Cache rendered views for fast switching
        this.viewCache = {};

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
            onExpandAll: this.currentView === 'tree' || this.currentView === 'schema' ? () => this.handleExpandAll() : null,
            onCollapseAll: this.currentView === 'tree' || this.currentView === 'schema' ? () => this.handleCollapseAll() : null,
            onSave: () => this.handleSave(),
            onFormat: this.currentView === 'editor' ? () => this.editorView?.format() : null,
            onApply: this.currentView === 'editor' ? () => this.editorView?.applyChanges() : null,
            currentView: this.currentView,
            searchQuery: this.searchQuery
        });
        this.root.appendChild(this.toolbar.element);

        // Content Container
        this.contentContainer = document.createElement('div');
        this.contentContainer.className = 'jv-content';
        this.root.appendChild(this.contentContainer);

        this.renderContent();
    }

    renderContent() {
        // Check if view is already cached
        if (this.viewCache[this.currentView]) {
            this.contentContainer.innerHTML = '';
            this.contentContainer.appendChild(this.viewCache[this.currentView]);
            
            // Restore treeView reference if needed
            if (this.currentView === 'tree') {
                this.treeView = this.viewCache[this.currentView]._treeView;
            }
            return;
        }

        this.contentContainer.innerHTML = '';

        // Helper to create the standard toolbar for JSON views
        const createJsonToolbar = (includeTreeActions = false, includeRawActions = false, textarea = null) => {
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

            if (includeRawActions && textarea) {
                const wrapBtn = document.createElement('button');
                wrapBtn.className = 'jv-btn';
                wrapBtn.innerHTML = `${Icons.link} <span>Word Wrap</span>`; // Reusing link icon for now
                wrapBtn.onclick = () => {
                    const isWrapped = textarea.style.whiteSpace === 'pre-wrap';
                    textarea.style.whiteSpace = isWrapped ? 'pre' : 'pre-wrap';
                    wrapBtn.classList.toggle('active', !isWrapped);
                };
                toolbar.appendChild(wrapBtn);

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
            // Toolbar removed - moved to global toolbar

            const treeContainer = document.createElement('div');
            treeContainer.className = 'jv-schema-tree'; // Reuse for scrolling
            treeContainer.style.flex = '1';

            this.treeView = new TreeView(this.data, this.searchQuery);
            treeContainer.appendChild(this.treeView.element);

            container.appendChild(treeContainer);
            container._treeView = this.treeView; // Store reference
            this.contentContainer.appendChild(container);
            
            // Cache the view
            this.viewCache[this.currentView] = container;

            // Auto expand if searching
            if (this.searchQuery.length > 2) {
                this.treeView.expandAll();
            }

        } else if (this.currentView === 'editor') {
            const editor = new EditorView(this.data, (newData) => {
                this.data = newData;
                this.rawData = JSON.stringify(newData, null, 2);
                // Clear cache to force re-render of other views with new data
                this.viewCache = {};
            });
            this.editorView = editor; // Store reference for toolbar actions
            this.contentContainer.appendChild(editor.element);
            this.viewCache[this.currentView] = editor.element;

        } else if (this.currentView === 'raw') {
            const container = document.createElement('div');
            container.className = 'jv-schema-container';
            
            const textarea = document.createElement('textarea');
            textarea.className = 'jv-raw';
            
            // Toolbar removed - moved to global toolbar
            
            // Truncate large raw data
            const MAX_RAW_SIZE = 1000000; // 1MB
            if (this.rawData.length > MAX_RAW_SIZE) {
                textarea.value = this.rawData.substring(0, MAX_RAW_SIZE) + '\n\n... (Truncated for performance. Use "Save JSON" to download full content.)';
            } else {
                textarea.value = this.rawData;
            }

            textarea.readOnly = true;
            textarea.style.flex = '1'; // Ensure it takes remaining space

            container.appendChild(textarea);
            this.contentContainer.appendChild(container);
            
            // Cache the view
            this.viewCache[this.currentView] = container;

        } else if (this.currentView === 'schema') {
            const schema = new SchemaView(this.data, this.searchQuery);
            this.schemaView = schema; // Store reference
            this.contentContainer.appendChild(schema.element);
            
            // Cache the view
            this.viewCache[this.currentView] = schema.element;
            
        } else if (this.currentView === 'yaml') {
            const yaml = new YamlView(this.data, this.searchQuery);
            this.contentContainer.appendChild(yaml.element);
            
            // Cache the view
            this.viewCache[this.currentView] = yaml.element;
        }
    }

    switchView(view) {
        this.currentView = view;
        // Re-render entire app to update toolbar actions
        this.render();
        
        // Re-apply search highlights if needed
        if (this.searchQuery) {
            this.performSearch(this.searchQuery);
        }
    }

    handleSearch(query) {
        // Update tree view search query so new nodes get highlighted
        if (this.treeView) {
            this.treeView.searchQuery = query.toLowerCase();
        }
        
        // Instant search - no debouncing
        this.performSearch(query);
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
            el.classList.remove('jv-highlight', 'jv-highlight-current');
            el.style.backgroundColor = '';
            el.style.color = '';
        });

        // Find and highlight all matches
        this.searchMatches = [];
        const searchLower = query.toLowerCase();

        // Safety check
        if (!this.contentContainer) {
            console.warn('Content container not found');
            return;
        }

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
            try {
                const parent = textNode.parentElement;
                if (parent && !parent.classList.contains('jv-btn')) {
                    const text = textNode.textContent;
                    const lowerText = text.toLowerCase();
                    const index = lowerText.indexOf(searchLower);

                    if (index !== -1) {
                        parent.classList.add('jv-highlight');
                        this.searchMatches.push(parent);
                    }
                }
            } catch (e) {
                console.warn('Failed to highlight search match:', e);
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
            el.classList.remove('jv-highlight-current');
            el.style.backgroundColor = '';
            el.style.color = '';
        });

        // Highlight current match differently
        const current = this.searchMatches[this.currentMatchIndex];
        current.classList.add('jv-highlight-current');
        current.style.backgroundColor = ''; // Ensure inline style doesn't override class
        current.style.color = '';

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
        } else if (this.currentView === 'schema' && this.schemaView && this.schemaView.treeView) {
            this.schemaView.treeView.expandAll();
        }
    }

    handleCollapseAll() {
        if (this.currentView === 'tree' && this.treeView) {
            this.treeView.collapseAll();
        } else if (this.currentView === 'schema' && this.schemaView && this.schemaView.treeView) {
            this.schemaView.treeView.collapseAll();
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
        }).catch((e) => {
            Toast.show('Failed to copy: ' + e.message);
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                try {
                    const searchInput = this.root.querySelector('.jv-search');
                    if (searchInput) searchInput.focus();
                } catch (err) {
                    console.warn('Failed to focus search input:', err);
                }
            }
        });
    }
}
