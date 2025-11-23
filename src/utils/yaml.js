const MAX_YAML_DEPTH = 50; // Maximum depth to prevent stack overflow
const seenObjects = new WeakSet(); // Track circular references

export function jsonToYaml(data) {
    seenObjects.clear = function() { return new WeakSet(); }; // Reset for each conversion
    try {
        return convert(data, 0);
    } catch (e) {
        return `# Error converting to YAML: ${e.message}`;
    }
}

function convert(data, indentLevel) {
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
        // Quote strings if they contain special characters or resemble numbers/booleans
        if (data.match(/^[\d\.]+$|^(true|false|null)$|[:#\[\]\{\}\*&!|>'"]/) || data === '') {
            return `"${data.replace(/"/g, '\\"')}"`;
        }
        return data;
    }

    if (Array.isArray(data)) {
        if (data.length === 0) return '[]';

        return data.map(item => {
            const itemYaml = convert(item, indentLevel + 1);
            // If item is object, we need special handling to align the hyphen
            if (typeof item === 'object' && item !== null && !Array.isArray(item) && Object.keys(item).length > 0) {
                return `${indent}- ${itemYaml.trimStart()}`;
            }
            return `${indent}- ${itemYaml}`;
        }).join('\n');
    }

    if (typeof data === 'object') {
        const keys = Object.keys(data);
        if (keys.length === 0) return '{}';

        return keys.map((key, index) => {
            const value = data[key];
            const keyStr = key.match(/^[\w\d_]+$/) ? key : `"${key}"`;

            if (typeof value === 'object' && value !== null && Object.keys(value).length > 0) {
                // Nested object or array
                return `${indent}${keyStr}:\n${convert(value, indentLevel + 1)}`;
            } else {
                // Primitive or empty
                return `${indent}${keyStr}: ${convert(value, 0)}`;
            }
        }).join('\n');
    }

    return String(data);
}
