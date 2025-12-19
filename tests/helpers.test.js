/**
 * Unit tests for helper utilities.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { escapeHtml, formatBytes, isJSON, debounce } from '../src/utils/helpers.js';

describe('escapeHtml', () => {
    it('escapes ampersand', () => {
        assert.strictEqual(escapeHtml('foo & bar'), 'foo &amp; bar');
    });

    it('escapes less than', () => {
        assert.strictEqual(escapeHtml('<div>'), '&lt;div&gt;');
    });

    it('escapes quotes', () => {
        assert.strictEqual(escapeHtml('"hello"'), '&quot;hello&quot;');
        assert.strictEqual(escapeHtml("'world'"), '&#039;world&#039;');
    });

    it('handles empty string', () => {
        assert.strictEqual(escapeHtml(''), '');
    });

    it('handles string with no special chars', () => {
        assert.strictEqual(escapeHtml('hello world'), 'hello world');
    });
});

describe('formatBytes', () => {
    it('formats 0 bytes', () => {
        assert.strictEqual(formatBytes(0), '0 Bytes');
    });

    it('formats bytes', () => {
        assert.strictEqual(formatBytes(500), '500 Bytes');
    });

    it('formats kilobytes', () => {
        assert.strictEqual(formatBytes(1024), '1 KB');
        assert.strictEqual(formatBytes(2048), '2 KB');
    });

    it('formats megabytes', () => {
        assert.strictEqual(formatBytes(1048576), '1 MB');
        assert.strictEqual(formatBytes(5242880), '5 MB');
    });

    it('respects decimal places', () => {
        assert.strictEqual(formatBytes(1536, 1), '1.5 KB');
        assert.strictEqual(formatBytes(1536, 0), '2 KB');
    });
});

describe('isJSON', () => {
    it('returns false for empty string', () => {
        assert.strictEqual(isJSON(''), false);
    });

    it('returns false for null/undefined', () => {
        assert.strictEqual(isJSON(null), false);
        assert.strictEqual(isJSON(undefined), false);
    });

    it('returns false for plain text', () => {
        assert.strictEqual(isJSON('hello world'), false);
    });

    it('returns true for valid object', () => {
        assert.strictEqual(isJSON('{"name": "test"}'), true);
    });

    it('returns true for valid array', () => {
        assert.strictEqual(isJSON('[1, 2, 3]'), true);
    });

    it('returns false for invalid JSON with valid structure', () => {
        assert.strictEqual(isJSON('{invalid}'), false);
    });

    it('handles whitespace', () => {
        assert.strictEqual(isJSON('  {"a": 1}  '), true);
    });

    it('skips parse for large strings', () => {
        // Large string that looks like JSON but isn't valid
        const largeInvalid = '{' + 'x'.repeat(60000) + '}';
        // Should return true because it skips parsing
        assert.strictEqual(isJSON(largeInvalid, 50000), true);
    });
});

describe('debounce', () => {
    it('delays function execution', async () => {
        let callCount = 0;
        const fn = debounce(() => callCount++, 50);

        fn();
        fn();
        fn();

        assert.strictEqual(callCount, 0);

        await new Promise(resolve => setTimeout(resolve, 100));

        assert.strictEqual(callCount, 1);
    });

    it('can be cancelled', async () => {
        let callCount = 0;
        const fn = debounce(() => callCount++, 50);

        fn();
        fn.cancel();

        await new Promise(resolve => setTimeout(resolve, 100));

        assert.strictEqual(callCount, 0);
    });
});
