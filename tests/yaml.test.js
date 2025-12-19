/**
 * Unit tests for YAML conversion utility.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { jsonToYaml } from '../src/utils/yaml.js';

describe('jsonToYaml', () => {
    it('converts null', () => {
        assert.strictEqual(jsonToYaml(null), 'null');
    });

    it('converts booleans', () => {
        assert.strictEqual(jsonToYaml(true), 'true');
        assert.strictEqual(jsonToYaml(false), 'false');
    });

    it('converts numbers', () => {
        assert.strictEqual(jsonToYaml(42), '42');
        assert.strictEqual(jsonToYaml(3.14), '3.14');
        assert.strictEqual(jsonToYaml(-100), '-100');
    });

    it('converts simple strings', () => {
        assert.strictEqual(jsonToYaml('hello'), 'hello');
    });

    it('quotes strings with special characters', () => {
        assert.strictEqual(jsonToYaml('hello: world'), '"hello: world"');
        assert.strictEqual(jsonToYaml('true'), '"true"');
        assert.strictEqual(jsonToYaml('123'), '"123"');
        assert.strictEqual(jsonToYaml(''), '""');
    });

    it('converts empty array', () => {
        assert.strictEqual(jsonToYaml([]), '[]');
    });

    it('converts empty object', () => {
        assert.strictEqual(jsonToYaml({}), '{}');
    });

    it('converts simple array', () => {
        const result = jsonToYaml([1, 2, 3]);
        assert.ok(result.includes('- 1'));
        assert.ok(result.includes('- 2'));
        assert.ok(result.includes('- 3'));
    });

    it('converts simple object', () => {
        const result = jsonToYaml({ name: 'test', value: 42 });
        assert.ok(result.includes('name: test'));
        assert.ok(result.includes('value: 42'));
    });

    it('handles nested objects', () => {
        const result = jsonToYaml({
            outer: {
                inner: 'value'
            }
        });
        assert.ok(result.includes('outer:'));
        assert.ok(result.includes('inner: value'));
    });

    it('handles circular references', () => {
        const obj = { a: 1 };
        obj.self = obj;
        const result = jsonToYaml(obj);
        assert.ok(result.includes('# Circular reference'));
    });

    it('handles deep nesting within limit', () => {
        let deep = { value: 'bottom' };
        for (let i = 0; i < 10; i++) {
            deep = { nested: deep };
        }
        const result = jsonToYaml(deep);
        assert.ok(result.includes('value: bottom'));
    });

    it('handles max depth exceeded', () => {
        let deep = { value: 'bottom' };
        for (let i = 0; i < 60; i++) {
            deep = { nested: deep };
        }
        const result = jsonToYaml(deep);
        assert.ok(result.includes('# Max depth exceeded'));
    });
});
