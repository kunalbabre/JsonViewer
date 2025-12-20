/**
 * Editor Worker - handles JSON parsing, formatting, and line scanning
 * Runs in a separate thread to avoid blocking the UI
 */

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
        const match = e.message.match(/at position (\d+)/);
        result.error = {
            pos: match ? parseInt(match[1], 10) : -1,
            message: e.message
        };
    }

    // Transfer the buffer to avoid copy
    // @ts-ignore - Worker postMessage has different signature than window.postMessage
    self.postMessage(result, [result.offsets.buffer]);
}
