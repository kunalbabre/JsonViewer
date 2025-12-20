/**
 * Playwright E2E test for JSON Viewer extension - Editor view with large files
 *
 * Run with: node tests/e2e/editor-test.mjs
 *
 * SETUP: On first run, the browser will open with extension management page.
 * 1. Enable Developer Mode
 * 2. Click "Load unpacked" and select the JsonViewer folder
 * 3. The test will continue automatically
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../..');

// Create a persistent profile directory for the extension
const userDataDir = path.join(os.tmpdir(), 'jv-test-profile');

async function runTest() {
    console.log('Starting JSON Viewer Editor test...');
    console.log('Extension path:', extensionPath);
    console.log('User data dir:', userDataDir);

    // Launch Edge with persistent context for extension support
    const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'msedge',
        headless: false, // Must be false to test extensions
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--no-sandbox',
            '--disable-web-security',
        ],
        slowMo: 50,
        viewport: { width: 1400, height: 900 }
    });

    // Get existing page or create new one
    let page = context.pages()[0];
    if (!page) {
        page = await context.newPage();
    }

    try {
        // Navigate to the 5MB JSON file
        console.log('\n1. Navigating to 5MB JSON file...');
        await page.goto('https://microsoftedge.github.io/Demos/json-dummy-data/5MB-min.json', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Wait for JSON Viewer to initialize - with retry logic
        console.log('2. Waiting for JSON Viewer to load...');
        console.log('   (If extension is not loaded, install it from edge://extensions)');

        let extensionLoaded = false;
        for (let attempt = 1; attempt <= 6; attempt++) {
            try {
                await page.waitForSelector('.jv-toolbar-container', { timeout: 10000 });
                extensionLoaded = true;
                break;
            } catch (e) {
                console.log(`   Attempt ${attempt}/6 - Extension not detected, waiting...`);
                if (attempt === 3) {
                    console.log('\n   TIP: Open edge://extensions in another tab, enable Developer Mode,');
                    console.log('   and "Load unpacked" with path:', extensionPath);
                    console.log('   Then refresh this page.\n');
                }
                // Refresh the page to trigger content script
                if (attempt < 6) {
                    await page.reload({ waitUntil: 'domcontentloaded' });
                }
            }
        }

        if (!extensionLoaded) {
            throw new Error('Extension not loaded after multiple attempts. Please install it manually.');
        }
        console.log('   JSON Viewer loaded!');

        // Check initial view (should be Tree view)
        const activeButton = await page.locator('.jv-nav-btn.active').textContent();
        console.log(`3. Current active view: ${activeButton}`);

        // Click on Editor tab
        console.log('\n4. Switching to Editor view...');
        await page.click('.jv-nav-btn:has-text("Editor")');
        await page.waitForTimeout(1000); // Wait for editor to initialize

        // Wait for editor content to load
        console.log('5. Waiting for Editor content...');
        await page.waitForSelector('.jv-editor-wrapper', { timeout: 30000 });

        // Check if loader is hidden
        const loaderVisible = await page.isVisible('.jv-editor-loader');
        console.log(`   Loader visible: ${loaderVisible}`);

        // Wait for content to appear
        await page.waitForSelector('.jv-editor-code', { timeout: 30000 });
        console.log('   Editor content loaded!');

        // Get initial line numbers
        const lineNumbers = await page.locator('.jv-line-number').count();
        console.log(`6. Initial line numbers rendered: ${lineNumbers}`);

        // Get first visible line number
        const firstLine = await page.locator('.jv-line-number').first().textContent();
        console.log(`   First visible line: ${firstLine}`);

        // Test scrolling - scroll down
        console.log('\n7. Testing scroll down...');
        const scroller = page.locator('.jv-editor-scroller');

        // Scroll down by 2000 pixels
        await scroller.evaluate(el => el.scrollTop = 2000);
        await page.waitForTimeout(500);

        const afterScrollDown = await page.locator('.jv-line-number').first().textContent();
        console.log(`   After scroll down - First visible line: ${afterScrollDown}`);

        // Scroll down more
        await scroller.evaluate(el => el.scrollTop = 10000);
        await page.waitForTimeout(500);

        const afterMoreScroll = await page.locator('.jv-line-number').first().textContent();
        console.log(`   After more scroll - First visible line: ${afterMoreScroll}`);

        // Test fast scroll back to top
        console.log('\n8. Testing fast scroll to top...');
        await scroller.evaluate(el => el.scrollTop = 0);
        await page.waitForTimeout(500);

        const afterScrollTop = await page.locator('.jv-line-number').first().textContent();
        console.log(`   After scroll to top - First visible line: ${afterScrollTop}`);

        // Verify first line is 1
        if (afterScrollTop.trim() === '1') {
            console.log('   PASS: First line is correctly 1');
        } else {
            console.log(`   FAIL: First line should be 1, got ${afterScrollTop}`);
        }

        // Check content alignment - first code line should start with content
        const firstCodeLine = await page.locator('.jv-editor-code > span').first().textContent();
        console.log(`\n9. First code line content: "${firstCodeLine?.substring(0, 50)}..."`);

        // Test rapid scrolling
        console.log('\n10. Testing rapid scroll sequence...');
        for (let i = 0; i < 5; i++) {
            await scroller.evaluate(el => el.scrollTop = Math.random() * 50000);
            await page.waitForTimeout(100);
        }

        // Scroll back to top
        await scroller.evaluate(el => el.scrollTop = 0);
        await page.waitForTimeout(300);

        const finalFirstLine = await page.locator('.jv-line-number').first().textContent();
        console.log(`    After rapid scroll - First line: ${finalFirstLine}`);

        if (finalFirstLine.trim() === '1') {
            console.log('    PASS: Editor recovered correctly from rapid scrolling');
        } else {
            console.log(`    FAIL: Expected line 1, got ${finalFirstLine}`);
        }

        // Test line number alignment with content
        console.log('\n11. Checking line number alignment...');
        const gutterTop = await page.locator('.jv-editor-gutter').evaluate(el => {
            const lineNum = el.querySelector('.jv-line-number');
            return lineNum ? lineNum.getBoundingClientRect().top : null;
        });
        const codeTop = await page.locator('.jv-editor-code').evaluate(el => {
            const line = el.querySelector('span');
            return line ? line.getBoundingClientRect().top : null;
        });

        if (gutterTop && codeTop) {
            const diff = Math.abs(gutterTop - codeTop);
            console.log(`    Gutter top: ${gutterTop}, Code top: ${codeTop}, Diff: ${diff}px`);
            if (diff < 5) {
                console.log('    PASS: Line numbers aligned with code');
            } else {
                console.log('    WARNING: Line numbers may be misaligned');
            }
        }

        console.log('\n=== Test Complete ===');
        console.log('Keeping browser open for 10 seconds for visual inspection...');
        await page.waitForTimeout(10000);

    } catch (error) {
        console.error('\nTest failed with error:', error.message);
        console.log('Taking screenshot...');
        await page.screenshot({ path: 'test-failure.png' });
    } finally {
        await context.close();
    }
}

runTest().catch(console.error);
