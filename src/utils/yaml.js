const MAX_YAML_DEPTH = 50; // Maximum depth to prevent stack overflow

// Protect against prototype pollution
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isSafeKey = (key) => !UNSAFE_KEYS.has(key);

export function jsonToYaml(data) {
    // Create fresh WeakSet for each conversion to properly track circular refs
    const seenObjects = new WeakSet();
    try {
        return convert(data, 0, seenObjects);
    } catch (e) {
        return `# Error converting to YAML: ${e.message}`;
    }
}

function convert(data, indentLevel, seenObjects) {
    // Prevent stack overflow
    if (indentLevel > MAX_YAML_DEPTH) {
        return '# Max depth exceeded';
    }

    // Detect circular references
    if (typeof data === 'object' && data !== null) {
        if (seenObjects.has(data)) {
            return '# Circular reference';
        }
        seenObjects.add(data);
    }

    const indent = '  '.repeat(indentLevel);

    if (data === null) {
        return 'null';
    }

    if (typeof data === 'boolean' || typeof data === 'number') {
        return String(data);
    }

    if (typeof data === 'string') {
        // Quote strings if they contain special characters or resemble numbers/booleans/null
        if (data === '' || data === '~' || /^\s|\s$|\n/.test(data) || data.match(/^[\d.]+$|^(true|false|null|~)$/i) || /[:#[\]{}*&!|>'"@`%]/.test(data)) {
            return `"${data.replace(/"/g, '\\"')}"`;
        }
        return data;
    }

    if (Array.isArray(data)) {
        if (data.length === 0) return '[]';

        return data.map(item => {
            const itemYaml = convert(item, indentLevel + 1, seenObjects);
            // If item is object, we need special handling to align the hyphen
            if (typeof item === 'object' && item !== null && !Array.isArray(item) && Object.keys(item).length > 0) {
                return `${indent}- ${itemYaml.trimStart()}`;
            }
            return `${indent}- ${itemYaml}`;
        }).join('\n');
    }

    if (typeof data === 'object') {
        // Filter out unsafe keys to prevent prototype pollution
        const keys = Object.keys(data).filter(isSafeKey);
        if (keys.length === 0) return '{}';

        return keys.map(key => {
            const value = data[key];
            const keyStr = key.match(/^[\w\d_]+$/) ? key : `"${key}"`;

            if (typeof value === 'object' && value !== null && Object.keys(value).length > 0) {
                // Nested object or array
                return `${indent}${keyStr}:\n${convert(value, indentLevel + 1, seenObjects)}`;
            } else {
                // Primitive or empty
                return `${indent}${keyStr}: ${convert(value, 0, seenObjects)}`;
            }
        }).join('\n');
    }

    return String(data);
}
