import { Icons } from './Icons.js';
import { Toast } from './Toast.js';

export class EditorView {
    constructor(data, onUpdate) {
        this.data = data;
        this.onUpdate = onUpdate;
        this.content = ''; // Load async
        this.element = document.createElement('div');
        this.element.className = 'jv-editor-container';
        
        this.lineOffsets = null; // Will be Uint32Array
        this.lineHeight = 21; // Matches CSS
        this.version = 0; // Track content version
        this.isLoading = true;
        this.pendingRequests = new Map(); // Track pending content
        this.render();
    }

    render() {
        // Editor Area
        const editorWrapper = document.createElement('div');
        editorWrapper.className = 'jv-editor-wrapper';

        // Gutter
        this.gutter = document.createElement('div');
        this.gutter.className = 'jv-editor-gutter';
        this.gutterContent = document.createElement('div');
        this.gutterContent.className = 'jv-gutter-content';
        this.gutter.appendChild(this.gutterContent);
        editorWrapper.appendChild(this.gutter);

        // Scroller
        this.scroller = document.createElement('div');
        this.scroller.className = 'jv-editor-scroller';
        editorWrapper.appendChild(this.scroller);

        // Loading State
        this.loader = document.createElement('div');
        this.loader.className = 'jv-editor-loader';
        this.loader.innerHTML = `
            <div class="jv-spinner"></div>
            <div>Loading Editor...</div>
        `;
        this.loader.style.cssText = `
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: var(--bg-color);
            z-index: 10;
            color: var(--text-color);
            gap: 1rem;
        `;
        this.scroller.appendChild(this.loader);

        // Active Line Highlight
        this.activeLine = document.createElement('div');
        this.activeLine.className = 'jv-active-line';
        this.scroller.appendChild(this.activeLine);

        const fontStack = "'SF Mono', Monaco, Menlo, Consolas, 'Ubuntu Mono', 'Liberation Mono', 'DejaVu Sans Mono', 'Courier New', monospace";

        // Syntax highlighted editor structure (always used)
        this.pre = document.createElement('pre');
        this.pre.className = 'jv-editor-pre';
        this.pre.ariaHidden = 'true';
        
        this.code = document.createElement('code');
        this.code.className = 'jv-editor-code';
        // Force font style inline
        this.code.style.fontFamily = fontStack;
        this.code.style.fontSize = "14px";
        this.code.style.lineHeight = "21px";
        this.code.style.letterSpacing = "0px";
        this.code.style.fontWeight = "400";
        
        this.pre.appendChild(this.code);

        this.textarea = document.createElement('textarea');
        this.textarea.className = 'jv-editor-textarea';
        this.textarea.value = this.content;
        this.textarea.spellcheck = false;
        this.textarea.setAttribute('autocomplete', 'off');
        this.textarea.setAttribute('autocorrect', 'off');
        this.textarea.setAttribute('autocapitalize', 'off');
        this.textarea.setAttribute('data-gramm', 'false'); // Disable Grammarly
        
        // Force font style inline to be absolutely sure
        this.textarea.style.fontFamily = fontStack;
        this.textarea.style.fontSize = "14px";
        this.textarea.style.lineHeight = "21px";
        this.textarea.style.letterSpacing = "0px";
        this.textarea.style.fontWeight = "400";
        
        // Event Listeners
        this.textarea.oninput = () => this.handleInput();
        this.textarea.onscroll = () => this.handleScroll();
        this.textarea.onkeydown = (e) => this.handleKeydown(e);
        this.textarea.onclick = () => this.updateActiveLine();
        this.textarea.onkeyup = () => this.updateActiveLine();
        
        this.scroller.appendChild(this.pre);
        this.scroller.appendChild(this.textarea);
        this.element.appendChild(editorWrapper);

        // Status Bar
        this.statusBar = document.createElement('div');
        this.statusBar.className = 'jv-editor-statusbar';
        this.statusBar.innerHTML = 'Ln 1, Col 1';
        this.element.appendChild(this.statusBar);

        // Initialize
        setTimeout(() => this.init(), 0);
    }

    init() {
        // We use fixed line height from CSS now, so measurement is less critical but good for verification
        // this.measureLineHeight(); 
        this.lineHeight = 21; // Hardcoded to match CSS for stability
        
        this.initWorker();
        
        // Initial load
        if (this.worker) {
            this.worker.postMessage({ 
                data: this.data, 
                version: this.version,
                action: 'stringify' 
            });
        }
    }

    initWorker() {
        const workerCode = `
            self.onmessage = function(e) {
                const { text, data, version, action } = e.data;
                
                if (action === 'stringify') {
                    try {
                        const stringified = JSON.stringify(data, null, 2);
                        self.postMessage({ 
                            text: stringified,
                            version: version,
                            action: 'stringifyComplete'
                        });
                        // Continue to scan immediately
                        scan(stringified, version);
                        return;
                    } catch (err) {
                        self.postMessage({ error: { message: err.message }, version, action: 'error' });
                        return;
                    }
                }

                if (action === 'format') {
                    try {
                        const parsed = JSON.parse(text);
                        const formatted = JSON.stringify(parsed, null, 2);
                        
                        self.postMessage({ 
                            formattedText: formatted,
                            version: version,
                            action: 'formatComplete'
                        });
                        
                        // Continue to scan
                        scan(formatted, version);
                        return;
                    } catch (err) {
                        self.postMessage({ error: { message: err.message }, version, action: 'formatError' });
                        return;
                    }
                }

                // Default action: scan
                if (text) {
                    scan(text, version);
                }
            };

            function scan(text, version) {
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
            }
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
        this.worker.onmessage = (e) => {
            const { error, offsets, count, version, action, formattedText, text } = e.data;
            
            if (action === 'stringifyComplete') {
                if (version === this.version) {
                    this.content = text;
                    this.textarea.value = this.content;
                    this.loader.style.display = 'none';
                    this.isLoading = false;
                    // Scan results will follow in next message
                }
                return;
            }

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
            
            if (action === 'formatError' || action === 'error') {
                Toast.show('Error: ' + (error ? error.message : 'Unknown error'));
                this.loader.style.display = 'none';
                return;
            }

            // Ignore outdated results
            if (version !== this.version) return;
            
            // Retrieve the text content associated with this version
            if (this.pendingRequests.has(version)) {
                this.content = this.pendingRequests.get(version);
                this.pendingRequests.delete(version);
            }
            
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
            const start = this.textarea.selectionStart;
            const end = this.textarea.selectionEnd;
            const value = this.textarea.value;

            if (e.shiftKey) {
                // Shift+Tab: Unindent
                let lineStart = value.lastIndexOf('\n', start - 1) + 1;
                let lineEnd = value.indexOf('\n', end);
                if (lineEnd === -1) lineEnd = value.length;

                const text = value.substring(lineStart, lineEnd);
                const lines = text.split('\n');
                let modified = false;
                
                const newLines = lines.map(line => {
                    if (line.startsWith('  ')) {
                        modified = true;
                        return line.substring(2);
                    } else if (line.startsWith('\t')) {
                        modified = true;
                        return line.substring(1);
                    } else if (line.startsWith(' ')) {
                         modified = true;
                         return line.substring(1);
                    }
                    return line;
                });

                if (modified) {
                    const newText = newLines.join('\n');
                    this.textarea.setRangeText(newText, lineStart, lineEnd, 'select');
                    this.handleInput();
                }
            } else {
                // Tab
                if (start !== end && value.substring(start, end).includes('\n')) {
                    // Multi-line selection: Indent
                    let lineStart = value.lastIndexOf('\n', start - 1) + 1;
                    let lineEnd = value.indexOf('\n', end);
                    if (lineEnd === -1) lineEnd = value.length;

                    const text = value.substring(lineStart, lineEnd);
                    const lines = text.split('\n');
                    const newLines = lines.map(line => '  ' + line);
                    const newText = newLines.join('\n');
                    
                    this.textarea.setRangeText(newText, lineStart, lineEnd, 'select');
                    this.handleInput();
                } else {
                    // Single cursor or selection within line: Insert spaces
                    try {
                        if (!document.execCommand('insertText', false, '  ')) {
                            this.textarea.setRangeText('  ', start, end, 'end');
                            this.handleInput(); 
                        }
                    } catch (err) {
                        this.textarea.setRangeText('  ', start, end, 'end');
                        this.handleInput();
                    }
                }
            }
        }
    }

    handleInput() {
        // Update active line first so virtual window can render gutter correctly
        this.updateActiveLine();
        
        // Optimistic update: Render the visible part immediately using the live value
        // This prevents the "flash" of raw text and makes typing feel instant.
        this.updateVirtualWindow(this.textarea.value);

        // Debounce the heavy worker sync
        if (this.inputTimer) clearTimeout(this.inputTimer);
        
        this.inputTimer = setTimeout(() => {
            const update = () => {
                const text = this.textarea.value;
                this.version++;
                
                // Store the text we are sending so we can retrieve it when worker returns
                this.pendingRequests.set(this.version, text);
                
                if (this.worker) {
                    this.worker.postMessage({ text: text, version: this.version });
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
        requestAnimationFrame(() => {
            this.updateVirtualWindow();
            this.updateActiveLine();
        });
    }

    updateActiveLine() {
        if (!this.lineOffsets || !this.lineHeight) return;

        const cursor = this.textarea.selectionStart;
        
        // Binary search for line number
        let low = 0, high = this.lineCount - 1;
        let line = 0;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (this.lineOffsets[mid] <= cursor) {
                line = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        // Update active line visual
        // We need to position the active line highlight relative to the scroller content
        // But since we are virtualized, we can just position it absolutely in the scroller
        // The scroller has the full height? No, the scroller is the viewport.
        // The textarea has the full height.
        // The activeLine element is inside scroller (viewport).
        // So we need to position it relative to the viewport (scrollTop).
        
        const scrollTop = this.textarea.scrollTop;
        const top = (line * this.lineHeight) - scrollTop;
        
        this.activeLine.style.transform = `translateY(${top}px)`;
        
        // Also highlight the line number in the gutter
        // We need to find the line number element in the gutter content
        // But gutter content is re-rendered in updateVirtualWindow.
        // So we can just set a property and let updateVirtualWindow handle it, 
        // or manually update class if element exists.
        
        this.currentActiveLine = line;
        
        // Update Status Bar
        const col = cursor - this.lineOffsets[line] + 1;
        if (this.statusBar) {
            this.statusBar.textContent = `Ln ${line + 1}, Col ${col}`;
        }

        // Update gutter classes
        const gutterLines = this.gutterContent.children;
        for (let i = 0; i < gutterLines.length; i++) {
            const el = gutterLines[i];
            const l = parseInt(el.dataset.line);
            if (l === line) el.classList.add('active');
            else el.classList.remove('active');
        }
    }

    updateVirtualWindow(liveContent = null) {
        if (!this.lineHeight || !this.lineOffsets || this.lineCount === 0) return;

        const content = liveContent !== null ? liveContent : this.content;
        const isDirty = liveContent !== null;

        const scrollTop = this.textarea.scrollTop;
        const containerHeight = this.textarea.clientHeight;
        
        const startLine = Math.floor(scrollTop / this.lineHeight);
        const visibleLines = Math.ceil(containerHeight / this.lineHeight);
        
        // Buffer lines to prevent flickering
        const buffer = 5;
        const renderStartLine = Math.max(0, startLine - buffer);
        const renderEndLine = Math.min(this.lineCount - 1, startLine + visibleLines + buffer);
        
        let startIndex = this.lineOffsets[renderStartLine];
        let endIndex = this.lineOffsets[renderEndLine]; // Start of next line is end of this range

        // If we are in dirty mode (user typing), we need to adjust offsets
        // because this.lineOffsets corresponds to this.content, not liveContent.
        if (isDirty) {
            const delta = content.length - this.content.length;
            const cursor = this.textarea.selectionStart;
            
            // Shift offsets if they are after the edit position
            if (startIndex > cursor) startIndex += delta;
            if (endIndex !== undefined && endIndex > cursor) endIndex += delta;
        }

        // Slice the visible text
        // Note: endIndex might be undefined if we are at the very end
        const visibleText = content.substring(startIndex, endIndex !== undefined ? endIndex : content.length);
        
        // Highlight only the visible text
        this.code.innerHTML = this.highlight(visibleText);

        // Render Gutter
        let gutterHtml = '';
        for (let i = renderStartLine; i < renderEndLine; i++) {
            const isActive = i === this.currentActiveLine ? ' active' : '';
            gutterHtml += `<div class="jv-line-number${isActive}" data-line="${i}">${i + 1}</div>`;
        }
        this.gutterContent.innerHTML = gutterHtml;

        // Inject error marker if visible (only if not dirty, to avoid misalignment)
        if (!isDirty && this.error && this.error.pos !== -1) {
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
        const leftOffset = -this.textarea.scrollLeft;
        
        // Sync width to enable native scrolling behavior
        this.code.style.width = `${Math.max(this.textarea.scrollWidth, this.textarea.clientWidth)}px`;
        
        // Use translate for both X and Y to ensure perfect sync
        this.code.style.transform = `translate(${leftOffset}px, ${topOffset}px)`;
        this.gutterContent.style.transform = `translateY(${topOffset}px)`;
        
        // Update active line position as well since scrollTop changed
        if (this.currentActiveLine !== undefined) {
             const activeTop = (this.currentActiveLine * this.lineHeight) - scrollTop;
             this.activeLine.style.transform = `translateY(${activeTop}px)`;
        }
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
                
                // Attempt to restore worker if missing, but don't reset content
                if (!this.worker) {
                    this.initWorker();
                }
                
                if (this.worker) {
                    this.version++;
                    this.worker.postMessage({ text: this.content, version: this.version });
                }
                
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
