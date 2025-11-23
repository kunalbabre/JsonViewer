import { Icons } from './Icons.js';

export class Toolbar {
    constructor({ onSearch, onSearchNext, onViewChange, onThemeToggle, onCopy, onExpandAll, onCollapseAll, onSave, currentView }) {
        this.element = document.createElement('div');
        this.element.className = 'jv-toolbar-container';

        // --- Top Bar: Navigation & Title ---
        const topBar = document.createElement('div');
        topBar.className = 'jv-top-bar';

        // Left: View Switchers
        const nav = document.createElement('div');
        nav.className = 'jv-nav-group';
        
        const views = ['tree', 'editor', 'schema', 'yaml', 'raw'];
        this.viewButtons = {};
        views.forEach(view => {
            const btn = document.createElement('button');
            btn.className = `jv-nav-btn ${view === currentView ? 'active' : ''}`;
            const label = view === 'editor' ? 'Editor' : view.charAt(0).toUpperCase() + view.slice(1);
            btn.title = `${label} View`;
            btn.textContent = label;
            btn.onclick = () => onViewChange(view);
            this.viewButtons[view] = btn;
            nav.appendChild(btn);
        });
        topBar.appendChild(nav);

        // Right: Title & Theme
        const metaGroup = document.createElement('div');
        metaGroup.className = 'jv-meta-group';

        const logo = document.createElement('div');
        logo.className = 'jv-logo';
        logo.textContent = 'JSON Viewer';
        metaGroup.appendChild(logo);

        const themeBtn = this.createButton(Icons.theme, 'Toggle Theme', onThemeToggle);
        themeBtn.classList.add('jv-icon-only');
        metaGroup.appendChild(themeBtn);

        topBar.appendChild(metaGroup);
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
        searchInput.placeholder = 'Find in document...';
        searchInput.addEventListener('input', (e) => onSearch(e.target.value));
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (onSearchNext) onSearchNext(e.shiftKey);
            }
        });
        searchContainer.appendChild(searchInput);

        this.matchCounter = document.createElement('span');
        this.matchCounter.className = 'jv-match-counter';
        this.matchCounter.style.display = 'none';
        searchContainer.appendChild(this.matchCounter);

        actionBar.appendChild(searchContainer);

        // Right: Tools (Expand, Collapse, Copy, Save)
        const toolsGroup = document.createElement('div');
        toolsGroup.className = 'jv-tools-group';

        if (currentView === 'tree') {
            toolsGroup.appendChild(this.createButton(Icons.expand, 'Expand All', onExpandAll, 'Expand'));
            toolsGroup.appendChild(this.createButton(Icons.collapse, 'Collapse All', onCollapseAll, 'Collapse'));
            this.createSeparator(toolsGroup);
        }

        toolsGroup.appendChild(this.createButton(Icons.copy, 'Copy to Clipboard', onCopy, 'Copy'));
        toolsGroup.appendChild(this.createButton(Icons.save, 'Save to File', onSave, 'Save'));

        actionBar.appendChild(toolsGroup);
        this.element.appendChild(actionBar);
    }

    createButton(iconHtml, title, onClick, labelText = '') {
        const btn = document.createElement('button');
        btn.className = 'jv-btn';
        btn.title = title;
        if (labelText) {
            btn.innerHTML = `${iconHtml} <span>${labelText}</span>`;
        } else {
            btn.innerHTML = iconHtml;
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
        } else if (current === 0 && total === 0) {
            this.matchCounter.style.display = 'none';
        } else {
            this.matchCounter.textContent = 'No matches';
            this.matchCounter.style.display = 'block';
        }
    }
}
