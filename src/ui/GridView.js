export class GridView {
    constructor(data, searchQuery = '') {
        this.data = data;
        this.searchQuery = searchQuery.toLowerCase();
        this.element = document.createElement('div');
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
        this.data.forEach(item => {
            if (typeof item === 'object' && item !== null) {
                Object.keys(item).forEach(k => keys.add(k));
            } else {
                keys.add('Value');
            }
        });
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

        // Body
        const tbody = document.createElement('tbody');
        this.data.forEach(item => {
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
        });
        table.appendChild(tbody);

        this.element.appendChild(table);
    }
}
