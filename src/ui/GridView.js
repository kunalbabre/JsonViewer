export class GridView {
    constructor(data, searchQuery = '') {
        this.data = data;
        this.searchQuery = searchQuery.toLowerCase();
        this.element = document.createElement('div');
        this.element.className = 'jv-grid-container';
        this.render();
    }

    render() {
        if (!Array.isArray(this.data) || this.data.length === 0) {
            this.element.textContent = 'Grid view is only available for non-empty Arrays.';
            this.element.style.padding = '1rem';
            this.element.style.color = 'var(--null-color)';
            return;
        }

        // Collect all unique keys for columns
        const keys = new Set();
        // Sample first 100 items for column detection in large datasets
        const sampleSize = Math.min(100, this.data.length);
        for (let i = 0; i < sampleSize; i++) {
            const item = this.data[i];
            if (typeof item === 'object' && item !== null) {
                Object.keys(item).forEach(k => keys.add(k));
            } else {
                keys.add('Value');
            }
        }
        const columns = Array.from(keys);

        const table = document.createElement('table');
        table.className = 'jv-grid';

        // Header
        const thead = document.createElement('thead');
        const trHead = document.createElement('tr');
        columns.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col;

            // Highlight search match in column header
            if (this.searchQuery && col.toLowerCase().includes(this.searchQuery)) {
                th.style.backgroundColor = '#fef08a';
                th.style.color = '#000';
            }

            trHead.appendChild(th);
        });
        thead.appendChild(trHead);
        table.appendChild(thead);

        // Body - use progressive rendering for large datasets
        const tbody = document.createElement('tbody');
        table.appendChild(tbody);
        
        // For large arrays, render in batches
        const BATCH_SIZE = 50;
        let rowIndex = 0;

        const renderBatch = () => {
            const end = Math.min(rowIndex + BATCH_SIZE, this.data.length);
            
            for (; rowIndex < end; rowIndex++) {
                const item = this.data[rowIndex];
                const tr = document.createElement('tr');
                
                columns.forEach(col => {
                    const td = document.createElement('td');
                    let val;
                    if (typeof item === 'object' && item !== null) {
                        val = item[col];
                    } else if (col === 'Value') {
                        val = item;
                    }

                    if (typeof val === 'object' && val !== null) {
                        td.textContent = JSON.stringify(val).substring(0, 50) + '...';
                        td.style.color = 'var(--null-color)';
                    } else {
                        td.textContent = val !== undefined ? val : '';
                    }

                    // Highlight search match in cell value
                    if (this.searchQuery && td.textContent.toLowerCase().includes(this.searchQuery)) {
                        td.style.backgroundColor = '#fef08a';
                        td.style.color = '#000';
                    }

                    tr.appendChild(td);
                });
                
                tbody.appendChild(tr);
            }

            if (rowIndex < this.data.length) {
                // Show loading indicator
                if (rowIndex === BATCH_SIZE) {
                    const loadingRow = document.createElement('tr');
                    const loadingCell = document.createElement('td');
                    loadingCell.colSpan = columns.length;
                    loadingCell.textContent = `Loading... (${rowIndex} of ${this.data.length} rows)`;
                    loadingCell.style.textAlign = 'center';
                    loadingCell.style.padding = '1rem';
                    loadingCell.style.color = 'var(--null-color)';
                    loadingCell.className = 'jv-loading-row';
                    loadingRow.appendChild(loadingCell);
                    tbody.appendChild(loadingRow);
                }

                // Continue rendering
                requestAnimationFrame(() => {
                    // Remove loading indicator
                    const loadingRow = tbody.querySelector('.jv-loading-row');
                    if (loadingRow) {
                        loadingRow.remove();
                    }
                    renderBatch();
                });
            }
        };

        renderBatch();
        this.element.appendChild(table);
    }
}
