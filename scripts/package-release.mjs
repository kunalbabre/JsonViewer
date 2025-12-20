#!/usr/bin/env node
/**
 * Release Packaging Script for JSON Viewer
 *
 * This script:
 * 1. Generates documentation and screenshots (npm run doc)
 * 2. Bumps the manifest version by 0.01 from last committed version
 * 3. Packages the extension using package.sh or package.ps1
 *
 * Run with: npm run package
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'manifest.json');
const packageJsonPath = path.join(rootDir, 'package.json');

function log(msg) {
    console.log(`\x1b[36m${msg}\x1b[0m`);
}

function success(msg) {
    console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
}

function error(msg) {
    console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
}

function runCommand(cmd, description) {
    log(`\n${description}...`);
    try {
        execSync(cmd, { stdio: 'inherit', cwd: rootDir });
        return true;
    } catch (e) {
        error(`Failed: ${description}`);
        return false;
    }
}

function getLastCommittedVersion() {
    try {
        // Get the manifest.json content from the last commit
        const committedManifest = execSync('git show HEAD:manifest.json', {
            cwd: rootDir,
            encoding: 'utf-8'
        });
        const manifest = JSON.parse(committedManifest);
        return manifest.version;
    } catch (e) {
        // If no committed version, read current
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        return manifest.version;
    }
}

function bumpVersion(currentVersion) {
    // Parse version as float and add 0.01
    const parts = currentVersion.split('.');
    if (parts.length === 3) {
        // Format: major.minor.patch -> bump patch
        const major = parseInt(parts[0], 10);
        const minor = parseInt(parts[1], 10);
        const patch = parseInt(parts[2], 10) + 1;
        return `${major}.${minor}.${patch}`;
    } else if (parts.length === 2) {
        // Format: major.minor -> add 0.01
        const num = parseFloat(currentVersion);
        const newNum = num + 0.01;
        // Fix floating point precision issues
        return newNum.toFixed(2).replace(/\.?0+$/, '') || newNum.toFixed(1);
    }
    // Fallback: just increment last number
    const num = parseFloat(currentVersion);
    return (num + 0.01).toFixed(2);
}

function updateManifestVersion(newVersion) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const oldVersion = manifest.version;
    manifest.version = newVersion;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    return oldVersion;
}

function updatePackageJsonVersion(newVersion) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    packageJson.version = newVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
}

function getPackageScript() {
    const isWindows = process.platform === 'win32';
    if (isWindows) {
        const ps1Path = path.join(rootDir, 'package.ps1');
        if (fs.existsSync(ps1Path)) {
            return 'powershell -ExecutionPolicy Bypass -File package.ps1';
        }
    } else {
        const shPath = path.join(rootDir, 'package.sh');
        if (fs.existsSync(shPath)) {
            return 'bash package.sh';
        }
    }
    return null;
}

async function main() {
    console.log('='.repeat(60));
    console.log('JSON Viewer - Release Packaging');
    console.log('='.repeat(60));

    // Step 1: Generate documentation
    log('\n📸 STEP 1: Generate Documentation & Screenshots');
    if (!runCommand('npm run doc', 'Generating docs')) {
        error('Documentation generation failed. Aborting.');
        process.exit(1);
    }
    success('Documentation generated');

    // Step 2: Bump version
    log('\n📦 STEP 2: Bump Version');
    const lastVersion = getLastCommittedVersion();
    const newVersion = bumpVersion(lastVersion);

    console.log(`  Last committed version: ${lastVersion}`);
    console.log(`  New version: ${newVersion}`);

    const oldVersion = updateManifestVersion(newVersion);
    updatePackageJsonVersion(newVersion);

    success(`Version bumped: ${oldVersion} → ${newVersion}`);

    // Step 3: Package extension
    log('\n🎁 STEP 3: Package Extension');
    const packageCmd = getPackageScript();

    if (!packageCmd) {
        error('No package script found (package.sh or package.ps1)');
        process.exit(1);
    }

    console.log(`  Using: ${packageCmd}`);

    if (!runCommand(packageCmd, 'Creating extension package')) {
        error('Packaging failed');
        process.exit(1);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('RELEASE PACKAGE READY');
    console.log('='.repeat(60));
    success(`Version: ${newVersion}`);
    success(`Package: json-viewer-extension.zip`);

    console.log('\nStore assets location:');
    console.log('  docs/store/screenshot-*.png (1280x800)');
    console.log('  docs/store/promo-small-440x280.png');
    console.log('  docs/store/promo-marquee-1400x560.png');

    console.log('\nNext steps:');
    console.log('  1. Review the generated screenshots');
    console.log('  2. Test the packaged extension');
    console.log('  3. git add . && git commit -m "Release v' + newVersion + '"');
    console.log('  4. Upload to Chrome Web Store');
}

main().catch(e => {
    error(e.message);
    process.exit(1);
});
