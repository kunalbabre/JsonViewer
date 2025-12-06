import { Icons } from './Icons.js';
import { Toast } from './Toast.js';

export class EditorView {
    constructor(data, onUpdate, options = {}) {
        this.data = data;
        this.onUpdate = onUpdate;
        this.options = options;
        this.mode = options.mode || 'json'; // 'json' or 'yaml'
        this.content = ''; // Load async
        this.element = document.createElement('div');
        this.element.className = 'jv-editor-container';
        
        this.lineOffsets = null; // Will be Uint32Array
        this.lineHeight = 21; // Matches CSS
        this.version = 0; // Track content version
        this.isLoading = true;
        this.pendingRequests = new Map(); // Track pending content
        this.foldedLines = new Set(); // Track folded line numbers
        this.foldRegions = new Map(); // Map of start line -> end line for fold regions
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
        
        // Search Highlight Layer (behind code)
        this.searchLayer = document.createElement('div');
        this.searchLayer.className = 'jv-editor-search-layer';
        this.searchLayer.style.position = 'absolute';
        this.searchLayer.style.top = '0';
        this.searchLayer.style.left = '0';
        this.searchLayer.style.pointerEvents = 'none';
        this.searchLayer.style.fontFamily = fontStack;
        this.searchLayer.style.fontSize = "14px";
        this.searchLayer.style.lineHeight = "21px";
        
        this.pre.appendChild(this.searchLayer);
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
        
        // Bracket Highlight Layer
        this.bracketLayer = document.createElement('div');
        this.bracketLayer.className = 'jv-editor-bracket-layer';
        this.bracketLayer.style.cssText = 'position:absolute;top:0;left:10px;pointer-events:none;z-index:5;';
        this.pre.appendChild(this.bracketLayer);

        // Event Listeners
        this.textarea.oninput = () => this.handleInput();
        this.textarea.onscroll = () => this.handleScroll();
        this.textarea.onkeydown = (e) => this.handleKeydown(e);
        this.textarea.onclick = () => { this.updateActiveLine(); this.updateBracketMatch(); };
        this.textarea.onkeyup = () => { this.updateActiveLine(); this.updateBracketMatch(); };
        
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
            if (this.options.isRaw) {
                this.content = typeof this.data === 'string' ? this.data : String(this.data);
                this.textarea.value = this.content;
                this.loader.style.display = 'none';
                this.isLoading = false;
                
                // Raw mode: Show textarea content directly, hide syntax highlighting and gutter
                this.textarea.style.color = 'var(--text-color)';
                this.pre.style.display = 'none';
                this.gutter.style.display = 'none';
                // Adjust layout since gutter is gone
                this.scroller.style.paddingLeft = '0';
                
            } else if (this.mode === 'yaml' && typeof this.data === 'string') {
                // YAML mode with string data - no need to stringify
                this.content = this.data;
                this.textarea.value = this.content;
                this.worker.postMessage({ 
                    text: this.content, 
                    version: this.version,
                    action: 'scan' 
                });
            } else {
                this.worker.postMessage({ 
                    data: this.data, 
                    version: this.version,
                    action: 'stringify' 
                });
            }
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

                // Explicit scan action or default
                if (action === 'scan' || text) {
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
            
            // Hide loader and restore UI
            this.loader.style.display = 'none';
            this.isLoading = false;
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
        if (this.options.isRaw) {
            this.content = this.textarea.value;
            return;
        }

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
            this.updateBracketMatch();
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

    setSearchMatches(matches) {
        this.searchMatches = matches || [];
        this.updateVirtualWindow();
    }

    // Bracket Matching - finds matching bracket and highlights both
    updateBracketMatch() {
        if (!this.bracketLayer || !this.lineOffsets || this.options.isRaw) return;
        this.bracketLayer.innerHTML = '';

        const text = this.textarea.value;
        const cursor = this.textarea.selectionStart;
        if (cursor >= text.length) return;

        const brackets = { '{': '}', '[': ']', '}': '{', ']': '[' };
        const openBrackets = ['{', '['];
        const closeBrackets = ['}', ']'];

        // Check character at cursor and before cursor
        let bracketPos = -1;
        let bracketChar = '';
        
        if (brackets[text[cursor]]) {
            bracketPos = cursor;
            bracketChar = text[cursor];
        } else if (cursor > 0 && brackets[text[cursor - 1]]) {
            bracketPos = cursor - 1;
            bracketChar = text[cursor - 1];
        }

        if (bracketPos === -1) return;

        // Find matching bracket
        let matchPos = -1;
        const isOpen = openBrackets.includes(bracketChar);
        const target = brackets[bracketChar];
        let depth = 0;

        if (isOpen) {
            // Search forward
            for (let i = bracketPos; i < text.length; i++) {
                if (text[i] === bracketChar) depth++;
                else if (text[i] === target) {
                    depth--;
                    if (depth === 0) { matchPos = i; break; }
                }
            }
        } else {
            // Search backward
            for (let i = bracketPos; i >= 0; i--) {
                if (text[i] === bracketChar) depth++;
                else if (text[i] === target) {
                    depth--;
                    if (depth === 0) { matchPos = i; break; }
                }
            }
        }

        if (matchPos === -1) {
            // No match found - highlight bracket in red
            this.highlightBracket(bracketPos, true);
        } else {
            // Highlight both brackets
            this.highlightBracket(bracketPos, false);
            this.highlightBracket(matchPos, false);
        }
    }

    highlightBracket(pos, isError) {
        if (!this.lineOffsets) return;
        
        // Find line and column for this position
        let line = 0;
        for (let i = 0; i < this.lineCount; i++) {
            if (this.lineOffsets[i] > pos) break;
            line = i;
        }
        const col = pos - this.lineOffsets[line];
        
        // Measure actual character width if not cached
        if (!this.charWidth) {
            const measureSpan = document.createElement('span');
            measureSpan.style.cssText = `
                font-family: 'SF Mono', Monaco, Menlo, Consolas, 'Ubuntu Mono', 'Liberation Mono', 'DejaVu Sans Mono', 'Courier New', monospace;
                font-size: 14px;
                line-height: 21px;
                position: absolute;
                visibility: hidden;
                white-space: pre;
            `;
            measureSpan.textContent = 'XXXXXXXXXX'; // Measure 10 chars for accuracy
            document.body.appendChild(measureSpan);
            this.charWidth = measureSpan.getBoundingClientRect().width / 10;
            document.body.removeChild(measureSpan);
        }
        
        // Calculate visual position relative to the scroller
        const scrollTop = this.textarea.scrollTop;
        const scrollLeft = this.textarea.scrollLeft;
        const top = (line * this.lineHeight) - scrollTop;
        const left = (col * this.charWidth) - scrollLeft;
        
        // Skip if bracket is outside visible area
        if (top < -this.lineHeight || top > this.scroller.clientHeight) return;
        
        // Create highlight element
        const highlight = document.createElement('span');
        highlight.className = isError ? 'jv-bracket-error' : 'jv-bracket-match';
        highlight.style.cssText = `
            position: absolute;
            top: ${top}px;
            left: ${left}px;
            width: ${this.charWidth + 1}px;
            height: ${this.lineHeight}px;
            pointer-events: none;
            box-sizing: border-box;
        `;
        this.bracketLayer.appendChild(highlight);
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

        // Render Search Highlights
        this.renderSearchHighlights(renderStartLine, renderEndLine, startIndex);

        // Render Gutter (line numbers only - folding not supported in textarea editor)
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
        this.searchLayer.style.transform = `translate(${leftOffset}px, ${topOffset}px)`;
        this.gutterContent.style.transform = `translateY(${topOffset}px)`;
        
        // Update active line position as well since scrollTop changed
        if (this.currentActiveLine !== undefined) {
             const activeTop = (this.currentActiveLine * this.lineHeight) - scrollTop;
             this.activeLine.style.transform = `translateY(${activeTop}px)`;
        }
    }

    renderSearchHighlights(startLine, endLine, startOffset) {
        this.searchLayer.innerHTML = '';
        if (!this.searchMatches || this.searchMatches.length === 0) return;

        // Binary search for the first match that might be visible
        let low = 0, high = this.searchMatches.length - 1;
        let firstMatchIndex = -1;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (this.searchMatches[mid].end > startOffset) {
                firstMatchIndex = mid;
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }

        if (firstMatchIndex === -1) return;

        // Iterate through matches until we go past the visible area
        const endOffset = (endLine < this.lineOffsets.length) ? this.lineOffsets[endLine] : this.content.length;

        for (let i = firstMatchIndex; i < this.searchMatches.length; i++) {
            const match = this.searchMatches[i];
            if (match.start >= endOffset) break;

            // Calculate position
            // We need to find which line this match belongs to
            // Since we are iterating matches, and we know the range of lines,
            // we can find the line for each match.
            // Optimization: Keep track of current line index
            
            let lineIdx = startLine;
            // Find line that contains match.start
            // Since matches are ordered, and lines are ordered, we can just advance lineIdx
            while (lineIdx < endLine && (lineIdx + 1 < this.lineOffsets.length ? this.lineOffsets[lineIdx + 1] : Infinity) <= match.start) {
                lineIdx++;
            }

            if (lineIdx >= endLine) continue;

            const lineStart = this.lineOffsets[lineIdx];
            const col = match.start - lineStart;
            const row = lineIdx - startLine; // Relative to the transformed layer

            const el = document.createElement('div');
            el.className = 'jv-search-highlight';
            if (match.isCurrent) el.classList.add('current');
            
            el.style.position = 'absolute';
            el.style.left = `calc(1rem + ${col}ch)`; // 1rem padding
            el.style.top = `${row * this.lineHeight}px`;
            el.style.width = `${match.end - match.start}ch`;
            el.style.height = `${this.lineHeight}px`;
            el.style.backgroundColor = match.isCurrent ? '#f59e0b' : '#fef08a';
            el.style.opacity = '0.5';
            el.style.zIndex = '-1'; // Behind text

            this.searchLayer.appendChild(el);
        }
    }

    highlight(text) {
        if (!text) return '';
        
        // Performance: If line is too long, truncate highlighting
        if (text.length > 20000) {
            return text.substring(0, 20000).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + 
                   '<span class="jv-token-null">... (highlighting disabled for long line)</span>';
        }

        // Escape HTML
        text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        if (this.mode === 'yaml') {
            return this.highlightYaml(text);
        }
        
        // JSON highlighting
        return text.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
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
    
    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
    
    highlightYaml(text) {
        // Process line by line for YAML
        return text.split('\n').map(line => {
            // Comments (full line)
            if (/^\s*#/.test(line)) {
                return '<span class="jv-token-comment">' + this.escapeHtml(line) + '</span>';
            }
            
            // Handle array item prefix: "- key: value" or "- value"
            const arrayMatch = line.match(/^(\s*-\s+)(.*)$/);
            if (arrayMatch) {
                const prefix = arrayMatch[1];
                const rest = arrayMatch[2];
                const highlightedPrefix = prefix.replace('-', '<span class="jv-token-bracket">-</span>');
                const highlightedRest = this.highlightYamlKeyValue(rest);
                return highlightedPrefix + highlightedRest;
            }
            
            // Regular key: value line
            return this.highlightYamlKeyValue(line);
        }).join('\n');
    }
    
    highlightYamlKeyValue(line) {
        // Match "key: value" pattern - key can contain letters, numbers, underscores, hyphens
        const kvMatch = line.match(/^(\s*)([a-zA-Z_][a-zA-Z0-9_-]*)(:\s*)(.*)$/);
        if (kvMatch) {
            const indent = kvMatch[1];
            const key = kvMatch[2];
            const colon = kvMatch[3];
            const value = kvMatch[4];
            const highlightedValue = this.highlightYamlValue(value);
            return indent + '<span class="jv-token-key">' + this.escapeHtml(key) + '</span>' + colon + highlightedValue;
        }
        
        // Just a value (standalone in arrays) or unchanged line
        if (line.trim()) {
            return this.highlightYamlValue(line);
        }
        return this.escapeHtml(line);
    }
    
    highlightYamlValue(value) {
        if (!value) return value;
        
        const trimmed = value.trim();
        if (!trimmed) return value;
        
        // Preserve leading whitespace
        const leadingSpace = value.match(/^(\s*)/)[1];
        const content = value.substring(leadingSpace.length);
        const escapedContent = this.escapeHtml(content);
        
        // Quoted string
        if (/^(['"]).*\1$/.test(trimmed)) {
            return leadingSpace + '<span class="jv-token-string">' + escapedContent + '</span>';
        }
        // Boolean
        if (/^(true|false)$/i.test(trimmed)) {
            return leadingSpace + '<span class="jv-token-boolean">' + escapedContent + '</span>';
        }
        // Null
        if (/^(null|~)$/i.test(trimmed)) {
            return leadingSpace + '<span class="jv-token-null">' + escapedContent + '</span>';
        }
        // Number (integer or decimal)
        if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
            return leadingSpace + '<span class="jv-token-number">' + escapedContent + '</span>';
        }
        // Inline comment
        if (trimmed.startsWith('#')) {
            return leadingSpace + '<span class="jv-token-comment">' + escapedContent + '</span>';
        }
        // Unquoted string value
        return leadingSpace + '<span class="jv-token-string">' + escapedContent + '</span>';
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

    // Find the matching closing bracket line for a given opening line
    findFoldEnd(startLine) {
        const content = this.textarea.value;
        const lineStart = this.lineOffsets[startLine];
        const lineEnd = (startLine + 1 < this.lineOffsets.length) ? this.lineOffsets[startLine + 1] - 1 : content.length;
        const lineText = content.substring(lineStart, lineEnd);
        
        // Find the opening bracket
        const trimmed = lineText.trimEnd();
        const openChar = trimmed.endsWith('{') ? '{' : trimmed.endsWith('[') ? '[' : null;
        if (!openChar) return startLine;
        
        const closeChar = openChar === '{' ? '}' : ']';
        let depth = 0;
        
        // Scan from start line to find matching close
        for (let i = startLine; i < this.lineCount; i++) {
            const lStart = this.lineOffsets[i];
            const lEnd = (i + 1 < this.lineOffsets.length) ? this.lineOffsets[i + 1] : content.length;
            const text = content.substring(lStart, lEnd);
            
            for (const char of text) {
                if (char === openChar) depth++;
                else if (char === closeChar) {
                    depth--;
                    if (depth === 0) return i;
                }
            }
        }
        return startLine; // No match found
    }

    toggleFold(line) {
        if (this.foldedLines.has(line)) {
            // Unfold
            this.foldedLines.delete(line);
            this.foldRegions.delete(line);
        } else {
            // Fold - find the end line
            const endLine = this.findFoldEnd(line);
            if (endLine > line) {
                this.foldedLines.add(line);
                this.foldRegions.set(line, endLine);
            }
        }
        this.updateVirtualWindow();
    }

    // Expand all folds - for editor, this means pretty-print/format
    expandAllFolds() {
        this.foldedLines.clear();
        this.foldRegions.clear();
        // Format the JSON (pretty print)
        this.format();
    }

    // Collapse all foldable regions - for editor, this means minify
    collapseAllFolds() {
        this.foldedLines.clear();
        this.foldRegions.clear();
        // Minify the JSON
        this.minify();
    }
    
    // Minify JSON (single line)
    minify() {
        try {
            const current = JSON.parse(this.textarea.value);
            const minified = JSON.stringify(current);
            this.content = minified;
            this.textarea.value = minified;
            
            // Re-parse line offsets
            if (this.worker) {
                this.version++;
                this.worker.postMessage({ text: this.content, version: this.version });
            } else {
                this.buildLineOffsets(this.content);
            }
            
            Toast.show('JSON minified');
        } catch (e) {
            Toast.show('Invalid JSON: ' + e.message);
        }
    }
}