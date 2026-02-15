import { Icons } from './Icons.js';

// Detect platform for keyboard shortcut display
const isMac = typeof navigator !== 'undefined' && (
    /** @type {any} */ (navigator).userAgentData?.platform === 'macOS' ||
    /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
);
const MOD_KEY = isMac ? '⌘' : 'Ctrl+';

export class Toolbar {
    constructor({ onSearch, onSearchNext, onViewChange, onThemeToggle, onCopy, onExpandAll, onCollapseAll, onExpandToLevel, onSave, onFormat, onApply, currentView, searchQuery, disabledViews = [], onClose = null }) {
        this.element = document.createElement('div');
        this.element.className = 'jv-toolbar-container';

        // --- Top Bar: Navigation & Title ---
        const topBar = document.createElement('div');
        topBar.className = 'jv-top-bar';

        // Left: View Switchers
        const leftGroup = document.createElement('div');
        leftGroup.className = 'jv-nav-group';
        
        const views = ['tree', 'editor', 'schema', 'yaml', 'raw'];
        this.viewButtons = {};
        views.forEach(view => {
            const btn = document.createElement('button');
            btn.className = `jv-nav-btn ${view === currentView ? 'active' : ''}`;
            const label = view === 'editor' ? 'Editor' : view.charAt(0).toUpperCase() + view.slice(1);
            btn.title = `${label} View`;
            btn.textContent = label;
            
            if (disabledViews.includes(view)) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            } else {
                btn.onclick = () => onViewChange(view);
            }
            
            this.viewButtons[view] = btn;
            leftGroup.appendChild(btn);
        });
        topBar.appendChild(leftGroup);

        // Right: Logo & Theme
        const rightGroup = document.createElement('div');
        rightGroup.className = 'jv-meta-group';

        const logo = document.createElement('div');
        logo.className = 'jv-logo';
        logo.textContent = 'JSON Viewer';
        rightGroup.appendChild(logo);

        const themeBtn = this.createButton(Icons.theme, 'Toggle Theme', onThemeToggle, '', `${MOD_KEY}D`);
        themeBtn.classList.add('jv-icon-only');
        rightGroup.appendChild(themeBtn);

        // Optional close button (for modal context)
        if (onClose) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'jv-btn jv-icon-only jv-close-btn';
            closeBtn.innerHTML = Icons.close;
            closeBtn.title = 'Close';
            closeBtn.onclick = onClose;
            rightGroup.appendChild(closeBtn);
        }

        topBar.appendChild(rightGroup);
        this.element.appendChild(topBar);

        // --- Second Bar: Actions & Search ---
        const actionBar = document.createElement('div');
        actionBar.className = 'jv-action-bar';

        // Left: Search
        const searchContainer = document.createElement('div');
        searchContainer.className = 'jv-search-container';

        const searchIcon = document.createElement('div');
        searchIcon.className = 'jv-search-icon';
        searchIcon.innerHTML = Icons.search;
        searchContainer.appendChild(searchIcon);

        const searchInput = document.createElement('input');
        searchInput.className = 'jv-search';
        searchInput.placeholder = `Find in document... (${MOD_KEY}F)`;
        searchInput.value = searchQuery || '';
        searchInput.addEventListener('input', (e) => onSearch(/** @type {HTMLInputElement} */ (e.target).value));
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (onSearchNext) onSearchNext(e.shiftKey);
            }
        });
        searchContainer.appendChild(searchInput);

        // Search Navigation Buttons
        this.navContainer = document.createElement('div');
        this.navContainer.className = 'jv-search-nav';
        this.navContainer.style.display = 'none'; // Hidden by default
        
        const prevBtn = document.createElement('button');
        prevBtn.className = 'jv-search-btn';
        prevBtn.innerHTML = Icons.arrowUp;
        prevBtn.title = 'Previous Match (Shift+Enter)';
        prevBtn.onclick = () => onSearchNext && onSearchNext(true);
        
        const nextBtn = document.createElement('button');
        nextBtn.className = 'jv-search-btn';
        nextBtn.innerHTML = Icons.arrowDown;
        nextBtn.title = 'Next Match (Enter)';
        nextBtn.onclick = () => onSearchNext && onSearchNext(false);
        
        this.navContainer.appendChild(prevBtn);
        this.navContainer.appendChild(nextBtn);
        searchContainer.appendChild(this.navContainer);

        this.matchCounter = document.createElement('span');
        this.matchCounter.className = 'jv-match-counter';
        this.matchCounter.style.display = 'none';
        searchContainer.appendChild(this.matchCounter);

        actionBar.appendChild(searchContainer);

        // Right: Tools (Expand, Collapse, Copy, Save)
        const toolsGroup = document.createElement('div');
        toolsGroup.className = 'jv-tools-group';

        if (onFormat) {
            toolsGroup.appendChild(this.createButton(Icons.format, 'Format JSON', onFormat, 'Format', `Alt+Shift+F`));
        }
        if (onApply) {
            toolsGroup.appendChild(this.createButton(Icons.save, 'Apply Changes', onApply, 'Apply', `${MOD_KEY}Enter`));
            this.createSeparator(toolsGroup);
        }

        if (onExpandAll) {
            toolsGroup.appendChild(this.createButton(Icons.expand, 'Expand All', onExpandAll, 'Expand'));
        }
        if (onCollapseAll) {
            toolsGroup.appendChild(this.createButton(Icons.collapse, 'Collapse All', onCollapseAll, 'Collapse'));
        }
        
        // Level-based expand/collapse (VS Code style)
        if (onExpandToLevel) {
            const levelDropdown = document.createElement('div');
            levelDropdown.className = 'jv-level-dropdown';
            
            const levelBtn = document.createElement('button');
            levelBtn.className = 'jv-btn jv-level-btn';
            levelBtn.innerHTML = `${Icons.levels || '⋮'} <span>Level</span>`;
            levelBtn.title = 'Expand/Collapse to Level';
            
            const levelMenu = document.createElement('div');
            levelMenu.className = 'jv-level-menu';
            levelMenu.style.display = 'none';
            
            for (let i = 1; i <= 5; i++) {
                const item = document.createElement('button');
                item.className = 'jv-level-item';
                item.textContent = `Level ${i}`;
                item.title = `Expand to depth ${i}`;
                item.onclick = (e) => {
                    e.stopPropagation();
                    onExpandToLevel(i);
                    levelMenu.style.display = 'none';
                };
                levelMenu.appendChild(item);
            }
            
            levelBtn.onclick = (e) => {
                e.stopPropagation();
                levelMenu.style.display = levelMenu.style.display === 'none' ? 'flex' : 'none';
            };

            // Close menu when clicking outside - store reference for cleanup
            this.levelMenuClickHandler = () => {
                levelMenu.style.display = 'none';
            };
            document.addEventListener('click', this.levelMenuClickHandler);

            levelDropdown.appendChild(levelBtn);
            levelDropdown.appendChild(levelMenu);
            toolsGroup.appendChild(levelDropdown);
        }
        
        if ((onExpandAll || onCollapseAll) && (onCopy || onSave)) {
            this.createSeparator(toolsGroup);
        }

        if (onCopy) {
            toolsGroup.appendChild(this.createButton(Icons.copy, 'Copy to Clipboard', onCopy, 'Copy', `${MOD_KEY}C`));
        }
        if (onSave) {
            toolsGroup.appendChild(this.createButton(Icons.save, 'Save to File', onSave, 'Save', `${MOD_KEY}S`));
        }

        actionBar.appendChild(toolsGroup);
        this.element.appendChild(actionBar);
    }

    createButton(iconHtml, title, onClick, labelText = '', shortcut = '') {
        const btn = document.createElement('button');
        btn.className = 'jv-btn';
        btn.title = shortcut ? `${title} (${shortcut})` : title;
        // iconHtml is trusted (from Icons.js), but labelText could be user-derived
        btn.innerHTML = iconHtml;
        if (labelText) {
            const labelSpan = document.createElement('span');
            labelSpan.textContent = labelText;
            btn.appendChild(labelSpan);
        }
        btn.onclick = onClick;
        return btn;
    }

    createSeparator(container) {
        const sep = document.createElement('div');
        sep.className = 'jv-separator';
        container.appendChild(sep);
    }

    updateActiveView(view) {
        Object.values(this.viewButtons).forEach(btn => btn.classList.remove('active'));
        if (this.viewButtons[view]) {
            this.viewButtons[view].classList.add('active');
        }
    }

    updateMatchCounter(current, total) {
        if (total > 0) {
            this.matchCounter.textContent = `${current}/${total}`;
            this.matchCounter.style.display = 'block';
            // Show navigation arrows only if there are multiple results
            if (this.navContainer) {
                this.navContainer.style.display = total > 1 ? 'flex' : 'none';
            }
        } else if (current === 0 && total === 0) {
            this.matchCounter.style.display = 'none';
            if (this.navContainer) this.navContainer.style.display = 'none';
        } else {
            this.matchCounter.textContent = 'No matches';
            this.matchCounter.style.display = 'block';
            if (this.navContainer) this.navContainer.style.display = 'none';
        }
    }

    /**
     * Clean up event listeners to prevent memory leaks.
     */
    destroy() {
        if (this.levelMenuClickHandler) {
            document.removeEventListener('click', this.levelMenuClickHandler);
            this.levelMenuClickHandler = null;
        }
    }
}
