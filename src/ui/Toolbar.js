import { Icons } from './Icons.js';

export class Toolbar {
    constructor({ onSearch, onSearchNext, onViewChange, onThemeToggle, onCopy, onExpandAll, onCollapseAll, onSave, currentView }) {
        this.element = document.createElement('div');
        this.element.className = 'jv-toolbar';

        // Logo
        const logo = document.createElement('div');
        logo.className = 'jv-logo';
        logo.textContent = 'JSON Viewer';
        this.element.appendChild(logo);

        // Controls Container
        const controls = document.createElement('div');
        controls.className = 'jv-controls';

        // Search
        const searchContainer = document.createElement('div');
        searchContainer.className = 'jv-search-container';

        const searchIcon = document.createElement('div');
        searchIcon.className = 'jv-search-icon';
        searchIcon.innerHTML = Icons.search;
        searchContainer.appendChild(searchIcon);

        const searchInput = document.createElement('input');
        searchInput.className = 'jv-search';
        searchInput.placeholder = 'Search...';

        // Instant search - no debounce
        searchInput.addEventListener('input', (e) => {
            onSearch(e.target.value);
        });

        // Handle Enter key to cycle through matches
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (onSearchNext) {
                    onSearchNext(e.shiftKey); // Shift+Enter goes backwards
                }
            }
        });

        searchContainer.appendChild(searchInput);

        // Match counter
        this.matchCounter = document.createElement('span');
        this.matchCounter.className = 'jv-match-counter';
        this.matchCounter.style.display = 'none';
        searchContainer.appendChild(this.matchCounter);

        controls.appendChild(searchContainer);

        // Separator
        this.createSeparator(controls);

        // View Toggles
        const views = ['tree', 'editor', 'schema', 'yaml', 'raw'];
        this.viewButtons = {};
        views.forEach(view => {
            const btn = document.createElement('button');
            btn.className = `jv-btn ${view === currentView ? 'active' : ''}`;
            const label = view === 'editor' ? 'Editor' : view.charAt(0).toUpperCase() + view.slice(1);
            btn.title = `${label} View`;
            btn.innerHTML = `${Icons[view] || Icons.tree} <span>${label}</span>`; // Fallback icon
            btn.onclick = () => onViewChange(view);
            this.viewButtons[view] = btn;
            controls.appendChild(btn);
        });

        // Separator
        this.createSeparator(controls);

        // Actions
        const themeBtn = this.createButton(Icons.theme, 'Theme', onThemeToggle, 'Theme');
        controls.appendChild(themeBtn);

        this.element.appendChild(controls);

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
