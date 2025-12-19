#!/usr/bin/env node

/**
 * Build script for JSON Viewer extension.
 * Copies files to dist/ directory and optionally minifies JS/CSS.
 */

import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');

const args = process.argv.slice(2);
const shouldMinify = args.includes('--minify');

console.log(`Building JSON Viewer extension${shouldMinify ? ' (minified)' : ''}...`);

// Clean and create dist directory
if (existsSync(DIST)) {
    cpSync(DIST, DIST + '.bak', { recursive: true, force: true });
}
mkdirSync(DIST, { recursive: true });

// Files and directories to copy
const filesToCopy = [
    'manifest.json',
    'icons',
    'src',
];

// Copy files
for (const file of filesToCopy) {
    const src = join(ROOT, file);
    const dest = join(DIST, file);

    if (!existsSync(src)) {
        console.warn(`Warning: ${file} not found, skipping`);
        continue;
    }

    cpSync(src, dest, { recursive: true });
    console.log(`Copied: ${file}`);
}

// Simple minification (remove comments and extra whitespace)
if (shouldMinify) {
    console.log('Minifying JavaScript files...');

    function processDirectory(dir) {
        const entries = readdirSync(dir);

        for (const entry of entries) {
            const fullPath = join(dir, entry);
            const stat = statSync(fullPath);

            if (stat.isDirectory()) {
                processDirectory(fullPath);
            } else if (extname(entry) === '.js') {
                let content = readFileSync(fullPath, 'utf8');

                // Remove single-line comments (but preserve URLs)
                content = content.replace(/(?<!:)\/\/(?![\w:]).*$/gm, '');

                // Remove multi-line comments
                content = content.replace(/\/\*[\s\S]*?\*\//g, '');

                // Collapse multiple newlines
                content = content.replace(/\n\s*\n\s*\n/g, '\n\n');

                // Remove leading/trailing whitespace from lines
                content = content.split('\n')
                    .map(line => line.trimEnd())
                    .join('\n');

                writeFileSync(fullPath, content);
            } else if (extname(entry) === '.css') {
                let content = readFileSync(fullPath, 'utf8');

                // Remove CSS comments
                content = content.replace(/\/\*[\s\S]*?\*\//g, '');

                // Collapse whitespace
                content = content.replace(/\s+/g, ' ');
                content = content.replace(/\s*([{};:,>+~])\s*/g, '$1');
                content = content.replace(/;}/g, '}');

                writeFileSync(fullPath, content);
            }
        }
    }

    processDirectory(join(DIST, 'src'));
    console.log('Minification complete');
}

console.log(`\nBuild complete! Output: ${DIST}`);
