// import { Icons } from './Icons.js';
import { Toolbar } from './Toolbar.js';
import { TreeView } from './TreeView.js';
import { SchemaView } from './SchemaView.js';
import { YamlView } from './YamlView.js';
import { EditorView } from './EditorView.js';
import { Toast } from './Toast.js';
import { escapeHtml } from '../utils/helpers.js';

/**
 * @typedef {'tree' | 'editor' | 'raw' | 'schema' | 'yaml'} ViewMode
 */

/**
 * @typedef {Object} ViewerOptions
 * @property {ViewMode} [initialView] - Initial view mode to display
 * @property {boolean} [isInvalid] - Whether the JSON is invalid (enables raw editor mode)
 * @property {boolean} [expandAll] - Expand all tree nodes on load
 * @property {number} [expandToLevel] - Expand tree to specific depth level
 * @property {(view: ViewMode) => void} [onViewChange] - Callback when view mode changes
 * @property {() => void} [onClose] - Close button callback (for modal context)
 */

/**
 * Search match can be either a DOM element (for tree/schema views)
 * or a position object (for editor/raw view)
 * @typedef {HTMLElement | {start: number, end: number, element?: HTMLElement, isCurrent?: boolean}} SearchMatch
 */

/**
 * Main JSON Viewer orchestrator class.
 * Manages multiple view modes, search, themes, and coordinates all UI components.
 */
export class Viewer {
    /**
     * Creates a new Viewer instance.
     *
     * @param {HTMLElement} root - Container element to render into
     * @param {any} data - Parsed JSON data object
     * @param {string} rawData - Original raw JSON string
     * @param {ViewerOptions} [options={}] - Configuration options
     */
    constructor(root, data, rawData, options = {}) {
        /** @type {HTMLElement} */
        this.root = root;
        /** @type {any} */
        this.data = data;
        /** @type {string} */
        this.rawData = rawData;
        /** @type {ViewerOptions} */
        this.options = options;
        /** @type {ViewMode} */
        this.currentView = options.initialView || (options.isInvalid ? 'editor' : 'tree');
        /** @type {string} */
        this.searchQuery = '';
        /** @type {SearchMatch[]} */
        this.searchMatches = [];
        /** @type {number} */
        this.currentMatchIndex = -1;
        /** @type {number|null} */
        this.searchDebounceTimer = null;
        /** @type {((e: KeyboardEvent) => void)|null} */
        this.keydownHandler = null;

        /**
         * Cache rendered views for fast switching
         * @type {Object<ViewMode, HTMLDivElement & {_treeView?: TreeView, _editorView?: EditorView, _schemaView?: SchemaView, _yamlView?: YamlView}>}
         */
        this.viewCache = {};

        /** @type {TreeView|null} */
        this.treeView = null;
        /** @type {EditorView|null} */
        this.editorView = null;
        /** @type {SchemaView|null} */
        this.schemaView = null;
        /** @type {YamlView|null} */
        this.yamlView = null;
        /** @type {Toolbar|null} */
        this.toolbar = null;

        /** @type {string|null} Pre-formatted JSON string for editor */
        this.formattedJson = null;
        /** @type {boolean} Whether formatting is in progress */
        this.isFormatting = false;
        /** @type {string|null} Pre-converted YAML string */
        this.yamlString = null;
        /** @type {boolean} Whether YAML conversion is in progress */
        this.isConvertingYaml = false;

        // Detect theme preference from storage, then system preference
        let storedTheme = null;
        try {
            storedTheme = localStorage.getItem('json-viewer-theme');
        } catch (e) {
            // localStorage might not be available in all contexts
        }

        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const shouldUseDark = storedTheme === 'dark' || (!storedTheme && prefersDark);
        /** @type {'dark' | 'light'} */
        this.theme = shouldUseDark ? 'dark' : 'light';
        console.log('JSON Viewer: Theme preference:', this.theme, 'stored:', storedTheme, 'prefersDark:', prefersDark);

        // Apply theme immediately
        if (shouldUseDark) {
            document.body.classList.add('dark-theme');
            this.root.classList.add('dark');
            console.log('JSON Viewer: Applied dark theme classes');
        }

        this.renderStructure();
        this.setupKeyboardShortcuts();

        // Start parallel pre-processing immediately for faster tab switching
        this.startParallelPreprocessing();

        // Pre-build other views in the background for faster tab switching
        this.prebuildViewsInBackground();
    }

    /**
     * Start pre-processing data in parallel for Editor and YAML views
     * This runs immediately when viewer loads to prepare data before tabs are clicked
     */
    startParallelPreprocessing() {
        // Skip for invalid JSON or very large files
        if (this.options.isInvalid) return;
        if (this.rawData.length > 50000000) return; // Skip for files > 50MB

        // Check if already formatted
        const isFormatted = this.rawData.includes('\n  ') || this.rawData.includes('\n\t');

        // Pre-format JSON for editor if needed
        if (!isFormatted && this.rawData.length > 1000) {
            this.isFormatting = true;
            this.formatJsonInBackground(this.rawData);
        } else {
            this.formattedJson = this.rawData;
        }

        // Pre-convert to YAML in background (skip for very large files)
        if (this.rawData.length < 5000000) { // Only for files < 5MB
            this.isConvertingYaml = true;
            this.convertYamlInBackground();
        }
    }

    /**
     * Format JSON in background using chunked processing
     * @param {string} rawStr - Raw JSON string
     */
    formatJsonInBackground(rawStr) {
        const result = [];
        let indent = 0;
        let inString = false;
        let escaped = false;
        let pos = 0;
        const len = rawStr.length;
        const chunkSize = 200000; // 200KB chunks for faster processing

        const processChunk = () => {
            const endPos = Math.min(pos + chunkSize, len);

            while (pos < endPos) {
                const char = rawStr[pos];

                if (escaped) {
                    result.push(char);
                    escaped = false;
                    pos++;
                    continue;
                }

                if (char === '\\' && inString) {
                    result.push(char);
                    escaped = true;
                    pos++;
                    continue;
                }

                if (char === '"') {
                    inString = !inString;
                    result.push(char);
                    pos++;
                    continue;
                }

                if (inString) {
                    result.push(char);
                    pos++;
                    continue;
                }

                switch (char) {
                    case '{':
                    case '[':
                        result.push(char);
                        indent++;
                        result.push('\n');
                        result.push('  '.repeat(indent));
                        break;
                    case '}':
                    case ']':
                        indent--;
                        result.push('\n');
                        result.push('  '.repeat(indent));
                        result.push(char);
                        break;
                    case ',':
                        result.push(char);
                        result.push('\n');
                        result.push('  '.repeat(indent));
                        break;
                    case ':':
                        result.push(': ');
                        break;
                    case ' ':
                    case '\t':
                    case '\n':
                    case '\r':
                        break;
                    default:
                        result.push(char);
                }
                pos++;
            }

            if (pos < len) {
                setTimeout(processChunk, 0);
            } else {
                this.formattedJson = result.join('');
                this.isFormatting = false;
                console.log('JSON Viewer: Pre-formatting complete');
            }
        };

        setTimeout(processChunk, 10);
    }

    /**
     * Convert to YAML in background
     */
    async convertYamlInBackground() {
        try {
            // Dynamic import to avoid loading yaml utils if not needed
            const { jsonToYaml } = await import('../utils/yaml.js');

            // Use setTimeout to not block initial render
            setTimeout(() => {
                try {
                    this.yamlString = jsonToYaml(this.data);
                    this.isConvertingYaml = false;
                    console.log('JSON Viewer: YAML pre-conversion complete');
                } catch (e) {
                    console.warn('JSON Viewer: YAML pre-conversion failed:', e);
                    this.isConvertingYaml = false;
                }
            }, 50);
        } catch (e) {
            this.isConvertingYaml = false;
        }
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
        // Clean up old toolbar before destroying DOM to prevent memory leaks
        if (this.toolbar?.destroy) {
            this.toolbar.destroy();
        }
        this.toolbarContainer.innerHTML = '';
        const showExpandCollapse = this.currentView === 'tree';
        this.toolbar = new Toolbar({
            onSearch: (query) => this.handleSearch(query),
            onSearchNext: (backwards) => this.handleSearchNext(backwards),
            onViewChange: (view) => this.switchView(view),
            onThemeToggle: () => this.toggleTheme(),
            onCopy: () => this.copyToClipboard(),
            onExpandAll: showExpandCollapse ? () => this.handleExpandAll() : null,
            onCollapseAll: showExpandCollapse ? () => this.handleCollapseAll() : null,
            onExpandToLevel: showExpandCollapse ? (level) => this.handleExpandToLevel(level) : null,
            onSave: () => this.handleSave(),
            onFormat: this.currentView === 'editor' ? () => this.editorView?.format() : null,
            onApply: this.currentView === 'editor' ? () => this.editorView?.applyChanges() : null,
            currentView: this.currentView,
            searchQuery: this.searchQuery,
            disabledViews: this.options.isInvalid ? ['tree', 'schema', 'yaml', 'grid'] : [],
            onClose: this.options.onClose || null
        });
        this.toolbarContainer.appendChild(this.toolbar.element);
    }

    // Legacy render method redirected
    render() {
        this.renderToolbar();
        this.renderContent();
    }

    renderContent() {
        // Hide all existing views
        Array.from(this.contentContainer.children).forEach(el => {
            /** @type {HTMLElement & {_editorView?: EditorView}} */
            const child = /** @type {HTMLElement & {_editorView?: EditorView}} */ (el);
            if (child.style.display !== 'none') {
                // Pause editor processing before hiding
                if (child.classList.contains('jv-editor-container') && child._editorView) {
                    child._editorView.pause();
                }
                child.style.display = 'none';
            }
        });

        // Check if view is already cached
        let viewElement = this.viewCache[this.currentView];

        if (!viewElement) {
            // Create new view with error boundary
            try {
                viewElement = this.createView(this.currentView);
            } catch (e) {
                console.error(`JSON Viewer: Failed to create ${this.currentView} view:`, e);
                viewElement = this.createErrorView(this.currentView, e);
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
            viewElement.style.display = 'flex';

            // Resume editor processing
            if (this.currentView === 'editor' && this.editorView) {
                this.editorView.resume();
            }
        }
    }

    createView(viewName) {
        let viewElement = null;

        if (viewName === 'tree') {
            const container = document.createElement('div');
            container.className = 'jv-schema-container';

            const treeContainer = document.createElement('div');
            treeContainer.className = 'jv-schema-tree';
            treeContainer.style.flex = '1';

            this.treeView = new TreeView(this.data, this.searchQuery, 'json', this.options);
            treeContainer.appendChild(this.treeView.element);

            container.appendChild(treeContainer);
            /** @type {any} */ (container)._treeView = this.treeView; // Store reference

            viewElement = container;

            // Auto expand if searching
            if (this.searchQuery.length > 2) {
                this.treeView.expandAll();
            }

        } else if (viewName === 'editor') {
            // For valid JSON, use pre-formatted string if available
            // This makes editor tab instant when clicked
            const dataToUse = this.options.isInvalid ? this.rawData : this.data;
            // Use pre-formatted JSON if available, otherwise fall back to raw
            const rawStringToUse = this.options.isInvalid ? null : (this.formattedJson || this.rawData);
            const editor = new EditorView(dataToUse, (newData) => {
                this.data = newData;
                this.rawData = JSON.stringify(newData, null, 2);
                this.formattedJson = this.rawData; // Update cached formatted

                if (this.options.isInvalid) {
                    this.options.isInvalid = false;
                    this.renderToolbar();
                }

                // Clear cache to force re-render of other views with new data
                this.viewCache = {};
                this.contentContainer.innerHTML = '';
                // Re-render current view
                this.renderContent();
            }, { isRaw: this.options.isInvalid, rawString: rawStringToUse });
            this.editorView = editor;
            viewElement = editor.element;
            /** @type {any} */ (viewElement)._editorView = editor; // Store reference

        } else if (viewName === 'raw') {
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

        } else if (viewName === 'schema') {
            const schema = new SchemaView(this.data, this.searchQuery);
            this.schemaView = schema;
            viewElement = schema.element;
            /** @type {any} */ (viewElement)._schemaView = schema;

        } else if (viewName === 'yaml') {
            // Pass pre-converted YAML string if available for instant rendering
            // Also pass rawData length so YamlView can skip conversion for large files
            const yaml = new YamlView(this.data, this.searchQuery, this.yamlString, this.rawData.length);
            this.yamlView = yaml;
            viewElement = yaml.element;
            /** @type {any} */ (viewElement)._yamlView = yaml;
        }

        return viewElement;
    }

    createErrorView(viewName, error) {
        const container = document.createElement('div');
        container.className = 'jv-schema-container';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.padding = '2rem';
        container.style.color = 'var(--null-color)';
        container.style.textAlign = 'center';

        const icon = document.createElement('div');
        icon.style.fontSize = '3rem';
        icon.style.marginBottom = '1rem';
        icon.textContent = '⚠️';

        const title = document.createElement('div');
        title.style.fontSize = '1.25rem';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '0.5rem';
        title.textContent = `Failed to render ${viewName} view`;

        const message = document.createElement('div');
        message.style.fontSize = '0.875rem';
        message.style.opacity = '0.8';
        message.style.maxWidth = '400px';
        message.textContent = error.message || 'An unexpected error occurred';

        const retryBtn = document.createElement('button');
        retryBtn.className = 'jv-btn';
        retryBtn.style.marginTop = '1rem';
        retryBtn.textContent = 'Try Again';
        retryBtn.onclick = () => {
            delete this.viewCache[viewName];
            this.renderContent();
        };

        container.appendChild(icon);
        container.appendChild(title);
        container.appendChild(message);
        container.appendChild(retryBtn);

        return container;
    }

    switchView(view) {
        this.currentView = view;
        
        // Cancel pending search before switching
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = null;
        }

        // Notify parent
        if (this.options.onViewChange) {
            this.options.onViewChange(view);
        }

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
            
            this.performSearch(query);
        }, 300);
    }

    performSearch(query) {
        this.searchQuery = query.toLowerCase();

        // Fast search - just update highlights without re-rendering
        if (!query) {
            // Clear all highlights
            document.querySelectorAll('.jv-highlight, .jv-highlight-current').forEach(e => {
                const el = /** @type {HTMLElement} */ (e);
                el.style.backgroundColor = '';
                el.style.color = '';
                el.classList.remove('jv-highlight', 'jv-highlight-current');
            });
            
            // Clear Editor View highlights
            if (this.editorView) {
                this.editorView.setSearchMatches([]);
            }

            // Clear Raw View highlights
            const backdrop = this.contentContainer.querySelector('.jv-raw-backdrop');
            if (backdrop) {
                backdrop.innerHTML = '';
            }

            this.searchMatches = [];
            this.currentMatchIndex = -1;
            this.toolbar.updateMatchCounter(0, 0);
            return;
        }

        // Remove old highlights
        // Only remove highlights from the current view to avoid clearing state of other views
        const currentViewElement = this.viewCache[this.currentView];
        if (currentViewElement) {
            currentViewElement.querySelectorAll('.jv-highlight, .jv-highlight-current').forEach(e => {
                const el = /** @type {HTMLElement} */ (e);
                el.classList.remove('jv-highlight', 'jv-highlight-current');
                el.style.backgroundColor = '';
                el.style.color = '';
            });
        } else {
            // Fallback if view not found (shouldn't happen)
            document.querySelectorAll('.jv-highlight, .jv-highlight-current').forEach(e => {
                const el = /** @type {HTMLElement} */ (e);
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
                
                let html = '';
                const matches = [];

                // Limit matches for performance on extremely large files
                const MAX_MATCHES = 5000;

                while (pos < lowerText.length) {
                    const index = lowerText.indexOf(searchLower, pos);
                    if (index === -1) break;
                    
                    if (matches.length >= MAX_MATCHES) {
                        // Stop searching if too many matches
                        Toast.show(`Showing first ${MAX_MATCHES} matches. Refine your search for better results.`);
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
                    if (matches[i]) /** @type {any} */ (matches[i]).element = spans[i];
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
        while ((node = walker.nextNode()) !== null) {
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
            this.searchMatches.forEach((m, i) => /** @type {any} */ (m).isCurrent = (i === this.currentMatchIndex));

            // Scroll to match and update highlights
            this.editorView.scrollToMatch(/** @type {{start: number, end: number}} */ (match));
            this.editorView.setSearchMatches(/** @type {Array<{start: number, end: number}>} */ (this.searchMatches));

            this.toolbar.updateMatchCounter(this.currentMatchIndex + 1, this.searchMatches.length);
            return;
        }

        // Handle Raw View (Backdrop highlighting)
        const rawMatch = /** @type {any} */ (match);
        if (this.currentView === 'raw' && rawMatch.element) {
            const textarea = this.contentContainer.querySelector('textarea');
            const backdrop = this.contentContainer.querySelector('.jv-raw-backdrop');

            // Remove current class from all highlights in backdrop
            const currentHighlights = backdrop.querySelectorAll('.jv-raw-highlight.current');
            currentHighlights.forEach(el => el.classList.remove('current'));

            // Add current class to new match
            rawMatch.element.classList.add('current');

            if (textarea) {
                // Calculate scroll position to center the match
                // We can use the backdrop element's position relative to the container
                const elementTop = rawMatch.element.offsetTop;
                const containerHeight = textarea.clientHeight;
                
                const scrollTarget = elementTop - (containerHeight / 2);
                textarea.scrollTop = Math.max(0, scrollTarget);
            }
            
            // Update counter
            this.toolbar.updateMatchCounter(this.currentMatchIndex + 1, this.searchMatches.length);
            return;
        }

        // Remove current highlight from all (only for DOM element matches)
        this.searchMatches.forEach(match => {
            if (match instanceof HTMLElement) {
                match.classList.remove('jv-highlight-current');
                match.style.backgroundColor = '';
                match.style.color = '';
            }
        });

        // Highlight current match differently
        const current = /** @type {HTMLElement} */ (this.searchMatches[this.currentMatchIndex]);
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
                    const childrenContainer = /** @type {HTMLElement} */ (parent.querySelector('.jv-children'));
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
                Toast.show('Wrapped to last match');
            }
        } else {
            // Enter - go to next match
            this.currentMatchIndex++;
            if (this.currentMatchIndex >= this.searchMatches.length) {
                this.currentMatchIndex = 0; // Wrap to beginning
                Toast.show('Wrapped to first match');
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

    handleExpandToLevel(level) {
        if (this.currentView === 'tree' && this.treeView) {
            this.treeView.expandToLevel(level);
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
        const isDark = document.body.classList.toggle('dark-theme');
        // Also toggle a class on root for specific overrides if needed
        this.root.classList.toggle('dark', isDark);
        
        // Handle modal container if we're in a modal
        const modalRoot = document.getElementById('jv-modal-root');
        if (modalRoot) {
            modalRoot.classList.toggle('dark-theme', isDark);
        }
        
        // Also toggle on modal content for CSS custom property overrides
        const modalContent = document.querySelector('.jv-modal-content');
        if (modalContent) {
            modalContent.classList.toggle('dark-theme', isDark);
        }
        
        // Store preference for persistence
        try {
            localStorage.setItem('json-viewer-theme', isDark ? 'dark' : 'light');
        } catch (e) {
            // localStorage might not be available in all contexts (e.g., cross-origin pages)
            // Silently ignore - theme still works for current session
        }
    }

    copyToClipboard() {
        let content;
        let label;
        
        switch (this.currentView) {
            case 'editor':
                content = this.editorView?.textarea?.value || this.rawData;
                label = 'JSON';
                break;
            case 'schema':
                content = this.schemaView?.getSchemaString() || '';
                label = 'Schema';
                if (!content) {
                    Toast.show('Schema not ready yet');
                    return;
                }
                break;
            case 'yaml':
                content = this.yamlView?.getYamlString() || '';
                label = 'YAML';
                if (!content) {
                    Toast.show('YAML not ready yet');
                    return;
                }
                break;
            case 'tree':
            case 'raw':
            default:
                content = this.rawData;
                label = 'JSON';
                break;
        }
        
        navigator.clipboard.writeText(content).then(() => {
            Toast.show(`${label} copied to clipboard`);
        }).catch((e) => {
            Toast.show('Failed to copy: ' + e.message);
        });
    }

    setupKeyboardShortcuts() {
        // Store bound handler for cleanup
        this.keydownHandler = (e) => {
            // Don't trigger shortcuts when typing in inputs
            const target = /** @type {HTMLElement} */ (e.target);
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                try {
                    const searchInput = /** @type {HTMLElement} */ (this.root.querySelector('.jv-search'));
                    if (searchInput) searchInput.focus();
                } catch (err) {
                    console.warn('Failed to focus search input:', err);
                }
            }

            // Copy shortcut (⌘C) - only when not in an input
            if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !isInput) {
                // Only copy if no text is selected (otherwise let browser handle it)
                const selection = window.getSelection();
                if (!selection || selection.toString().length === 0) {
                    e.preventDefault();
                    this.copyToClipboard();
                }
            }

            // Save shortcut (⌘S)
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                this.handleSave();
            }

            // Theme toggle shortcut (⌘D) - only when not in an input
            if ((e.metaKey || e.ctrlKey) && e.key === 'd' && !isInput) {
                e.preventDefault();
                this.toggleTheme();
            }

            // Format shortcut (Alt+Shift+F) - for Editor and Schema views
            if (e.altKey && e.shiftKey && e.key === 'F') {
                e.preventDefault();
                if (this.currentView === 'editor' && this.editorView) {
                    this.editorView.format();
                } else if (this.currentView === 'schema' && this.schemaView?.editorView) {
                    this.schemaView.editorView.format();
                }
            }

            // Apply shortcut (⌘Enter / Ctrl+Enter) - for Editor view
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (this.editorView && this.currentView === 'editor') {
                    this.editorView.applyChanges();
                }
            }
        };
        document.addEventListener('keydown', this.keydownHandler);
    }

    /**
     * Pre-build views in the background for faster tab switching.
     * Uses requestIdleCallback to avoid blocking the UI.
     */
    prebuildViewsInBackground() {
        // Don't pre-build if data is invalid
        if (this.options.isInvalid) return;

        // Don't pre-build for large files (>1MB) - let user trigger on demand
        if (this.rawData.length > 1000000) {
            console.log('JSON Viewer: Skipping pre-build for large file');
            return;
        }

        // List of views to pre-build (excluding current view and raw which is fast)
        const viewsToPrebuild = ['editor', 'schema', 'yaml'].filter(v => v !== this.currentView);

        const prebuildNext = () => {
            if (viewsToPrebuild.length === 0) return;

            const viewName = viewsToPrebuild.shift();
            if (this.viewCache[viewName]) {
                // Already cached, move to next
                scheduleNext();
                return;
            }

            try {
                const viewElement = this.createView(viewName);
                if (viewElement) {
                    this.viewCache[viewName] = viewElement;
                    viewElement.style.display = 'none';
                    this.contentContainer.appendChild(viewElement);
                }
            } catch (e) {
                console.warn(`Failed to pre-build ${viewName} view:`, e);
            }

            scheduleNext();
        };

        const scheduleNext = () => {
            if (viewsToPrebuild.length === 0) return;
            if (window.requestIdleCallback) {
                requestIdleCallback(prebuildNext, { timeout: 5000 });
            } else {
                setTimeout(prebuildNext, 100);
            }
        };

        // Start pre-building after a short delay to let the main view render first
        setTimeout(scheduleNext, 500);
    }

    /**
     * Clean up event listeners and resources to prevent memory leaks.
     * Call this when removing the viewer from the DOM.
     */
    destroy() {
        // Remove keyboard shortcut listener
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
            this.keydownHandler = null;
        }

        // Clean up search debounce timer
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = null;
        }

        // Destroy child views to clean up their listeners and workers
        if (this.editorView?.destroy) {
            this.editorView.destroy();
        }
        if (this.schemaView?.editorView?.destroy) {
            this.schemaView.editorView.destroy();
        }
        if (this.schemaView?.worker) {
            this.schemaView.worker.terminate();
        }
        if (this.yamlView?.editorView?.destroy) {
            this.yamlView.editorView.destroy();
        }

        // Clean up toolbar
        if (this.toolbar?.destroy) {
            this.toolbar.destroy();
        }

        // Clear view cache
        this.viewCache = {};

        // Clear references
        this.treeView = null;
        this.editorView = null;
        this.schemaView = null;
        this.yamlView = null;
        this.toolbar = null;
    }
}
