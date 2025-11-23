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
        this.version = 0; // Track content version
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
        this.textarea.onkeydown = (e) => this.handleKeydown(e);
        
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
        
        this.initWorker();
        
        // Initial scan
        if (this.worker) {
            this.worker.postMessage({ text: this.content, version: this.version });
        }
    }

    initWorker() {
        const workerCode = `
            self.onmessage = function(e) {
                const { text, version, action } = e.data;
                
                if (action === 'format') {
                    try {
                        const parsed = JSON.parse(text);
                        const formatted = JSON.stringify(parsed, null, 2);
                        
                        // We need to rescan the formatted text
                        // Reuse the scan logic below by setting text = formatted
                        // But we need to send back the new text too
                        
                        self.postMessage({ 
                            formattedText: formatted,
                            version: version,
                            action: 'formatComplete'
                        });
                        
                        // Continue to scan the new text
                        // Recursive call or just fall through? 
                        // Let's just trigger a new message to self or handle it here.
                        // Simpler: Client handles the update and sends a new scan request.
                        return;
                    } catch (err) {
                        self.postMessage({ error: { message: err.message }, version, action: 'formatError' });
                        return;
                    }
                }

                const result = { error: null, offsets: null, count: 0, version };
                
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
            const { error, offsets, count, version, action, formattedText } = e.data;
            
            if (action === 'formatComplete') {
                if (version === this.version) {
                    this.content = formattedText;
                    this.textarea.value = this.content;
                    this.version++; // Invalidate old requests
                    this.worker.postMessage({ text: this.content, version: this.version });
                    Toast.show('Formatted JSON');
                }
                return;
            }
            
            if (action === 'formatError') {
                Toast.show('Invalid JSON: ' + error.message);
                return;
            }

            // Ignore outdated results
            if (version !== this.version) return;
            
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

    handleKeydown(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            
            // Use setRangeText for better performance than value concatenation
            // This also preserves undo history in some browsers, but not all.
            // execCommand is deprecated but 'insertText' is the only way to preserve undo stack reliably.
            
            try {
                // Try modern API first
                if (!document.execCommand('insertText', false, '  ')) {
                    // Fallback
                    const start = this.textarea.selectionStart;
                    const end = this.textarea.selectionEnd;
                    this.textarea.setRangeText('  ', start, end, 'end');
                    // Manually trigger input event since setRangeText doesn't fire it
                    this.handleInput(); 
                }
            } catch (err) {
                // Fallback for very old browsers or if execCommand fails
                const start = this.textarea.selectionStart;
                const end = this.textarea.selectionEnd;
                this.textarea.setRangeText('  ', start, end, 'end');
                this.handleInput();
            }
        }
    }

    handleInput() {
        // Show raw text immediately to prevent lag
        this.textarea.classList.add('dirty');
        this.code.style.display = 'none';

        // Debounce
        if (this.inputTimer) clearTimeout(this.inputTimer);
        
        // Increase debounce to 300ms to allow longer typing bursts without freeze
        this.inputTimer = setTimeout(() => {
            // Use requestIdleCallback to avoid blocking main thread if busy
            const update = () => {
                // This is the heavy operation (reading 100MB string)
                // We can't avoid reading it, but we can try to minimize impact.
                // Accessing .value forces a layout and string copy.
                this.content = this.textarea.value;
                this.version++; // Increment version
                if (this.worker) {
                    this.worker.postMessage({ text: this.content, version: this.version });
                }
            };
            
            if (window.requestIdleCallback) {
                requestIdleCallback(update, { timeout: 1000 });
            } else {
                setTimeout(update, 10);
            }
        }, 300);
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
        this.code.innerHTML = this.highlight(visibleText);

        // Inject error marker if visible
        if (this.error && this.error.pos !== -1) {
            const startOffset = this.lineOffsets[renderStartLine];
            // endOffset might be undefined if we are at the end
            const endOffset = (renderEndLine < this.lineOffsets.length) ? this.lineOffsets[renderEndLine] : this.content.length;
            
            if (this.error.pos >= startOffset && this.error.pos < endOffset) {
                // Find exact line within the visible range
                let errorLine = -1;
                for (let i = renderStartLine; i < renderEndLine; i++) {
                    const lineStart = this.lineOffsets[i];
                    const lineEnd = (i + 1 < this.lineOffsets.length) ? this.lineOffsets[i+1] : this.content.length;
                    
                    if (this.error.pos >= lineStart && this.error.pos < lineEnd) {
                        errorLine = i;
                        break;
                    }
                }
                
                if (errorLine !== -1) {
                    const lineStart = this.lineOffsets[errorLine];
                    const col = this.error.pos - lineStart;
                    
                    const marker = document.createElement('div');
                    marker.className = 'jv-error-wiggle';
                    // Position relative to the code block (which is shifted by topOffset)
                    // topOffset = (renderStartLine * lineHeight) - scrollTop
                    // We want the marker to be at (errorLine * lineHeight) - scrollTop
                    // Relative to code block: (errorLine - renderStartLine) * lineHeight
                    
                    marker.style.top = `${(errorLine - renderStartLine) * this.lineHeight}px`;
                    marker.style.left = `calc(1rem + ${col}ch)`; // 1rem padding + char offset
                    marker.title = this.error.message;
                    
                    this.code.appendChild(marker);
                }
            }
        }
        
        // Position the code block relative to the viewport
        // We subtract scrollTop because the 'pre' container is fixed to the viewport,
        // so we need to shift the content up to match the scroll position.
        const topOffset = (renderStartLine * this.lineHeight) - scrollTop;
        this.code.style.transform = `translateY(${topOffset}px)`;
    }

    highlight(json) {
        if (!json) return '';
        
        // Performance: If line is too long (e.g. minified JSON), truncate highlighting
        // to prevent regex engine from freezing the main thread.
        if (json.length > 20000) {
            return json.substring(0, 20000).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + 
                   '<span class="jv-token-null">... (highlighting disabled for long line)</span>';
        }

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
            // Use worker for formatting to avoid freezing UI
            if (this.worker) {
                Toast.show('Formatting...');
                this.worker.postMessage({ 
                    text: this.textarea.value, 
                    version: this.version,
                    action: 'format' 
                });
            } else {
                // Fallback
                const current = JSON.parse(this.textarea.value);
                this.content = JSON.stringify(current, null, 2);
                this.textarea.value = this.content;
                this.init(); // Re-scan
                Toast.show('Formatted JSON');
            }
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
