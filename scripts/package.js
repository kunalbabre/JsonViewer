#!/usr/bin/env node

/**
 * Packaging script for JSON Viewer extension.
 * Creates a zip file ready for Chrome Web Store submission.
 */

import { existsSync, createWriteStream, readdirSync, statSync, readFileSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { createGzip } from 'zlib';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');

// Read version from manifest
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const version = manifest.version;
const zipName = `json-viewer-${version}.zip`;
const zipPath = join(ROOT, zipName);

console.log(`Packaging JSON Viewer v${version}...`);

if (!existsSync(DIST)) {
    console.error('Error: dist/ directory not found. Run "npm run build" first.');
    process.exit(1);
}

// Use system zip command for reliable packaging
try {
    // Remove existing zip if present
    execSync(`rm -f "${zipPath}"`, { cwd: ROOT });

    // Create zip from dist directory
    execSync(`cd "${DIST}" && zip -r "${zipPath}" .`, { stdio: 'inherit' });

    console.log(`\nPackage created: ${zipName}`);

    // Show file size
    const stats = statSync(zipPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`Size: ${sizeMB} MB`);

} catch (error) {
    console.error('Error creating package:', error.message);
    process.exit(1);
}
