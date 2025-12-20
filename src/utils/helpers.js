/**
 * Shared utility functions for JSON Viewer extension.
 */

import { THEME_STORAGE_KEY } from '../config.js';

/**
 * Creates a Web Worker from an external file path.
 * Uses chrome.runtime.getURL to comply with CSP restrictions.
 *
 * @param {string} workerPath - Path to the worker file (e.g., 'src/workers/parse-worker.js')
 * @returns {{ worker: Worker | null, cleanup: () => void }} Worker instance (or null if unavailable) and cleanup function
 */
export function createWorker(workerPath) {
    let worker = null;

    try {
        // Check if chrome.runtime is available
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
            const workerUrl = chrome.runtime.getURL(workerPath);
            worker = new Worker(workerUrl);
        }
    } catch (e) {
        // Worker creation failed, will return null
        worker = null;
    }

    const cleanup = () => {
        if (worker) {
            worker.terminate();
        }
    };

    return { worker, cleanup };
}

/**
 * Detects the user's theme preference.
 * Priority: stored preference > system preference > light
 *
 * @returns {'dark' | 'light'} The detected theme
 */
export function detectTheme() {
    let storedTheme = null;
    try {
        storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    } catch (e) {
        // localStorage might not be available in all contexts
    }

    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldUseDark = storedTheme === 'dark' || (!storedTheme && systemPrefersDark);

    return shouldUseDark ? 'dark' : 'light';
}

/**
 * Saves theme preference to localStorage.
 *
 * @param {'dark' | 'light'} theme - The theme to save
 */
export function saveTheme(theme) {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (e) {
        console.warn('Could not save theme preference:', e);
    }
}

/**
 * Copies text to clipboard with fallback.
 *
 * @param {string} text - Text to copy
 * @returns {Promise<void>}
 */
export async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(text);
    }

    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    try {
        document.execCommand('copy');
    } finally {
        document.body.removeChild(textarea);
    }
}

/**
 * Escapes HTML special characters.
 *
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Debounces a function call.
 *
 * @param {(...args: any[]) => any} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {((...args: any[]) => void) & { cancel: () => void }} Debounced function with cancel method
 */
export function debounce(fn, delay) {
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timeoutId = null;

    /** @type {((...args: any[]) => void) & { cancel: () => void }} */
    const debounced = /** @type {any} */ ((...args) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            fn(...args);
            timeoutId = null;
        }, delay);
    });

    debounced.cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    return debounced;
}

/**
 * Polyfill for requestIdleCallback.
 *
 * @param {IdleRequestCallback} callback
 * @param {{ timeout?: number }} [options]
 * @returns {number} Handle ID
 */
export const requestIdleCallback = window.requestIdleCallback || function(callback, options) {
    const timeout = options?.timeout || 50;
    return setTimeout(() => {
        const start = Date.now();
        callback({
            didTimeout: false,
            timeRemaining: () => Math.max(0, timeout - (Date.now() - start))
        });
    }, 1);
};

/**
 * Cancels an idle callback.
 *
 * @param {number} handle - Handle ID from requestIdleCallback
 */
export const cancelIdleCallback = window.cancelIdleCallback || function(handle) {
    clearTimeout(handle);
};

/**
 * Formats a byte size into a human-readable string.
 *
 * @param {number} bytes - Size in bytes
 * @param {number} [decimals=2] - Number of decimal places
 * @returns {string} Formatted size string
 */
export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * Checks if a string is valid JSON.
 *
 * @param {string} text - String to check
 * @param {number} [skipParseThreshold=50000] - Skip parse for strings larger than this
 * @returns {boolean} True if valid JSON
 */
export function isJSON(text, skipParseThreshold = 50000) {
    if (!text) return false;
    text = text.trim();

    // Check basic structure
    if (!((text.startsWith('{') && text.endsWith('}')) ||
          (text.startsWith('[') && text.endsWith(']')))) {
        return false;
    }

    // For large files, skip the expensive parse check
    if (text.length > skipParseThreshold) {
        return true;
    }

    try {
        JSON.parse(text);
        return true;
    } catch (e) {
        return false;
    }
}
