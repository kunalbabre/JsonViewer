import { Icons } from './Icons.js';
import { Toolbar } from './Toolbar.js';
import { TreeView } from './TreeView.js';
import { SchemaView } from './SchemaView.js';
import { YamlView } from './YamlView.js';
import { EditorView } from './EditorView.js';
import { Toast } from './Toast.js';

export class Viewer {
    constructor(root, data, rawData, options = {}) {
        this.root = root;
        this.data = data;
        this.rawData = rawData;
        this.options = options;
        this.currentView = options.isInvalid ? 'editor' : 'tree'; // Default to editor for invalid JSON
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

        this.renderStructure();
        this.setupKeyboardShortcuts();
    }

    renderStructure() {
        this.root.innerHTML = '';
        
        this.toolbarContainer = document.createElement('div');
        this.root.appendChild(this.toolbarContainer);

        this.contentContainer = document.createElement('div');
        this.contentContainer.className = 'jv-content';
        this.root.appendChild(this.contentContainer);

        this.renderToolbar();
        this.renderContent();
    }

    renderToolbar() {
        this.toolbarContainer.innerHTML = '';
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
            searchQuery: this.searchQuery,
            disabledViews: this.options.isInvalid ? ['tree', 'schema', 'yaml', 'grid'] : []
        });
        this.toolbarContainer.appendChild(this.toolbar.element);
    }

    // Legacy render method redirected
    render() {
        this.renderToolbar();
        this.renderContent();
    }

    renderContent() {
        // Hide all existing views and save state
        Array.from(this.contentContainer.children).forEach(child => {
            if (child.style.display !== 'none') {
                // Save scroll state for editor
                if (child.classList.contains('jv-editor-container')) {
                    const textarea = child.querySelector('textarea');
                    if (textarea) child._savedScrollTop = textarea.scrollTop;
                }
                child.style.display = 'none';
            }
        });

        // Check if view is already cached
        let viewElement = this.viewCache[this.currentView];

        if (!viewElement) {
            // Create new view
            if (this.currentView === 'tree') {
                const container = document.createElement('div');
                container.className = 'jv-schema-container';
                
                const treeContainer = document.createElement('div');
                treeContainer.className = 'jv-schema-tree';
                treeContainer.style.flex = '1';

                this.treeView = new TreeView(this.data, this.searchQuery, 'json', this.options);
                treeContainer.appendChild(this.treeView.element);

                container.appendChild(treeContainer);
                container._treeView = this.treeView; // Store reference
                
                viewElement = container;
                
                // Auto expand if searching
                if (this.searchQuery.length > 2) {
                    this.treeView.expandAll();
                }

            } else if (this.currentView === 'editor') {
                const dataToUse = this.options.isInvalid ? this.rawData : this.data;
                const editor = new EditorView(dataToUse, (newData) => {
                    this.data = newData;
                    this.rawData = JSON.stringify(newData, null, 2);
                    
                    if (this.options.isInvalid) {
                        this.options.isInvalid = false;
                        this.renderToolbar();
                    }

                    // Clear cache to force re-render of other views with new data
                    // We need to remove elements from DOM too
                    this.viewCache = {};
                    this.contentContainer.innerHTML = '';
                    // Re-render current view
                    this.renderContent();
                }, { isRaw: this.options.isInvalid });
                this.editorView = editor;
                viewElement = editor.element;
                viewElement._editorView = editor; // Store reference

            } else if (this.currentView === 'raw') {
                const container = document.createElement('div');
                container.className = 'jv-schema-container';
                
                const rawContainer = document.createElement('div');
                rawContainer.className = 'jv-raw-container';
                
                const backdrop = document.createElement('div');
                backdrop.className = 'jv-raw-backdrop';
                
                const textarea = document.createElement('textarea');
                textarea.className = 'jv-raw';
                
                const MAX_RAW_SIZE = 1000000; // 1MB
                let content = this.rawData;
                if (this.rawData.length > MAX_RAW_SIZE) {
                    content = this.rawData.substring(0, MAX_RAW_SIZE) + '\n\n... (Truncated for performance. Use "Save JSON" to download full content.)';
                }
                
                textarea.value = content;
                backdrop.textContent = content; // Initial content

                textarea.readOnly = true;
                
                // Sync scroll
                textarea.addEventListener('scroll', () => {
                    backdrop.scrollTop = textarea.scrollTop;
                    backdrop.scrollLeft = textarea.scrollLeft;
                });

                rawContainer.appendChild(backdrop);
                rawContainer.appendChild(textarea);
                container.appendChild(rawContainer);
                viewElement = container;

            } else if (this.currentView === 'schema') {
                const schema = new SchemaView(this.data, this.searchQuery);
                this.schemaView = schema;
                viewElement = schema.element;
                viewElement._schemaView = schema;

            } else if (this.currentView === 'yaml') {
                const yaml = new YamlView(this.data, this.searchQuery);
                this.yamlView = yaml;
                viewElement = yaml.element;
                viewElement._yamlView = yaml;
            }

            // Cache and append
            if (viewElement) {
                this.viewCache[this.currentView] = viewElement;
                this.contentContainer.appendChild(viewElement);
            }
        }

        // Restore references from cached element
        if (viewElement) {
            if (this.currentView === 'tree') this.treeView = viewElement._treeView;
            if (this.currentView === 'editor') this.editorView = viewElement._editorView;
            if (this.currentView === 'schema') this.schemaView = viewElement._schemaView;
            if (this.currentView === 'yaml') this.yamlView = viewElement._yamlView;

            // Show view
            viewElement.style.display = 'flex'; // Most views use flex

            // Restore scroll state for editor
            if (this.currentView === 'editor' && viewElement._savedScrollTop !== undefined) {
                const textarea = viewElement.querySelector('textarea');
                if (textarea) {
                    textarea.scrollTop = viewElement._savedScrollTop;
                    // Trigger scroll handler to update virtualization
                    if (this.editorView) {
                        this.editorView.handleScroll();
                        // Double check after layout to ensure scroll is applied
                        requestAnimationFrame(() => {
                             textarea.scrollTop = viewElement._savedScrollTop;
                             this.editorView.handleScroll();
                        });
                    }
                }
            }
        }
    }

    switchView(view) {
        this.currentView = view;
        // Update toolbar actions
        this.renderToolbar();
        // Update content visibility
        this.renderContent();
        
        // Re-apply search highlights if needed
        if (this.searchQuery) {
            this.performSearch(this.searchQuery);
        }
    }

    handleSearch(query) {
        // Debounce search to prevent freezing on large files
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
        }

        this.searchDebounceTimer = setTimeout(() => {
            const lowerQuery = query.toLowerCase();

            // Update tree view search query so new nodes get highlighted and expanded
            if (this.treeView) {
                this.treeView.searchQuery = lowerQuery;
            }
            if (this.schemaView && this.schemaView.treeView) {
                this.schemaView.treeView.searchQuery = lowerQuery;
            }
            if (this.yamlView && this.yamlView.treeView) {
                this.yamlView.treeView.searchQuery = lowerQuery;
            }
            
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
        // Only remove highlights from the current view to avoid clearing state of other views
        const currentViewElement = this.viewCache[this.currentView];
        if (currentViewElement) {
            currentViewElement.querySelectorAll('.jv-highlight, .jv-highlight-current').forEach(el => {
                el.classList.remove('jv-highlight', 'jv-highlight-current');
                el.style.backgroundColor = '';
                el.style.color = '';
            });
        } else {
            // Fallback if view not found (shouldn't happen)
            document.querySelectorAll('.jv-highlight, .jv-highlight-current').forEach(el => {
                el.classList.remove('jv-highlight', 'jv-highlight-current');
                el.style.backgroundColor = '';
                el.style.color = '';
            });
        }

        // Find and highlight all matches
        this.searchMatches = [];
        const searchLower = query.toLowerCase();

        // Safety check
        if (!this.contentContainer) {
            console.warn('Content container not found');
            return;
        }

        // Special handling for Raw View (Textarea)
        if (this.currentView === 'raw') {
            // ... (existing raw view logic) ...
            const textarea = currentViewElement ? currentViewElement.querySelector('textarea') : null;
            const backdrop = currentViewElement ? currentViewElement.querySelector('.jv-raw-backdrop') : null;
            
            if (textarea && backdrop) {
                const text = textarea.value;
                const lowerText = text.toLowerCase();
                
                // Reset backdrop
                backdrop.innerHTML = '';
                
                let lastIndex = 0;
                let pos = 0;
                
                // Build highlighted HTML efficiently
                const escapeHtml = (str) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
                
                let html = '';
                const matches = [];

                // Limit matches for performance on extremely large files
                const MAX_MATCHES = 5000;

                while (pos < lowerText.length) {
                    const index = lowerText.indexOf(searchLower, pos);
                    if (index === -1) break;
                    
                    if (matches.length >= MAX_MATCHES) {
                        // Stop searching if too many matches
                        break;
                    }

                    // Add text before match
                    html += escapeHtml(text.substring(lastIndex, index));
                    
                    // Add match
                    const matchText = text.substring(index, index + searchLower.length);
                    html += `<span class="jv-raw-highlight">${escapeHtml(matchText)}</span>`;
                    
                    matches.push({ 
                        start: index, 
                        end: index + searchLower.length
                    });
                    
                    lastIndex = index + searchLower.length;
                    pos = lastIndex;
                }
                
                // Add remaining text
                html += escapeHtml(text.substring(lastIndex));
                
                // Single DOM update
                backdrop.innerHTML = html;
                
                // Map elements back to matches
                const spans = backdrop.querySelectorAll('.jv-raw-highlight');
                for (let i = 0; i < spans.length; i++) {
                    if (matches[i]) matches[i].element = spans[i];
                }
                
                this.searchMatches = matches;
            }
            
            this.toolbar.updateMatchCounter(
                this.searchMatches.length > 0 ? 1 : 0,
                this.searchMatches.length
            );
            
            this.currentMatchIndex = this.searchMatches.length > 0 ? 0 : -1;
            if (this.currentMatchIndex >= 0) {
                this.highlightCurrentMatch();
            }
            return;
        }

        // Special handling for Editor View
        if (this.currentView === 'editor' && this.editorView) {
            const text = this.editorView.content;
            const lowerText = text.toLowerCase();
            let pos = 0;
            
            while (pos < lowerText.length) {
                const index = lowerText.indexOf(searchLower, pos);
                if (index === -1) break;
                this.searchMatches.push({ start: index, end: index + searchLower.length });
                pos = index + searchLower.length;
            }

            this.editorView.setSearchMatches(this.searchMatches);

            this.toolbar.updateMatchCounter(
                this.searchMatches.length > 0 ? 1 : 0,
                this.searchMatches.length
            );
            
            this.currentMatchIndex = this.searchMatches.length > 0 ? 0 : -1;
            if (this.currentMatchIndex >= 0) {
                this.highlightCurrentMatch();
            }
            return;
        }

        // Search in all text nodes
        // Only search within the current view to avoid counting matches in hidden tabs
        if (!currentViewElement) return;

        const walker = document.createTreeWalker(
            currentViewElement,
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

        const match = this.searchMatches[this.currentMatchIndex];

        // Handle Editor View
        if (this.currentView === 'editor' && this.editorView) {
            // Mark current match
            this.searchMatches.forEach((m, i) => m.isCurrent = (i === this.currentMatchIndex));
            this.editorView.setSearchMatches(this.searchMatches);

            // Scroll to match
            // We need to find the line number
            const offsets = this.editorView.lineOffsets;
            if (offsets) {
                // Binary search for line
                let low = 0, high = offsets.length - 1;
                let line = 0;
                while (low <= high) {
                    const mid = Math.floor((low + high) / 2);
                    if (offsets[mid] <= match.start) {
                        line = mid;
                        low = mid + 1;
                    } else {
                        high = mid - 1;
                    }
                }
                
                // Scroll textarea
                const textarea = this.editorView.textarea;
                const lineHeight = this.editorView.lineHeight;
                const containerHeight = textarea.clientHeight;
                
                const scrollTarget = (line * lineHeight) - (containerHeight / 2);
                textarea.scrollTop = Math.max(0, scrollTarget);
            }
            
            this.toolbar.updateMatchCounter(this.currentMatchIndex + 1, this.searchMatches.length);
            return;
        }

        // Handle Raw View (Backdrop highlighting)
        if (this.currentView === 'raw' && match.element) {
            const textarea = this.contentContainer.querySelector('textarea');
            const backdrop = this.contentContainer.querySelector('.jv-raw-backdrop');
            
            // Remove current class from all highlights in backdrop
            const currentHighlights = backdrop.querySelectorAll('.jv-raw-highlight.current');
            currentHighlights.forEach(el => el.classList.remove('current'));
            
            // Add current class to new match
            match.element.classList.add('current');
            
            if (textarea) {
                // Calculate scroll position to center the match
                // We can use the backdrop element's position relative to the container
                const elementTop = match.element.offsetTop;
                const containerHeight = textarea.clientHeight;
                
                const scrollTarget = elementTop - (containerHeight / 2);
                textarea.scrollTop = Math.max(0, scrollTarget);
            }
            
            // Update counter
            this.toolbar.updateMatchCounter(this.currentMatchIndex + 1, this.searchMatches.length);
            return;
        }

        // Remove current highlight from all
        this.searchMatches.forEach(el => {
            if (el.classList) {
                el.classList.remove('jv-highlight-current');
                el.style.backgroundColor = '';
                el.style.color = '';
            }
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
