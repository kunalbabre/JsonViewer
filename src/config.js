/**
 * Centralized configuration for JSON Viewer extension.
 * All magic numbers and tuning constants are defined here.
 */

/**
 * @typedef {Object} PerformanceConfig
 * @property {number} batchSize - Number of nodes to render per animation frame
 * @property {number} pageSize - Number of nodes before showing "Show More" button
 * @property {number} largeObjectThreshold - Auto-collapse objects with more items than this
 * @property {number} deepNestingThreshold - Expand first N levels by default
 * @property {number} largeFileThreshold - Show loading indicator above this size (bytes)
 * @property {number} veryLargeFileThreshold - Use Web Worker above this size (bytes)
 * @property {number} maxRawSize - Truncate raw view above this size (bytes)
 * @property {number} maxSearchMatches - Limit search matches for performance
 * @property {number} schemaSampleSize - Sample size for array schema inference
 * @property {number} maxYamlDepth - Maximum depth for YAML conversion
 * @property {number} maxSchemaDepth - Maximum depth for schema generation
 * @property {number} gridBatchSize - Rows per batch in grid view
 * @property {number} columnSampleSize - Column detection sample size
 */

/**
 * @typedef {Object} UIConfig
 * @property {number} lineHeight - Editor line height in pixels
 * @property {number} searchDebounceMs - Debounce delay for search input
 * @property {number} scanDebounceMs - Debounce delay for code block scanning
 * @property {number} intersectionMargin - Pixel margin for intersection observer
 */

/**
 * @typedef {Object} Config
 * @property {PerformanceConfig} performance
 * @property {UIConfig} ui
 */

/** @type {Config} */
export const CONFIG = {
    performance: {
        // TreeView rendering
        batchSize: 250,
        pageSize: 1000,
        largeObjectThreshold: 50,
        deepNestingThreshold: 2,

        // File size thresholds
        largeFileThreshold: 5 * 1024 * 1024,      // 5 MB
        veryLargeFileThreshold: 10 * 1024 * 1024, // 10 MB
        maxRawSize: 1 * 1024 * 1024,              // 1 MB

        // Search limits
        maxSearchMatches: 5000,

        // Schema/YAML generation
        schemaSampleSize: 1000,
        maxYamlDepth: 50,
        maxSchemaDepth: 50,

        // Grid view
        gridBatchSize: 50,
        columnSampleSize: 100,
    },

    ui: {
        lineHeight: 21,
        searchDebounceMs: 300,
        scanDebounceMs: 1000,
        intersectionMargin: 200,
    },
};

/**
 * JSON content types that trigger the viewer
 * @type {string[]}
 */
export const JSON_CONTENT_TYPES = [
    'application/json',
    'text/json',
    'application/vnd.api+json',
];

/**
 * Theme storage key
 * @type {string}
 */
export const THEME_STORAGE_KEY = 'json-viewer-theme';

/**
 * Font stack for monospace text
 * @type {string}
 */
export const MONOSPACE_FONT_STACK = "'SF Mono', Monaco, Menlo, Consolas, 'Ubuntu Mono', 'Liberation Mono', 'DejaVu Sans Mono', 'Courier New', monospace";
