import { Toast } from './Toast.js';

/**
 * @typedef {'json' | 'yaml'} EditorMode
 */

/**
 * @typedef {Object} EditorViewOptions
 * @property {EditorMode} [mode='json'] - Editor mode for syntax highlighting
 * @property {boolean} [isRaw] - Raw mode (no syntax highlighting)
 * @property {string} [rawString] - Pre-formatted raw string (avoids expensive JSON.stringify)
 */

/**
 * @typedef {Object} EditorError
 * @property {number} pos - Position in text where error occurred
 * @property {string} message - Error message
 */

/**
 * Syntax-highlighted code editor with line numbers, bracket matching, and folding.
 * Uses a virtualized rendering approach for performance with large files.
 */
export class EditorView {
    /**
     * Creates a new EditorView instance.
     *
     * @param {any} data - Data to display (object for JSON, string for raw)
     * @param {((newData: any) => void)|null} onUpdate - Callback when data changes
     * @param {EditorViewOptions} [options={}] - Configuration options
     */
    constructor(data, onUpdate, options = {}) {
        /** @type {any} */
        this.data = data;
        /** @type {((newData: any) => void)|null} */
        this.onUpdate = onUpdate;
        /** @type {EditorViewOptions} */
        this.options = options;
        /** @type {EditorMode} */
        this.mode = options.mode || 'json';
        /** @type {string} Content loaded async */
        this.content = '';
        /** @type {HTMLDivElement} */
        this.element = document.createElement('div');
        this.element.className = 'jv-editor-container';

        /** @type {Uint32Array|null} Line start offsets */
        this.lineOffsets = null;
        /** @type {number} Line height in pixels (matches CSS) */
        this.lineHeight = 21;
        /** @type {number} Content version for tracking updates */
        this.version = 0;
        /** @type {boolean} */
        this.isLoading = true;
        /** @type {Map<number, string>} Track pending content by version */
        this.pendingRequests = new Map();
        /** @type {Set<number>} Track folded line numbers */
        this.foldedLines = new Set();
        /** @type {Map<number, number>} Map of start line -> end line for fold regions */
        this.foldRegions = new Map();
        /** @type {Worker|null} */
        this.worker = null;
        /** @type {EditorError|null} */
        this.error = null;
        /** @type {number} */
        this.lineCount = 0;
        /** @type {number|undefined} */
        this.currentActiveLine = undefined;
        /** @type {Array<{start: number, end: number, isCurrent?: boolean}>} */
        this.searchMatches = [];
        /** @type {number|undefined} */
        this.charWidth = undefined;
        /** @type {number|null} Input debounce timer */
        this.inputTimer = null;
        /** @type {number|null} Render throttle timer */
        this.renderTimer = null;
        /** @type {boolean} Whether a render is pending */
        this.renderPending = false;
        /** @type {boolean} Large file mode - uses virtual textarea for performance */
        this.largeFileMode = false;
        /** @type {number} Threshold for large file mode (50MB - uses virtual textarea) */
        this.LARGE_FILE_THRESHOLD = 50000000;
        /** @type {HTMLDivElement|null} Banner element for large file mode */
        this.largeFileBanner = null;
        /** @type {number|null} Scroll throttle timer */
        this.scrollThrottleTimer = null;
        /** @type {number} Last rendered scroll position */
        this.lastRenderedScrollTop = -1;
        /** @type {boolean} Whether the view has been rendered at least once */
        this.hasRendered = false;
        /** @type {boolean} Flag to pause processing during tab transitions */
        this.isPaused = false;

        // Virtual textarea properties for large files
        /** @type {boolean} Whether using virtual textarea mode */
        this.virtualMode = false;
        /** @type {number} Threshold for virtual mode (50MB) */
        this.VIRTUAL_MODE_THRESHOLD = 50000000;
        /** @type {number} First visible line in virtual mode */
        this.virtualStartLine = 0;
        /** @type {number} Number of lines in virtual viewport */
        this.virtualLineCount = 0;
        /** @type {number} Buffer lines above/below viewport */
        this.virtualBuffer = 20;
        /** @type {number|null} Position where partial scan ended (null if fully scanned) */
        this.partialScanEnd = null;

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
            this.loader.style.display = 'none';
            this.isLoading = false;

            // Quick render for immediate display
            this.quickScanAndRender();

            this.postToWorker({
                text: this.content,
                version: this.version,
                action: 'scan'
            });
        } else if (this.options.rawString) {
            // Use pre-formatted raw string (avoids expensive JSON.stringify for large files)
            const rawStr = this.options.rawString;

            // Check if the raw string is already formatted (has indentation)
            // A formatted JSON will have newlines followed by spaces
            const isFormatted = rawStr.includes('\n  ') || rawStr.includes('\n\t');

            // For very large files, use read-only virtualized mode to avoid blocking
            if (rawStr.length > this.LARGE_FILE_THRESHOLD) {
                this.largeFileMode = true;

                // Check if already formatted
                if (isFormatted) {
                    this.content = rawStr;
                    this.enableLargeFileMode();
                } else {
                    // Need to format - do it progressively
                    this.content = rawStr; // Temporary
                    this.updateLoaderMessage('Formatting large file...');
                    this.formatLargeFileAsync(rawStr);
                }
                return;
            }

            // For files > 500KB, use lightweight virtual mode to keep scrolling responsive
            // Setting textarea.value with megabytes of text freezes the browser
            const TEXTAREA_SAFE_LIMIT = 500000; // 500KB max for direct textarea

            if (rawStr.length > TEXTAREA_SAFE_LIMIT) {
                // Use lightweight virtual mode - don't put full content in textarea
                this.content = rawStr;
                this.largeFileMode = true;
                this.loader.style.display = 'none';
                this.isLoading = false;

                // Quick partial scan and setup virtual rendering
                this.quickPartialScan();
                this.setupLightweightVirtual();

                // Continue scanning in background
                this.continueScanInBackground();

                // Format in background if needed (but don't block)
                if (!isFormatted) {
                    this.formatInBackgroundNonBlocking(rawStr);
                }
                return;
            }

            // Files under 500KB - safe to use textarea directly
            if (isFormatted) {
                this.content = rawStr;
                this.textarea.value = this.content;
                this.loader.style.display = 'none';
                this.isLoading = false;
                this.quickScanAndRender();
                this.postToWorker({
                    text: this.content,
                    version: this.version,
                    action: 'scan'
                });
            } else if (rawStr.length < 100000) {
                // Small file - format on main thread (fast)
                try {
                    const parsed = JSON.parse(rawStr);
                    this.content = JSON.stringify(parsed, null, 2);
                } catch (e) {
                    this.content = rawStr;
                }
                this.textarea.value = this.content;
                this.loader.style.display = 'none';
                this.isLoading = false;
                this.quickScanAndRender();
                this.postToWorker({
                    text: this.content,
                    version: this.version,
                    action: 'scan'
                });
            } else {
                // Medium file (100KB-500KB) - format in background
                this.content = rawStr;
                this.textarea.value = this.content;
                this.loader.style.display = 'none';
                this.isLoading = false;
                this.quickScanAndRender();
                this.postToWorker({
                    text: rawStr,
                    version: this.version,
                    action: 'format'
                });
            }
        } else {
            this.postToWorker({
                data: this.data,
                version: this.version,
                action: 'stringify'
            });
        }
    }

    /**
     * Enable large file mode - uses VIRTUAL TEXTAREA approach
     * The textarea only contains visible lines, not the full content.
     * This is the ONLY way to handle 50MB+ files without browser freeze.
     */
    enableLargeFileMode() {
        const sizeStr = (this.content.length / 1024 / 1024).toFixed(1);
        this.virtualMode = true;

        // Show info banner
        const banner = document.createElement('div');
        banner.className = 'jv-large-file-banner';
        banner.style.cssText = `
            padding: 8px 16px;
            background: var(--key-color);
            color: white;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        const spinner = document.createElement('div');
        spinner.className = 'jv-spinner-small';
        banner.appendChild(spinner);

        const bannerText = document.createElement('span');
        bannerText.textContent = `Large file (${sizeStr} MB) - Scanning...`;
        banner.appendChild(bannerText);

        this.element.insertBefore(banner, this.element.firstChild);
        this.largeFileBanner = banner;

        // First, scan for line offsets (this is fast - just finding newlines)
        this.scanLinesSync();

        // Now set up virtual scrolling
        this.setupVirtualTextarea();

        // Hide loader and mark as ready
        this.loader.style.display = 'none';
        this.isLoading = false;
        banner.innerHTML = '';
        const finalText = document.createElement('span');
        finalText.textContent = `Large file (${sizeStr} MB) - Virtual mode`;
        banner.appendChild(finalText);
    }

    /**
     * Format large file asynchronously using chunked processing
     * @param {string} rawStr - Minified JSON string
     */
    formatLargeFileAsync(rawStr) {
        const sizeStr = (rawStr.length / 1024 / 1024).toFixed(1);

        // Show formatting banner
        const banner = document.createElement('div');
        banner.className = 'jv-large-file-banner';

        const bannerSpinner = document.createElement('div');
        bannerSpinner.className = 'jv-spinner-small';
        banner.appendChild(bannerSpinner);

        const bannerText = document.createElement('span');
        bannerText.textContent = `Formatting ${sizeStr} MB file... 0%`;
        banner.appendChild(bannerText);

        this.element.insertBefore(banner, this.element.firstChild);
        this.largeFileBanner = banner;

        // Format in chunks to avoid blocking UI
        const result = [];
        let indent = 0;
        let inString = false;
        let escaped = false;
        let pos = 0;
        const len = rawStr.length;
        const chunkSize = 100000; // Process 100KB at a time

        const processChunk = () => {
            const endPos = Math.min(pos + chunkSize, len);

            while (pos < endPos) {
                const char = rawStr[pos];

                if (escaped) {
                    result.push(char);
                    escaped = false;
                    pos++;
                    continue;
                }

                if (char === '\\' && inString) {
                    result.push(char);
                    escaped = true;
                    pos++;
                    continue;
                }

                if (char === '"') {
                    inString = !inString;
                    result.push(char);
                    pos++;
                    continue;
                }

                if (inString) {
                    result.push(char);
                    pos++;
                    continue;
                }

                // Outside string - handle structure
                switch (char) {
                    case '{':
                    case '[':
                        result.push(char);
                        indent++;
                        result.push('\n');
                        result.push('  '.repeat(indent));
                        break;
                    case '}':
                    case ']':
                        indent--;
                        result.push('\n');
                        result.push('  '.repeat(indent));
                        result.push(char);
                        break;
                    case ',':
                        result.push(char);
                        result.push('\n');
                        result.push('  '.repeat(indent));
                        break;
                    case ':':
                        result.push(': ');
                        break;
                    case ' ':
                    case '\t':
                    case '\n':
                    case '\r':
                        // Skip whitespace outside strings
                        break;
                    default:
                        result.push(char);
                }
                pos++;
            }

            // Update progress
            const progress = Math.round((pos / len) * 100);
            bannerText.textContent = `Formatting ${sizeStr} MB file... ${progress}%`;

            if (pos < len) {
                // More to process - yield to UI then continue
                setTimeout(processChunk, 0);
            } else {
                // Done formatting
                try {
                    this.content = result.join('');
                    banner.innerHTML = '';
                    const doneText = document.createElement('span');
                    doneText.textContent = `Large file (${sizeStr} MB) - Virtual mode`;
                    banner.appendChild(doneText);

                    // Now enable virtual mode with formatted content
                    this.scanLinesSync();
                    this.setupVirtualTextarea();
                    this.loader.style.display = 'none';
                    this.isLoading = false;
                } catch (e) {
                    console.error('Failed to format large file:', e);
                    banner.innerHTML = '';
                    const errorText = document.createElement('span');
                    errorText.textContent = `Large file (${sizeStr} MB) - Format failed`;
                    banner.appendChild(errorText);
                    this.content = rawStr;
                    this.scanLinesSync();
                    this.setupVirtualTextarea();
                    this.loader.style.display = 'none';
                    this.isLoading = false;
                }
            }
        };

        // Start processing
        setTimeout(processChunk, 10);
    }

    /**
     * Quick scan and render - immediately shows content without waiting for worker
     * Used to eliminate blank screen after loading
     */
    quickScanAndRender() {
        // Do a PARTIAL synchronous scan - just enough for initial viewport
        // This keeps the UI responsive while showing content immediately
        this.quickPartialScan();

        // Immediately render visible content
        this.hasRendered = false; // Force render
        this.updateVirtualWindow();

        // Continue scanning the rest in background (non-blocking)
        this.continueScanInBackground();

        // Also ensure layout is correct after RAF
        requestAnimationFrame(() => {
            this.hasRendered = false;
            this.updateVirtualWindow();
        });
    }

    /**
     * Quick partial scan - only scan first ~100 lines for immediate display
     * This keeps UI responsive while showing content right away
     */
    quickPartialScan() {
        const content = this.content;
        const len = content.length;
        const offsets = [0];

        // Only scan first ~200 lines or 50KB, whichever comes first
        // This is enough for initial viewport and keeps scan fast
        const maxScanLength = Math.min(len, 50000);
        const maxLines = 200;

        for (let i = 0; i < maxScanLength && offsets.length < maxLines; i++) {
            if (content.charCodeAt(i) === 10) {
                offsets.push(i + 1);
            }
        }

        // If we didn't reach end of file, estimate total lines for scrollbar
        if (maxScanLength < len) {
            // Estimate based on average line length so far
            const avgLineLen = maxScanLength / offsets.length;
            const estimatedTotalLines = Math.ceil(len / avgLineLen);
            this.lineCount = estimatedTotalLines;
        } else {
            this.lineCount = offsets.length;
        }

        this.lineOffsets = new Uint32Array(offsets);
        this.partialScanEnd = maxScanLength; // Track where we stopped
        this.foldRegions = new Map();
    }

    /**
     * Continue scanning remaining content in background without blocking UI
     */
    continueScanInBackground() {
        if (!this.partialScanEnd || this.partialScanEnd >= this.content.length) {
            return; // Already fully scanned
        }

        const content = this.content;
        const len = content.length;
        let pos = this.partialScanEnd;
        let offsets = Array.from(this.lineOffsets);
        const chunkSize = 100000; // Scan 100KB at a time

        const scanChunk = () => {
            const endPos = Math.min(pos + chunkSize, len);

            for (let i = pos; i < endPos; i++) {
                if (content.charCodeAt(i) === 10) {
                    offsets.push(i + 1);
                }
            }

            pos = endPos;

            if (pos < len) {
                // More to scan - yield to UI then continue
                setTimeout(scanChunk, 0);
            } else {
                // Done scanning - update with full offsets
                this.lineOffsets = new Uint32Array(offsets);
                this.lineCount = offsets.length;
                this.partialScanEnd = null; // Mark as fully scanned

                // Re-render to update scrollbar with accurate count
                this.hasRendered = false;
                this.updateVirtualWindow();
            }
        };

        // Start background scan after a small delay to let UI settle
        setTimeout(scanChunk, 50);
    }

    /**
     * Setup lightweight virtual mode for files 500KB-50MB
     * Textarea only contains visible lines, keeping scroll responsive
     */
    setupLightweightVirtual() {
        // Calculate viewport
        const viewportHeight = this.scroller.clientHeight || 500;
        this.virtualLineCount = Math.ceil(viewportHeight / this.lineHeight) + this.virtualBuffer * 2;

        // Create virtual scroller for smooth scrolling
        const totalHeight = this.lineCount * this.lineHeight;

        // Configure textarea for virtual mode - read-only but selectable
        this.textarea.style.overflow = 'hidden';
        this.textarea.readOnly = true; // Read-only but still selectable
        this.textarea.style.cursor = 'text'; // Show text cursor for selection
        this.textarea.style.userSelect = 'text'; // Ensure text is selectable

        // Create virtual scroller if not exists
        if (!this.virtualScroller) {
            this.virtualScroller = document.createElement('div');
            this.virtualScroller.className = 'jv-virtual-scroller';
            this.virtualScroller.style.cssText = `
                position: absolute;
                top: 0;
                right: 0;
                width: 14px;
                height: 100%;
                overflow-y: auto;
                overflow-x: hidden;
                z-index: 10;
            `;

            this.virtualSpacer = document.createElement('div');
            this.virtualSpacer.style.width = '1px';
            this.virtualSpacer.style.height = totalHeight + 'px';
            this.virtualScroller.appendChild(this.virtualSpacer);
            this.scroller.appendChild(this.virtualScroller);

            // Handle scroll events
            this.virtualScroller.onscroll = () => {
                if (this.isPaused) return;
                this.handleLightweightScroll();
            };

            // Forward wheel events
            this._wheelHandler = (e) => {
                if (this.isPaused) return;
                e.preventDefault();
                this.virtualScroller.scrollTop += e.deltaY;
            };
            this.scroller.addEventListener('wheel', this._wheelHandler, { passive: false });
        } else {
            this.virtualSpacer.style.height = totalHeight + 'px';
        }

        // Initial render - ensure we start from line 0 at scroll position 0
        this.virtualStartLine = 0;
        this.virtualScroller.scrollTop = 0;
        this.renderLightweightViewport(0, 0);
    }

    /**
     * Handle scroll in lightweight virtual mode
     */
    handleLightweightScroll() {
        const scrollTop = this.virtualScroller.scrollTop;

        // Calculate which line should be at the top of viewport
        const topLine = Math.floor(scrollTop / this.lineHeight);

        // Render buffer lines before and after for smooth scrolling
        const startLine = Math.max(0, topLine - this.virtualBuffer);

        // Check if we need to scan more lines on-demand
        const scannedLines = this.lineOffsets.length;
        const neededLine = topLine + this.virtualLineCount + this.virtualBuffer;
        if (neededLine >= scannedLines && this.partialScanEnd !== null) {
            this.scanOnDemand(neededLine + 50);
        }

        // Calculate where the currently rendered content would appear
        const yOffset = (this.virtualStartLine * this.lineHeight) - scrollTop;

        // Re-render when:
        // 1. The first rendered line (virtualStartLine) would be below the viewport top
        //    This happens when scrolling UP past the rendered content
        // 2. The last rendered line would be above the viewport
        //    This happens when scrolling DOWN past the rendered content
        // 3. Scrolled far enough that we need new content anyway
        const renderedContentTop = yOffset;
        const renderedContentBottom = yOffset + (this.virtualLineCount * this.lineHeight);
        const viewportHeight = this.scroller.clientHeight || 500;

        const needsRerender =
            renderedContentTop > 0 ||  // Content starts below viewport top - need earlier lines
            renderedContentBottom < viewportHeight ||  // Content ends above viewport bottom - need later lines
            Math.abs(startLine - this.virtualStartLine) > this.virtualBuffer / 2;

        if (needsRerender) {
            this.renderLightweightViewport(startLine, scrollTop);
        } else {
            // Just update transforms for smooth scrolling without re-render
            this.code.style.transform = `translateY(${yOffset}px)`;
            this.textarea.style.transform = `translateY(${yOffset}px)`;
            this.gutterContent.style.transform = `translateY(${yOffset}px)`;
            this.searchLayer.style.transform = `translateY(${yOffset}px)`;
        }
    }

    /**
     * Render visible portion in lightweight virtual mode
     * @param {number} startLine - First line to render
     * @param {number} scrollTop - Current scroll position
     */
    renderLightweightViewport(startLine, scrollTop = 0) {
        if (!this.lineOffsets || this.lineCount === 0) return;

        // Ensure startLine is within scanned range
        const scannedLines = this.lineOffsets.length;
        if (scannedLines === 0) return;

        startLine = Math.max(0, Math.min(startLine, scannedLines - 1));
        this.virtualStartLine = startLine;

        const endLine = Math.min(startLine + this.virtualLineCount, scannedLines);

        // Get text for visible lines
        const startOffset = this.lineOffsets[startLine];
        const endOffset = endLine < scannedLines
            ? this.lineOffsets[endLine]
            : this.content.length;
        const visibleText = this.content.substring(startOffset, endOffset);

        // Update textarea with only visible content
        this.textarea.value = visibleText;

        // Calculate transform: position content so startLine appears at correct scroll position
        // yOffset positions the content block relative to the scroller
        const yOffset = (startLine * this.lineHeight) - scrollTop;

        this.textarea.style.transform = `translateY(${yOffset}px)`;
        this.code.innerHTML = this.highlight(visibleText);
        this.code.style.transform = `translateY(${yOffset}px)`;

        // Render gutter - must match the lines we're rendering
        let gutterHtml = '';
        for (let i = startLine; i < endLine; i++) {
            gutterHtml += `<div class="jv-line-number" data-line="${i}">${i + 1}</div>`;
        }
        this.gutterContent.innerHTML = gutterHtml;
        this.gutterContent.style.transform = `translateY(${yOffset}px)`;

        // Render search highlights for visible viewport
        this.renderSearchHighlightsVirtual(startLine, endLine, startOffset, yOffset);
    }

    /**
     * Render search highlights for lightweight virtual mode
     * @param {number} startLine - First visible line
     * @param {number} endLine - Last visible line
     * @param {number} startOffset - Byte offset of startLine
     * @param {number} yOffset - Y transform offset for positioning
     */
    renderSearchHighlightsVirtual(startLine, endLine, startOffset, yOffset) {
        this.searchLayer.innerHTML = '';
        if (!this.searchMatches || this.searchMatches.length === 0) return;

        const endOffset = endLine < this.lineOffsets.length
            ? this.lineOffsets[endLine]
            : this.content.length;

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

        // Measure char width if not cached
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
            measureSpan.textContent = 'XXXXXXXXXX';
            document.body.appendChild(measureSpan);
            this.charWidth = measureSpan.getBoundingClientRect().width / 10;
            document.body.removeChild(measureSpan);
        }

        // Iterate through visible matches
        for (let i = firstMatchIndex; i < this.searchMatches.length; i++) {
            const match = this.searchMatches[i];
            if (match.start >= endOffset) break;

            // Find line containing match.start using binary search
            let lineIdx = startLine;
            let linelow = startLine, linehigh = endLine - 1;
            while (linelow <= linehigh) {
                const mid = Math.floor((linelow + linehigh) / 2);
                const midOffset = this.lineOffsets[mid];
                const nextOffset = mid + 1 < this.lineOffsets.length
                    ? this.lineOffsets[mid + 1]
                    : this.content.length;

                if (match.start >= midOffset && match.start < nextOffset) {
                    lineIdx = mid;
                    break;
                } else if (match.start < midOffset) {
                    linehigh = mid - 1;
                } else {
                    linelow = mid + 1;
                    lineIdx = mid; // Keep track of best match
                }
            }

            if (lineIdx < startLine || lineIdx >= endLine) continue;

            const lineStart = this.lineOffsets[lineIdx];
            const col = match.start - lineStart;
            const matchLen = match.end - match.start;

            // Row relative to the visible content (0-indexed from startLine)
            const row = lineIdx - startLine;

            const el = document.createElement('div');
            el.className = 'jv-search-highlight';
            if (match.isCurrent) el.classList.add('current');

            // Use pixel positioning for accuracy
            el.style.position = 'absolute';
            el.style.left = `${12 + (col * this.charWidth)}px`; // 12px padding
            el.style.top = `${row * this.lineHeight}px`;
            el.style.width = `${matchLen * this.charWidth}px`;
            el.style.height = `${this.lineHeight}px`;
            el.style.backgroundColor = match.isCurrent ? 'var(--accent)' : 'rgba(251, 191, 36, 0.4)';
            el.style.borderRadius = '2px';

            this.searchLayer.appendChild(el);
        }

        // Apply same transform as code layer
        this.searchLayer.style.transform = `translateY(${yOffset}px)`;
    }

    /**
     * Format content in background without blocking UI
     * @param {string} rawStr - Raw JSON string to format
     */
    formatInBackgroundNonBlocking(rawStr) {
        const result = [];
        let indent = 0;
        let inString = false;
        let escaped = false;
        let pos = 0;
        const len = rawStr.length;
        const chunkSize = 50000; // Smaller chunks for smoother UI

        const processChunk = () => {
            const endPos = Math.min(pos + chunkSize, len);

            while (pos < endPos) {
                const char = rawStr[pos];

                if (escaped) {
                    result.push(char);
                    escaped = false;
                    pos++;
                    continue;
                }

                if (char === '\\' && inString) {
                    result.push(char);
                    escaped = true;
                    pos++;
                    continue;
                }

                if (char === '"') {
                    inString = !inString;
                    result.push(char);
                    pos++;
                    continue;
                }

                if (inString) {
                    result.push(char);
                    pos++;
                    continue;
                }

                switch (char) {
                    case '{':
                    case '[':
                        result.push(char);
                        indent++;
                        result.push('\n');
                        result.push('  '.repeat(indent));
                        break;
                    case '}':
                    case ']':
                        indent--;
                        result.push('\n');
                        result.push('  '.repeat(indent));
                        result.push(char);
                        break;
                    case ',':
                        result.push(char);
                        result.push('\n');
                        result.push('  '.repeat(indent));
                        break;
                    case ':':
                        result.push(': ');
                        break;
                    case ' ':
                    case '\t':
                    case '\n':
                    case '\r':
                        break;
                    default:
                        result.push(char);
                }
                pos++;
            }

            if (pos < len) {
                // Yield to UI
                setTimeout(processChunk, 0);
            } else {
                // Done - update content and re-scan
                this.content = result.join('');
                this.partialScanEnd = 0; // Reset scan
                this.quickPartialScan();
                this.continueScanInBackground();

                // Update virtual scroller height
                if (this.virtualSpacer) {
                    this.virtualSpacer.style.height = (this.lineCount * this.lineHeight) + 'px';
                }

                // Re-render current viewport
                this.renderLightweightViewport(this.virtualStartLine);
            }
        };

        // Start after a delay to let initial render complete
        setTimeout(processChunk, 100);
    }

    /**
     * Scan on-demand when user scrolls to unscanned area
     * @param {number} targetLine - Line number we need to reach
     */
    scanOnDemand(targetLine) {
        if (this.partialScanEnd === null || this.partialScanEnd >= this.content.length) {
            return; // Already fully scanned
        }

        const content = this.content;
        const len = content.length;
        let pos = this.partialScanEnd;
        const offsets = Array.from(this.lineOffsets);

        // Scan until we have enough lines or reach end
        while (pos < len && offsets.length <= targetLine) {
            if (content.charCodeAt(pos) === 10) {
                offsets.push(pos + 1);
            }
            pos++;
        }

        this.lineOffsets = new Uint32Array(offsets);
        this.partialScanEnd = pos < len ? pos : null;

        // Update line count if we finished
        if (pos >= len) {
            this.lineCount = offsets.length;
        }
    }

    /**
     * Estimate byte offset for a line that hasn't been scanned yet
     * @param {number} lineNum - Line number to estimate
     * @returns {number} Estimated byte offset
     */
    estimateOffset(lineNum) {
        if (!this.lineOffsets || this.lineOffsets.length === 0) {
            return 0;
        }

        // Use average line length from scanned portion
        const scannedLines = this.lineOffsets.length;
        const scannedBytes = this.lineOffsets[scannedLines - 1] || 0;
        const avgLineLen = scannedBytes / scannedLines;

        return Math.min(Math.floor(lineNum * avgLineLen), this.content.length);
    }

    /**
     * Synchronously scan for line offsets - fast even for large files
     * Just finds newline positions, doesn't parse content
     */
    scanLinesSync() {
        const content = this.content;
        const len = content.length;
        const offsets = [0]; // First line starts at 0

        for (let i = 0; i < len; i++) {
            if (content.charCodeAt(i) === 10) { // newline
                offsets.push(i + 1);
            }
        }

        this.lineOffsets = new Uint32Array(offsets);
        this.lineCount = offsets.length;
        this.foldRegions = new Map(); // Disable folding for large files
    }

    /**
     * Set up virtual textarea - textarea only contains visible portion
     */
    setupVirtualTextarea() {
        // Calculate how many lines fit in viewport
        const viewportHeight = this.textarea.clientHeight || 500;
        this.virtualLineCount = Math.ceil(viewportHeight / this.lineHeight) + this.virtualBuffer * 2;

        // Create a spacer div to simulate full content height
        // This allows the scroller to have correct scrollbar
        const totalHeight = this.lineCount * this.lineHeight;

        // We'll use a transform on the code element to position content
        // The textarea will be positioned to match visible area

        // Hide the real textarea scrollbar - we'll use a fake scroller
        this.textarea.style.overflow = 'hidden';

        // Create scroll container that will have the real scrollbar
        if (!this.virtualScroller) {
            this.virtualScroller = document.createElement('div');
            this.virtualScroller.className = 'jv-virtual-scroller';
            this.virtualScroller.style.cssText = `
                position: absolute;
                top: 0;
                right: 0;
                width: 14px;
                height: 100%;
                overflow-y: auto;
                overflow-x: hidden;
                z-index: 10;
            `;

            // Spacer to create scrollable height
            this.virtualSpacer = document.createElement('div');
            this.virtualSpacer.style.width = '1px';
            this.virtualSpacer.style.height = totalHeight + 'px';
            this.virtualScroller.appendChild(this.virtualSpacer);

            this.scroller.appendChild(this.virtualScroller);

            // Sync scroll from virtual scroller to our viewport
            this.virtualScroller.onscroll = () => {
                if (this.isPaused) return;
                this.handleVirtualScroll();
            };

            // Forward mouse wheel events from the editor area to the virtual scroller
            this._wheelHandler = (e) => {
                if (this.isPaused) return;
                e.preventDefault();
                this.virtualScroller.scrollTop += e.deltaY;
            };
            this.scroller.addEventListener('wheel', this._wheelHandler, { passive: false });
        } else {
            this.virtualSpacer.style.height = totalHeight + 'px';
        }

        // Initial render of visible content
        this.renderVirtualViewport(0);
    }

    /**
     * Handle scroll in virtual mode
     */
    handleVirtualScroll() {
        const scrollTop = this.virtualScroller.scrollTop;
        const startLine = Math.max(0, Math.floor(scrollTop / this.lineHeight) - this.virtualBuffer);

        // Only re-render if we've scrolled significantly
        if (Math.abs(startLine - this.virtualStartLine) > this.virtualBuffer / 2) {
            this.renderVirtualViewport(startLine);
        }

        // Update gutter position
        this.gutterContent.style.transform = `translateY(${-scrollTop}px)`;

        // Update code position
        this.code.style.transform = `translateY(${startLine * this.lineHeight}px)`;

        // Sync pre scroll for horizontal
        this.pre.scrollTop = scrollTop;
    }

    /**
     * Render only the visible portion of content into textarea
     * @param {number} startLine - First line to render
     */
    renderVirtualViewport(startLine) {
        if (!this.lineOffsets || this.lineCount === 0) return;

        this.virtualStartLine = startLine;
        const endLine = Math.min(startLine + this.virtualLineCount, this.lineCount);

        // Extract visible text from full content
        const startOffset = this.lineOffsets[startLine];
        const endOffset = endLine < this.lineCount
            ? this.lineOffsets[endLine]
            : this.content.length;

        const visibleText = this.content.substring(startOffset, endOffset);

        // Update textarea with just visible content
        // This is the KEY - textarea only has a few KB, not 50MB
        this.textarea.value = visibleText;

        // Position textarea to align with virtual scroll position
        const yOffset = startLine * this.lineHeight;
        this.textarea.style.transform = `translateY(${yOffset}px)`;

        // Render syntax highlighting for visible text
        this.code.innerHTML = this.highlight(visibleText);
        this.code.style.transform = `translateY(${yOffset}px)`;

        // Render gutter (line numbers)
        let gutterHtml = '';
        for (let i = startLine; i < endLine; i++) {
            gutterHtml += `<div class="jv-line-number" data-line="${i}">${i + 1}</div>`;
        }
        this.gutterContent.innerHTML = gutterHtml;
        this.gutterContent.style.transform = `translateY(${yOffset}px)`;
    }

    /**
     * Handle input in virtual mode - merge changes back to full content
     */
    handleVirtualInput() {
        const visibleText = this.textarea.value;
        const startOffset = this.lineOffsets[this.virtualStartLine];
        const endLine = Math.min(this.virtualStartLine + this.virtualLineCount, this.lineCount);
        const endOffset = endLine < this.lineCount
            ? this.lineOffsets[endLine]
            : this.content.length;

        // Merge changed text back into full content
        this.content =
            this.content.substring(0, startOffset) +
            visibleText +
            this.content.substring(endOffset);

        // Rescan line offsets (could optimize to only rescan affected area)
        this.scanLinesSync();

        // Update virtual scroller height
        if (this.virtualSpacer) {
            this.virtualSpacer.style.height = (this.lineCount * this.lineHeight) + 'px';
        }

        // Re-render visible portion
        this.renderVirtualViewport(this.virtualStartLine);
    }


    initWorker() {
        // Try to create worker, fall back to main thread processing if it fails
        // Workers may fail due to CSP or cross-origin restrictions on some pages
        try {
            // Check if chrome.runtime is available (may not be in all contexts)
            if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) {
                this.worker = null;
                return;
            }
            const workerUrl = chrome.runtime.getURL('src/workers/editor-worker.js');
            this.worker = new Worker(workerUrl);
            this.worker.onmessage = (e) => this.handleWorkerMessage(e.data);
            this.worker.onerror = (err) => {
                // Worker failed (likely CSP restriction), fall back to main thread
                console.warn('EditorView: Worker failed, falling back to main thread:', err);
                this.worker = null;
            };
        } catch (e) {
            // Worker creation failed (likely CSP restriction), will fall back to main thread
            console.warn('EditorView: Worker creation failed:', e);
            this.worker = null;
        }
    }

    /**
     * Handle messages from the worker (or process synchronously if no worker)
     * @param {Object} data - Message data
     */
    handleWorkerMessage(data) {
        const { error, offsets, count, version, action, formattedText, text } = data;

        if (action === 'stringifyComplete') {
            if (version === this.version) {
                this.content = text;
                // Don't set textarea value in large file mode
                if (!this.largeFileMode) {
                    this.textarea.value = this.content;
                }
                this.loader.style.display = 'none';
                this.isLoading = false;
                // Scan results will follow in next message
            }
            return;
        }

        if (action === 'formatComplete') {
            if (version === this.version) {
                this.content = formattedText;
                // Don't set textarea value in large file mode
                if (!this.largeFileMode) {
                    this.textarea.value = this.content;
                }
                this.version++; // Invalidate old requests
                this.postToWorker({ text: this.content, version: this.version });
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

        // Update the virtual window display
        this.updateVirtualWindow();
        this.textarea.classList.remove('dirty');
        this.code.style.display = 'block';

        // Re-render after layout settles (container may not be sized yet)
        requestAnimationFrame(() => {
            this.hasRendered = false; // Force re-render
            this.updateVirtualWindow();
        });
    }

    /**
     * Post message to worker or process on main thread
     * @param {Object} message - Message to send
     */
    postToWorker(message) {
        if (this.worker) {
            this.worker.postMessage(message);
        } else {
            // Main thread fallback - process synchronously
            this.processOnMainThread(message);
        }
    }

    /**
     * Process worker tasks on main thread (fallback when worker unavailable)
     * @param {Object} message - The message that would be sent to worker
     */
    processOnMainThread(message) {
        const { text, data, version, action } = message;

        if (action === 'stringify') {
            // Use async stringify for large data to avoid blocking UI
            this.stringifyAsync(data, version);
            return;
        }

        if (action === 'format') {
            try {
                const parsed = JSON.parse(text);
                const formatted = JSON.stringify(parsed, null, 2);
                this.handleWorkerMessage({
                    formattedText: formatted,
                    version: version,
                    action: 'formatComplete'
                });
                this.scanOnMainThread(formatted, version);
            } catch (err) {
                this.handleWorkerMessage({
                    error: { message: err.message },
                    version,
                    action: 'formatError'
                });
            }
            return;
        }

        // Default: scan
        if (action === 'scan' || text) {
            // Use async scanning for large files to avoid blocking UI
            if (text.length > 500000) {
                this.scanOnMainThreadAsync(text, version);
            } else {
                this.scanOnMainThread(text, version);
            }
        }
    }

    /**
     * Stringify data asynchronously to avoid blocking UI
     * @param {any} data - Data to stringify
     * @param {number} version - Version number
     */
    stringifyAsync(data, version) {
        // For small data, stringify synchronously
        const dataStr = JSON.stringify(data);
        if (dataStr.length < 100000) {
            try {
                const stringified = JSON.stringify(data, null, 2);
                this.handleWorkerMessage({
                    text: stringified,
                    version: version,
                    action: 'stringifyComplete'
                });
                this.scanOnMainThread(stringified, version);
            } catch (err) {
                this.handleWorkerMessage({
                    error: { message: err.message },
                    version,
                    action: 'error'
                });
            }
            return;
        }

        // For large data, use chunked approach
        // First, do the stringify in chunks using setTimeout to yield to UI
        this.updateLoaderMessage('Formatting JSON...');

        setTimeout(() => {
            try {
                const stringified = JSON.stringify(data, null, 2);
                this.handleWorkerMessage({
                    text: stringified,
                    version: version,
                    action: 'stringifyComplete'
                });
                // Scan in chunks for large files
                this.scanOnMainThreadAsync(stringified, version);
            } catch (err) {
                this.handleWorkerMessage({
                    error: { message: err.message },
                    version,
                    action: 'error'
                });
            }
        }, 10);
    }

    /**
     * Update loader message
     * @param {string} message - Message to display
     */
    updateLoaderMessage(message) {
        if (this.loader) {
            const msgEl = this.loader.querySelector('div:last-child');
            if (msgEl) msgEl.textContent = message;
        }
    }

    /**
     * Scan text for line offsets on main thread
     * @param {string} text - Text to scan
     * @param {number} version - Version number
     */
    scanOnMainThread(text, version) {
        const result = { error: null, offsets: null, count: 0, version };

        // 1. Scan Lines
        try {
            const estimatedLines = Math.max(1000, Math.ceil(text.length / 40));
            let offsets = new Uint32Array(estimatedLines);
            let count = 0;

            offsets[count++] = 0;
            let pos = -1;

            while ((pos = text.indexOf('\n', pos + 1)) !== -1) {
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

            result.offsets = offsets.slice(0, count);
            result.count = count;
        } catch (err) {
            console.error('Scan error', err);
        }

        // 2. Validate JSON (skip for large files - too slow)
        if (text.length < 500000) {
            try {
                JSON.parse(text);
            } catch (e) {
                const match = e.message.match(/at position (\d+)/);
                result.error = {
                    pos: match ? parseInt(match[1], 10) : -1,
                    message: e.message
                };
            }
        }

        this.handleWorkerMessage(result);
    }

    /**
     * Scan text for line offsets asynchronously (for large files)
     * @param {string} text - Text to scan
     * @param {number} version - Version number
     */
    scanOnMainThreadAsync(text, version) {
        this.updateLoaderMessage('Scanning lines...');

        const result = { error: null, offsets: null, count: 0, version };
        const estimatedLines = Math.max(1000, Math.ceil(text.length / 40));
        let offsets = new Uint32Array(estimatedLines);
        let count = 0;
        offsets[count++] = 0;

        let pos = 0;
        const chunkSize = 500000; // Process 500KB at a time

        const processChunk = () => {
            const endPos = Math.min(pos + chunkSize, text.length);
            let searchPos = pos - 1;

            while ((searchPos = text.indexOf('\n', searchPos + 1)) !== -1 && searchPos < endPos) {
                if (count === offsets.length) {
                    const newOffsets = new Uint32Array(offsets.length * 2);
                    newOffsets.set(offsets);
                    offsets = newOffsets;
                }
                offsets[count++] = searchPos + 1;
            }

            pos = endPos;

            if (pos < text.length) {
                // More to process, yield to UI
                setTimeout(processChunk, 0);
            } else {
                // Done scanning, finalize
                if (count === offsets.length) {
                    const newOffsets = new Uint32Array(offsets.length + 1);
                    newOffsets.set(offsets);
                    offsets = newOffsets;
                }
                offsets[count++] = text.length + 1;

                result.offsets = offsets.slice(0, count);
                result.count = count;

                // Skip JSON validation for very large files (too slow)
                if (text.length < 1000000) {
                    try {
                        JSON.parse(text);
                    } catch (e) {
                        const match = e.message.match(/at position (\d+)/);
                        result.error = {
                            pos: match ? parseInt(match[1], 10) : -1,
                            message: e.message
                        };
                    }
                }

                this.handleWorkerMessage(result);
            }
        };

        setTimeout(processChunk, 0);
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

        // In virtual mode, use special handling
        if (this.virtualMode) {
            this.handleVirtualInput();
            return;
        }

        const text = this.textarea.value;
        const isLargeFile = text.length > 100000; // 100KB threshold

        // Update active line (lightweight operation)
        this.updateActiveLine();

        // For large files, throttle virtual window updates to reduce lag
        if (isLargeFile) {
            if (!this.renderPending) {
                this.renderPending = true;
                requestAnimationFrame(() => {
                    this.updateVirtualWindow(this.textarea.value);
                    this.renderPending = false;
                });
            }
        } else {
            // For smaller files, update immediately for responsive feel
            this.updateVirtualWindow(text);
        }

        // Debounce the heavy worker sync
        if (this.inputTimer) clearTimeout(this.inputTimer);

        // Longer debounce for large files
        const debounceMs = isLargeFile ? 500 : 300;

        this.inputTimer = setTimeout(() => {
            const update = () => {
                const currentText = this.textarea.value;
                this.version++;

                // Store the text we are sending so we can retrieve it when worker returns
                this.pendingRequests.set(this.version, currentText);

                this.postToWorker({ text: currentText, version: this.version });
            };

            if (window.requestIdleCallback) {
                requestIdleCallback(update, { timeout: 1000 });
            } else {
                setTimeout(update, 10);
            }
        }, debounceMs);
    }

    validate() {
        // No-op, handled in worker with scan
    }

    handleScroll() {
        // Skip if paused during tab transitions
        if (this.isPaused) return;

        // In virtual mode, the virtualScroller handles scrolling, not textarea
        if (this.virtualMode) {
            // Just sync horizontal scroll
            this.pre.scrollLeft = this.textarea.scrollLeft;
            return;
        }

        // Sync horizontal scroll
        this.pre.scrollLeft = this.textarea.scrollLeft;

        // Throttle scroll handling for large files
        if (this.scrollThrottleTimer) return;

        this.scrollThrottleTimer = requestAnimationFrame(() => {
            this.scrollThrottleTimer = null;
            if (this.isPaused) return; // Check again in case it changed
            this.updateVirtualWindow();
            this.updateActiveLine();
            // Only update bracket match for smaller files (threshold checked inside)
            this.updateBracketMatch();
        });
    }

    /**
     * Pause processing (used during tab transitions to avoid lag)
     */
    pause() {
        this.isPaused = true;
    }

    /**
     * Resume processing after tab transition
     */
    resume() {
        this.isPaused = false;
        // Force a re-render since we were hidden
        // Use RAF to ensure visibility has been applied
        requestAnimationFrame(() => {
            if (this.virtualMode) {
                // In virtual mode, just re-render the visible viewport
                this.renderVirtualViewport(this.virtualStartLine);
            } else {
                this.lastRenderedScrollTop = -1; // Reset to force re-render
                this.updateVirtualWindow();
            }
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
        const col = (this.lineOffsets && this.lineOffsets[line] !== undefined) ? cursor - this.lineOffsets[line] + 1 : 1;
        if (this.statusBar) {
            this.statusBar.textContent = `Ln ${line + 1}, Col ${col}`;
        }

        // Update gutter classes
        const gutterLines = this.gutterContent.children;
        for (let i = 0; i < gutterLines.length; i++) {
            const el = /** @type {HTMLElement} */ (gutterLines[i]);
            const l = parseInt(el.dataset.line);
            if (l === line) el.classList.add('active');
            else el.classList.remove('active');
        }
    }

    setSearchMatches(matches) {
        this.searchMatches = matches || [];
        this.hasRendered = false; // Force re-render to show highlights

        // In lightweight virtual mode, re-render the viewport with highlights
        if (this.largeFileMode && this.virtualScroller) {
            const scrollTop = this.virtualScroller.scrollTop;
            const topLine = Math.floor(scrollTop / this.lineHeight);
            const startLine = Math.max(0, topLine - this.virtualBuffer);
            this.renderLightweightViewport(startLine, scrollTop);
        } else {
            this.updateVirtualWindow();
        }
    }

    /**
     * Scroll to a specific search match
     * @param {{start: number, end: number}} match - Match to scroll to
     */
    scrollToMatch(match) {
        if (!match || !this.lineOffsets) return;

        // Binary search for line containing match.start
        let low = 0, high = this.lineCount - 1;
        let line = 0;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (this.lineOffsets[mid] <= match.start) {
                line = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        // In lightweight virtual mode, use virtualScroller for scrolling
        if (this.largeFileMode && this.virtualScroller) {
            const containerHeight = this.scroller.clientHeight || 500;
            const scrollTarget = (line * this.lineHeight) - (containerHeight / 2);
            this.virtualScroller.scrollTop = Math.max(0, scrollTarget);
            // handleLightweightScroll will be triggered and re-render
        } else {
            const containerHeight = this.textarea.clientHeight || 500;
            const scrollTarget = (line * this.lineHeight) - (containerHeight / 2);

            this.textarea.scrollTop = Math.max(0, scrollTarget);
            this.hasRendered = false; // Force re-render
            this.updateVirtualWindow();
        }
    }

    // Bracket Matching - finds matching bracket and highlights both
    updateBracketMatch() {
        if (!this.bracketLayer || !this.lineOffsets || this.options.isRaw) return;
        this.bracketLayer.innerHTML = '';

        const text = this.textarea.value;

        // Skip bracket matching for very large files (>500KB) - too expensive
        if (text.length > 500000) return;

        const cursor = this.textarea.selectionStart;
        if (cursor >= text.length) return;

        const brackets = { '{': '}', '[': ']', '}': '{', ']': '[' };
        const openBrackets = ['{', '['];
        // const closeBrackets = ['}', ']'];

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
            // Search forward, skipping brackets inside strings
            let inString = false;
            for (let i = bracketPos; i < text.length; i++) {
                if (text[i] === '"' && (i === 0 || text[i - 1] !== '\\')) {
                    inString = !inString;
                    continue;
                }
                if (inString) continue;
                if (text[i] === bracketChar) depth++;
                else if (text[i] === target) {
                    depth--;
                    if (depth === 0) { matchPos = i; break; }
                }
            }
        } else {
            // Search backward, skipping brackets inside strings
            // For backward search, we need to track string state from the beginning
            // Build a set of positions that are inside strings
            const inStringSet = new Set();
            let inStr = false;
            for (let i = 0; i <= bracketPos; i++) {
                if (text[i] === '"' && (i === 0 || text[i - 1] !== '\\')) {
                    inStr = !inStr;
                    continue;
                }
                if (inStr) inStringSet.add(i);
            }
            for (let i = bracketPos; i >= 0; i--) {
                if (inStringSet.has(i)) continue;
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

        // Find line using binary search
        let low = 0, high = this.lineCount - 1;
        let line = 0;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (this.lineOffsets[mid] <= pos) {
                line = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
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

        // Skip if paused
        if (this.isPaused) return;

        const content = liveContent !== null ? liveContent : this.content;
        const isDirty = liveContent !== null;

        const scrollTop = this.textarea.scrollTop;
        const containerHeight = this.textarea.clientHeight;

        // Skip re-render if scroll position hasn't changed much (within 1 line) and not dirty
        // This prevents expensive re-renders when switching tabs back
        if (!isDirty && this.hasRendered && Math.abs(scrollTop - this.lastRenderedScrollTop) < this.lineHeight) {
            return;
        }
        this.lastRenderedScrollTop = scrollTop;
        this.hasRendered = true;

        const startLine = Math.floor(scrollTop / this.lineHeight);
        // Ensure minimum visible lines even if container hasn't been sized yet
        const visibleLines = Math.max(50, Math.ceil(containerHeight / this.lineHeight));

        // Buffer lines to prevent flickering
        const buffer = 5;
        const renderStartLine = Math.max(0, startLine - buffer);
        const renderEndLine = Math.min(this.lineCount - 1, startLine + visibleLines + buffer);

        // Check if we need on-demand scanning (user scrolled past partial scan)
        const scannedLines = this.lineOffsets.length;
        if (renderEndLine >= scannedLines && this.partialScanEnd !== null) {
            // Need to scan more lines on-demand
            this.scanOnDemand(renderEndLine + buffer);
        }

        // Get offsets, falling back to estimation if not yet scanned
        let startIndex = renderStartLine < scannedLines
            ? this.lineOffsets[renderStartLine]
            : this.estimateOffset(renderStartLine);
        let endIndex = renderEndLine < scannedLines
            ? this.lineOffsets[renderEndLine]
            : this.estimateOffset(renderEndLine);

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
            el.style.left = `calc(12px + ${col}ch)`; // 12px padding matches .jv-editor-code
            el.style.top = `${row * this.lineHeight}px`;
            el.style.width = `${match.end - match.start}ch`;
            el.style.height = `${this.lineHeight}px`;
            el.style.backgroundColor = match.isCurrent ? 'var(--accent)' : 'rgba(251, 191, 36, 0.4)';
            el.style.borderRadius = '2px';

            this.searchLayer.appendChild(el);
        }
    }

    highlight(text) {
        if (!text) return '';

        // For very large files (>20MB), skip syntax highlighting entirely
        if (this.content.length > 20000000) {
            return this.highlightFast(text);
        }

        // Performance: If visible chunk is too long (>50KB), skip highlighting
        // This is the text being rendered, not the total file size
        if (text.length > 50000) {
            return this.highlightFast(text);
        }

        // Escape HTML
        text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        if (this.mode === 'yaml') {
            return this.highlightYaml(text);
        }

        // JSON highlighting
        return text.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, function (match) {
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

    /**
     * Fast highlighting for large file mode - minimal processing
     * Uses simple line-by-line coloring without expensive regex
     */
    highlightFast(text) {
        // Just escape HTML - no syntax highlighting for maximum speed
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
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
            // Use postToWorker which handles both worker and main thread fallback
            Toast.show('Formatting...');
            this.postToWorker({
                text: this.textarea.value,
                version: this.version,
                action: 'format'
            });
        } catch (e) {
            Toast.show('Invalid JSON: ' + (e instanceof Error ? e.message : String(e)));
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
        
        // Scan from start line to find matching close, skipping brackets in strings
        let inString = false;
        for (let i = startLine; i < this.lineCount; i++) {
            const lStart = this.lineOffsets[i];
            const lEnd = (i + 1 < this.lineOffsets.length) ? this.lineOffsets[i + 1] : content.length;
            const text = content.substring(lStart, lEnd);
            
            for (let j = 0; j < text.length; j++) {
                const char = text[j];
                if (char === '"' && (j === 0 || text[j - 1] !== '\\')) {
                    inString = !inString;
                    continue;
                }
                if (inString) continue;
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
            this.version++;
            this.postToWorker({ text: this.content, version: this.version });

            Toast.show('JSON minified');
        } catch (e) {
            Toast.show('Invalid JSON: ' + (e instanceof Error ? e.message : String(e)));
        }
    }

    /**
     * Clean up resources to prevent memory leaks.
     * Call this when removing the editor from the DOM.
     */
    destroy() {
        // Terminate web worker
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }

        // Remove wheel event listeners
        if (this.scroller && this._wheelHandler) {
            this.scroller.removeEventListener('wheel', this._wheelHandler);
            this._wheelHandler = null;
        }

        // Clear all timers
        if (this.inputTimer) {
            clearTimeout(this.inputTimer);
            this.inputTimer = null;
        }

        if (this.renderTimer) {
            clearTimeout(this.renderTimer);
            this.renderTimer = null;
        }

        if (this.scrollThrottleTimer) {
            cancelAnimationFrame(this.scrollThrottleTimer);
            this.scrollThrottleTimer = null;
        }

        // Clear references to help garbage collection
        this.lineOffsets = null;
        this.foldRegions.clear();
        this.foldedLines.clear();
        this.searchMatches = [];

        // Remove element from DOM if attached
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}