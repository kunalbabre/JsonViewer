import { Icons } from './Icons.js';
import { Toast } from './Toast.js';

export class EditorView {
    constructor(data, onUpdate) {
        this.data = data;
        this.onUpdate = onUpdate;
        this.content = JSON.stringify(data, null, 2);
        this.element = document.createElement('div');
        this.element.className = 'jv-editor-container';
        
        this.lineOffsets = [];
        this.lineHeight = 21; // Default estimate
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

        // Syntax highlighted editor structure (always used)
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
        
        // Event Listeners
        this.textarea.oninput = () => this.handleInput();
        this.textarea.onscroll = () => this.handleScroll();
        
        editorWrapper.appendChild(this.pre);
        editorWrapper.appendChild(this.textarea);
        this.element.appendChild(editorWrapper);

        // Initialize
        setTimeout(() => this.init(), 0);
    }

    init() {
        this.measureLineHeight();
        this.scanLines(this.content);
        this.updateVirtualWindow();
    }

    measureLineHeight() {
        const div = document.createElement('div');
        div.style.cssText = 'position:absolute;visibility:hidden;height:auto;width:auto;white-space:pre;font-family:var(--mono-font);font-size:0.9rem;line-height:1.5;padding:0;border:0;';
        div.textContent = 'M';
        this.element.appendChild(div);
        this.lineHeight = div.offsetHeight;
        this.element.removeChild(div);
    }

    scanLines(text) {
        this.lineOffsets = [0];
        let pos = -1;
        while ((pos = text.indexOf('\n', pos + 1)) !== -1) {
            this.lineOffsets.push(pos + 1);
        }
        this.lineOffsets.push(text.length + 1);
    }

    handleInput() {
        // Show raw text immediately to prevent lag
        this.textarea.classList.add('dirty');
        this.code.style.display = 'none';

        // Debounce the heavy lifting
        if (this.inputTimer) clearTimeout(this.inputTimer);
        this.inputTimer = setTimeout(() => {
            this.content = this.textarea.value;
            this.scanLines(this.content);
            this.updateVirtualWindow();
            
            // Restore highlighting
            this.textarea.classList.remove('dirty');
            this.code.style.display = 'block';
        }, 200);
    }

    handleScroll() {
        // Sync horizontal scroll
        this.pre.scrollLeft = this.textarea.scrollLeft;
        
        // Virtualize vertical scroll
        requestAnimationFrame(() => this.updateVirtualWindow());
    }

    updateVirtualWindow() {
        if (!this.lineHeight || this.lineOffsets.length === 0) return;

        const scrollTop = this.textarea.scrollTop;
        const containerHeight = this.textarea.clientHeight;
        
        const startLine = Math.floor(scrollTop / this.lineHeight);
        const visibleLines = Math.ceil(containerHeight / this.lineHeight);
        
        // Buffer lines to prevent flickering
        const buffer = 5;
        const renderStartLine = Math.max(0, startLine - buffer);
        const renderEndLine = Math.min(this.lineOffsets.length - 1, startLine + visibleLines + buffer);
        
        const startIndex = this.lineOffsets[renderStartLine];
        const endIndex = this.lineOffsets[renderEndLine]; // Start of next line is end of this range

        // Slice the visible text
        // Note: endIndex might be undefined if we are at the very end
        const visibleText = this.content.substring(startIndex, endIndex !== undefined ? endIndex : this.content.length);
        
        // Highlight only the visible text
        this.code.innerHTML = this.highlight(visibleText);
        
        // Position the code block
        const topOffset = renderStartLine * this.lineHeight;
        this.code.style.transform = `translateY(${topOffset}px)`;
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
            this.content = JSON.stringify(current, null, 2);
            this.textarea.value = this.content;
            this.scanLines(this.content);
            this.updateVirtualWindow();
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
