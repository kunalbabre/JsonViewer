import { Icons } from './Icons.js';
import { Toast } from './Toast.js';

export class EditorView {
    constructor(data, onUpdate) {
        this.data = data;
        this.onUpdate = onUpdate;
        this.content = JSON.stringify(data, null, 2);
        this.element = document.createElement('div');
        this.element.className = 'jv-editor-container';
        
        this.lineOffsets = null; // Will be Uint32Array
        this.lineHeight = 21; // Matches CSS
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
        this.textarea.setAttribute('autocomplete', 'off');
        this.textarea.setAttribute('autocorrect', 'off');
        this.textarea.setAttribute('autocapitalize', 'off');
        this.textarea.setAttribute('data-gramm', 'false'); // Disable Grammarly
        
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
        // We use fixed line height from CSS now, so measurement is less critical but good for verification
        // this.measureLineHeight(); 
        this.lineHeight = 21; // Hardcoded to match CSS for stability
        this.scanLines(this.content);
        this.initWorker();
        this.validate();
        this.updateVirtualWindow();
    }

    initWorker() {
        const workerCode = `
            self.onmessage = function(e) {
                const text = e.data;
                const result = { error: null, offsets: null, count: 0 };
                
                // 1. Scan Lines
                try {
                    const estimatedLines = Math.max(1000, Math.ceil(text.length / 40));
                    let offsets = new Uint32Array(estimatedLines);
                    let count = 0;
                    
                    offsets[count++] = 0;
                    let pos = -1;
                    
                    while ((pos = text.indexOf('\\n', pos + 1)) !== -1) {
                        if (count === offsets.length) {
                            const newOffsets = new Uint32Array(offsets.length * 2);
                            newOffsets.set(offsets);
                            offsets = newOffsets;
                        }
                        offsets[count++] = pos + 1;
                    }
                    
                    if (count === offsets.length) {
                        const newOffsets = new Uint32Array(offsets.length + 1);
                        newOffsets.set(offsets);
                        offsets = newOffsets;
                    }
                    offsets[count++] = text.length + 1;
                    
                    // Trim to exact size for transfer
                    result.offsets = offsets.slice(0, count);
                    result.count = count;
                } catch (err) {
                    console.error('Worker scan error', err);
                }

                // 2. Validate JSON
                try {
                    JSON.parse(text);
                } catch (e) {
                    const match = e.message.match(/at position (\\d+)/);
                    result.error = {
                        pos: match ? parseInt(match[1], 10) : -1,
                        message: e.message
                    };
                }
                
                // Transfer the buffer to avoid copy
                self.postMessage(result, [result.offsets.buffer]);
            };
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
        this.worker.onmessage = (e) => {
            const { error, offsets, count } = e.data;
            
            // Update state
            this.error = error;
            this.lineOffsets = offsets;
            this.lineCount = count;
            
            // Restore UI
            this.updateVirtualWindow();
            this.textarea.classList.remove('dirty');
            this.code.style.display = 'block';
        };
    }

    // Removed scanLines method as it is now in worker

    handleInput() {
        // Show raw text immediately to prevent lag
        this.textarea.classList.add('dirty');
        this.code.style.display = 'none';

        // Debounce
        if (this.inputTimer) clearTimeout(this.inputTimer);
        this.inputTimer = setTimeout(() => {
            this.content = this.textarea.value;
            if (this.worker) {
                this.worker.postMessage(this.content);
            }
        }, 150);
    }

    validate() {
        // No-op, handled in worker with scan
    }

    handleScroll() {
        // Sync horizontal scroll
        this.pre.scrollLeft = this.textarea.scrollLeft;
        
        // Virtualize vertical scroll
        requestAnimationFrame(() => this.updateVirtualWindow());
    }

    updateVirtualWindow() {
        if (!this.lineHeight || !this.lineOffsets || this.lineCount === 0) return;

        const scrollTop = this.textarea.scrollTop;
        const containerHeight = this.textarea.clientHeight;
        
        const startLine = Math.floor(scrollTop / this.lineHeight);
        const visibleLines = Math.ceil(containerHeight / this.lineHeight);
        
        // Buffer lines to prevent flickering
        const buffer = 5;
        const renderStartLine = Math.max(0, startLine - buffer);
        const renderEndLine = Math.min(this.lineCount - 1, startLine + visibleLines + buffer);
        
        const startIndex = this.lineOffsets[renderStartLine];
        const endIndex = this.lineOffsets[renderEndLine]; // Start of next line is end of this range

        // Slice the visible text
        // Note: endIndex might be undefined if we are at the very end
        const visibleText = this.content.substring(startIndex, endIndex !== undefined ? endIndex : this.content.length);
        
        // Highlight only the visible text
        let highlighted = this.highlight(visibleText);

        // Inject error marker if visible
        if (this.error && this.error.pos >= startIndex && (endIndex === undefined || this.error.pos < endIndex)) {
            // Calculate relative position in visible text
            const relativePos = this.error.pos - startIndex;
            
            // We need to find where to insert the marker in the HTML string
            // This is tricky because of HTML tags. 
            // Simplified approach: Just highlight the whole chunk around the error or use a simpler overlay.
            // Better approach: Find the text node at that position.
            // Since we are generating HTML string, we can try to inject it.
            
            // Let's try a simpler visual indicator for now:
            // If we can't easily inject into the highlighted HTML, we might just show a toast or line indicator.
            // But user asked for wiggle lines.
            
            // Hacky but effective: Split visible text, highlight parts, wrap error char.
            // But highlighting logic is regex based.
            
            // Alternative: Render error as a separate overlay? No, alignment issues.
            
            // Let's try to wrap the character at relativePos
            // We need to be careful not to break HTML tags from syntax highlighting.
            // Actually, `highlight` function returns HTML. 
            // Maybe we should apply error marker AFTER highlighting?
            // No, highlighting destroys original indices.
            
            // Let's apply error marker to the text BEFORE highlighting, but use a special token that highlight() ignores?
            // Or just wrap the character in a unique sequence, highlight, then replace sequence with span?
            
            const char = visibleText[relativePos] || ' ';
            const marker = `<span class="jv-error-marker" title="${this.error.message}">${char}</span>`;
            
            // We can't just replace char because highlight() expects valid JSON chars.
            // If we replace it with HTML, highlight() will escape it.
            
            // Strategy: 
            // 1. Highlight the text BEFORE the error.
            // 2. Highlight the error char (wrapped in marker).
            // 3. Highlight the text AFTER the error.
            
            const before = visibleText.substring(0, relativePos);
            const after = visibleText.substring(relativePos + 1);
            
            highlighted = this.highlight(before) + marker + this.highlight(after);
        }
        
        this.code.innerHTML = highlighted;
        
        // Position the code block relative to the viewport
        // We subtract scrollTop because the 'pre' container is fixed to the viewport,
        // so we need to shift the content up to match the scroll position.
        const topOffset = (renderStartLine * this.lineHeight) - scrollTop;
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
