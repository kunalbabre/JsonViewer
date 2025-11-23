import { Icons } from './Icons.js';
import { Toast } from './Toast.js';

export class EditorView {
    constructor(data, onUpdate) {
        this.data = data;
        this.onUpdate = onUpdate;
        this.content = JSON.stringify(data, null, 2);
        this.element = document.createElement('div');
        this.element.className = 'jv-editor-container';
        
        // Check file size for performance
        this.isLargeFile = this.content.length > 500000; // 500KB threshold for syntax highlighting
        
        this.render();
    }

    render() {
        // Toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'jv-schema-toolbar';

        const formatBtn = document.createElement('button');
        formatBtn.className = 'jv-btn';
        formatBtn.innerHTML = `${Icons.format} <span>Format</span>`;
        formatBtn.onclick = () => this.format();
        toolbar.appendChild(formatBtn);

        const applyBtn = document.createElement('button');
        applyBtn.className = 'jv-btn';
        applyBtn.innerHTML = `${Icons.save} <span>Apply Changes</span>`;
        applyBtn.onclick = () => this.applyChanges();
        toolbar.appendChild(applyBtn);

        this.element.appendChild(toolbar);

        // Editor Area
        const editorWrapper = document.createElement('div');
        editorWrapper.className = 'jv-editor-wrapper';

        if (this.isLargeFile) {
            // Plain textarea for large files
            this.textarea = document.createElement('textarea');
            this.textarea.className = 'jv-raw'; // Reuse raw style
            this.textarea.value = this.content;
            this.textarea.spellcheck = false;
            editorWrapper.appendChild(this.textarea);
            
            const warning = document.createElement('div');
            warning.className = 'jv-editor-warning';
            warning.textContent = 'Syntax highlighting disabled for large file performance.';
            this.element.appendChild(warning);
        } else {
            // Syntax highlighted editor
            this.pre = document.createElement('pre');
            this.pre.className = 'jv-editor-pre';
            this.pre.ariaHidden = 'true';
            
            this.code = document.createElement('code');
            this.code.className = 'jv-editor-code';
            this.pre.appendChild(this.code);

            this.textarea = document.createElement('textarea');
            this.textarea.className = 'jv-editor-textarea';
            this.textarea.value = this.content;
            this.textarea.spellcheck = false;
            this.textarea.oninput = () => this.updateHighlighting();
            this.textarea.onscroll = () => this.syncScroll();
            
            // Initial highlight
            this.updateHighlighting();

            editorWrapper.appendChild(this.pre);
            editorWrapper.appendChild(this.textarea);
        }

        this.element.appendChild(editorWrapper);
    }

    updateHighlighting() {
        const text = this.textarea.value;
        // Simple JSON syntax highlighter
        this.code.innerHTML = this.highlight(text);
    }

    syncScroll() {
        this.pre.scrollTop = this.textarea.scrollTop;
        this.pre.scrollLeft = this.textarea.scrollLeft;
    }

    highlight(json) {
        if (!json) return '';
        // Escape HTML
        json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
            let cls = 'number';
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'key';
                } else {
                    cls = 'string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'boolean';
            } else if (/null/.test(match)) {
                cls = 'null';
            }
            return '<span class="jv-token-' + cls + '">' + match + '</span>';
        });
    }

    format() {
        try {
            const current = JSON.parse(this.textarea.value);
            this.textarea.value = JSON.stringify(current, null, 2);
            if (!this.isLargeFile) {
                this.updateHighlighting();
            }
            Toast.show('Formatted JSON');
        } catch (e) {
            Toast.show('Invalid JSON: ' + e.message);
        }
    }

    applyChanges() {
        try {
            const newData = JSON.parse(this.textarea.value);
            if (this.onUpdate) {
                this.onUpdate(newData);
            }
            Toast.show('Changes applied successfully');
        } catch (e) {
            Toast.show('Cannot apply: Invalid JSON');
        }
    }
}
