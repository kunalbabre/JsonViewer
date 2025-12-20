/**
 * Global type declarations for JSON Viewer extension
 */

// Extend Window interface for custom properties
interface Window {
    Viewer: typeof import('./ui/Viewer.js').Viewer;
    jvScanTimeout: ReturnType<typeof setTimeout> | undefined;
    requestIdleCallback: ((callback: IdleRequestCallback, options?: IdleRequestOptions) => number) | undefined;
}

// Chrome DevTools panel theme API (not in standard types)
declare namespace chrome.devtools.panels {
    const onThemeChanged: chrome.events.Event<(themeName: string) => void> | undefined;
}

// Search match can be either a DOM element or position info
interface SearchMatch {
    start?: number;
    end?: number;
    // DOM element properties when match is an element
    classList?: DOMTokenList;
    style?: CSSStyleDeclaration;
    parentElement?: HTMLElement | null;
    scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
    closest?: (selector: string) => Element | null;
    getBoundingClientRect?: () => DOMRect;
}

// View instance stored on DOM elements
interface ViewContainer extends HTMLDivElement {
    _treeView?: import('./ui/TreeView.js').TreeView;
    _editorView?: import('./ui/EditorView.js').EditorView;
    _schemaView?: import('./ui/SchemaView.js').SchemaView;
    _yamlView?: import('./ui/YamlView.js').YamlView;
}
