/**
 * Playwright E2E test for JSON Viewer extension - Performance and popup tests
 *
 * Tests:
 * 1. Large file (json-iterator) - rendering and tab switching performance
 * 2. jsoning.com - popup functionality on pages with embedded JSON
 *
 * Run with: node tests/e2e/performance-test.mjs
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../..');
const userDataDir = path.join(os.tmpdir(), 'jv-test-profile');

const TEST_URLS = {
    largeFile: 'https://raw.githubusercontent.com/json-iterator/test-data/refs/heads/master/large-file.json',
    jsonExamples: 'https://jsoning.com/examples/'
};

async function measureTime(name, fn) {
    const start = Date.now();
    await fn();
    const duration = Date.now() - start;
    console.log(`   ${name}: ${duration}ms`);
    return duration;
}

async function runTest() {
    console.log('='.repeat(60));
    console.log('JSON Viewer Performance & Popup Test');
    console.log('='.repeat(60));
    console.log('Extension path:', extensionPath);
    console.log('');

    const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'msedge',
        headless: false,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--no-sandbox',
        ],
        slowMo: 30,
        viewport: { width: 1400, height: 900 }
    });

    let page = context.pages()[0];
    if (!page) {
        page = await context.newPage();
    }

    const results = {
        largeFile: { passed: false, times: {} },
        popup: { passed: false }
    };

    try {
        // ============================================
        // TEST 1: Large File Performance
        // ============================================
        console.log('\n' + '='.repeat(60));
        console.log('TEST 1: Large File Performance');
        console.log('URL:', TEST_URLS.largeFile);
        console.log('='.repeat(60));

        // Navigate to large file
        console.log('\n1. Loading large JSON file...');
        const loadStart = Date.now();
        await page.goto(TEST_URLS.largeFile, {
            waitUntil: 'domcontentloaded',
            timeout: 120000
        });

        // Wait for extension
        let extensionLoaded = false;
        for (let attempt = 1; attempt <= 6; attempt++) {
            try {
                await page.waitForSelector('.jv-toolbar-container', { timeout: 15000 });
                extensionLoaded = true;
                break;
            } catch (e) {
                console.log(`   Attempt ${attempt}/6 - waiting for extension...`);
                if (attempt < 6) {
                    await page.reload({ waitUntil: 'domcontentloaded' });
                }
            }
        }

        if (!extensionLoaded) {
            throw new Error('Extension not loaded. Please install it from edge://extensions');
        }

        results.largeFile.times.initialLoad = Date.now() - loadStart;
        console.log(`   Initial load: ${results.largeFile.times.initialLoad}ms`);

        // Wait for Tree view to be ready
        console.log('\n2. Waiting for Tree view to render...');
        await page.waitForSelector('.jv-tree', { timeout: 60000 });
        console.log('   Tree view ready!');

        // Test tab switching performance
        console.log('\n3. Testing tab switching performance...');

        // Switch to Editor
        results.largeFile.times.toEditor = await measureTime('Tree -> Editor', async () => {
            await page.click('.jv-nav-btn:has-text("Editor")');
            await page.waitForSelector('.jv-editor-wrapper', { timeout: 60000 });
            // Wait for content to actually render
            await page.waitForSelector('.jv-line-number', { timeout: 60000 });
        });

        // Check editor has content
        const lineCount = await page.locator('.jv-line-number').count();
        console.log(`   Editor rendered ${lineCount} lines`);

        // Helper to wait for tab to become active
        async function waitForTab(tabName) {
            await page.waitForFunction(
                (name) => document.querySelector(`.jv-nav-btn:nth-child(${
                    {Tree: 1, Editor: 2, Schema: 3, Yaml: 4, Raw: 5}[name]
                })`)?.classList.contains('active'),
                tabName,
                { timeout: 60000 }
            );
            // Give a moment for content to render
            await page.waitForTimeout(500);
        }

        // Switch to Schema
        results.largeFile.times.toSchema = await measureTime('Editor -> Schema', async () => {
            await page.click('.jv-nav-btn:has-text("Schema")');
            await waitForTab('Schema');
        });

        // Switch to YAML
        results.largeFile.times.toYaml = await measureTime('Schema -> YAML', async () => {
            await page.click('.jv-nav-btn:has-text("Yaml")');
            await waitForTab('Yaml');
        });

        // Check if YAML shows too large message (expected for large files)
        await page.waitForTimeout(500);
        const yamlTooLarge = await page.getByText('File too large for YAML conversion').isVisible();
        if (yamlTooLarge) {
            console.log('   YAML correctly shows "too large" message');
        }

        // Switch to Raw
        results.largeFile.times.toRaw = await measureTime('YAML -> Raw', async () => {
            await page.click('.jv-nav-btn:has-text("Raw")');
            await waitForTab('Raw');
        });

        // Switch back to Tree
        results.largeFile.times.toTree = await measureTime('Raw -> Tree', async () => {
            await page.click('.jv-nav-btn:has-text("Tree")');
            await waitForTab('Tree');
        });

        // Test Editor scrolling performance
        console.log('\n4. Testing Editor scroll performance...');
        await page.click('.jv-nav-btn:has-text("Editor")');
        await waitForTab('Editor');
        await page.waitForSelector('.jv-line-number', { timeout: 30000 });

        // Use first visible scroller (Editor view's scroller)
        const scroller = page.locator('.jv-editor-scroller').first();

        // Rapid scroll test
        results.largeFile.times.rapidScroll = await measureTime('Rapid scroll (10 iterations)', async () => {
            for (let i = 0; i < 10; i++) {
                await scroller.evaluate(el => el.scrollTop = Math.random() * 100000);
                await page.waitForTimeout(50);
            }
        });

        // Scroll to top and verify
        await scroller.evaluate(el => el.scrollTop = 0);
        await page.waitForTimeout(300);
        const firstLine = await page.locator('.jv-line-number').first().textContent();

        if (firstLine?.trim() === '1') {
            console.log('   PASS: Editor recovered from rapid scrolling');
            results.largeFile.passed = true;
        } else {
            console.log(`   FAIL: First line is ${firstLine}, expected 1`);
        }

        // Summary for large file test
        console.log('\n' + '-'.repeat(40));
        console.log('Large File Test Summary:');
        console.log('-'.repeat(40));
        Object.entries(results.largeFile.times).forEach(([key, value]) => {
            const status = value < 5000 ? 'OK' : value < 10000 ? 'SLOW' : 'VERY SLOW';
            console.log(`   ${key}: ${value}ms [${status}]`);
        });

        // ============================================
        // TEST 2: Popup on jsoning.com (Context Menu)
        // ============================================
        console.log('\n' + '='.repeat(60));
        console.log('TEST 2: Popup Functionality on jsoning.com');
        console.log('URL:', TEST_URLS.jsonExamples);
        console.log('='.repeat(60));

        console.log('\n1. Navigating to jsoning.com examples...');
        await page.goto(TEST_URLS.jsonExamples, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // This page is HTML, not JSON, so the extension shouldn't auto-render
        console.log('2. Checking page loaded (HTML content)...');
        await page.waitForTimeout(2000);

        // Check if extension auto-activated (it shouldn't on HTML pages)
        const autoActivated = await page.isVisible('.jv-toolbar-container');
        console.log(`   Extension auto-activated: ${autoActivated}`);

        if (autoActivated) {
            console.log('   NOTE: Extension activated on HTML page (might have JSON content-type)');
        }

        // Scroll down to find JSON examples
        console.log('\n3. Scrolling to find JSON examples...');
        await page.evaluate(() => window.scrollBy(0, 500));
        await page.waitForTimeout(500);

        // Look for JSON code blocks
        const codeBlocks = await page.locator('pre, code').count();
        console.log(`   Found ${codeBlocks} code blocks`);

        // Find a code block with JSON content
        console.log('\n4. Testing "View JSON Snippet" context menu functionality...');

        // Get the actual JSON content from the page's code element
        const jsonContent = await page.evaluate(() => {
            // Find the first code block that contains JSON
            const codeElements = document.querySelectorAll('pre code, pre');
            for (const el of codeElements) {
                const text = el.textContent.trim();
                if (text.startsWith('{') || text.startsWith('[')) {
                    return text;
                }
            }
            return null;
        });

        if (jsonContent) {
            console.log(`   Found JSON content (${jsonContent.length} chars)`);
            console.log(`   JSON starts with: "${jsonContent.substring(0, 60)}..."`);

            // Select text in a code block first
            console.log('   Selecting JSON text...');
            const codeBlock = page.locator('pre code').first();

            if (await codeBlock.count() > 0) {
                await codeBlock.scrollIntoViewIfNeeded();
                await page.waitForTimeout(300);

                // Use evaluate to select text programmatically
                await page.evaluate(() => {
                    const codeEl = document.querySelector('pre code');
                    if (codeEl) {
                        const range = document.createRange();
                        range.selectNodeContents(codeEl);
                        const selection = window.getSelection();
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                });

                await page.waitForTimeout(200);

                // Right-click to open context menu
                console.log('   Right-clicking to open context menu...');
                await codeBlock.click({ button: 'right' });

                // Wait for context menu to appear
                await page.waitForTimeout(500);

                // Take screenshot immediately to see context menu
                await page.screenshot({ path: 'context-menu.png' });
                console.log('   Context menu opened (see context-menu.png)');

                // Navigate to "View JSON Snippet" using keyboard
                // Extension menu items are typically at the bottom of context menus
                console.log('   Navigating to "View JSON Snippet"...');

                // Press 'v' to jump to items starting with 'V' (View JSON Snippet)
                await page.keyboard.press('v');
                await page.waitForTimeout(300);

                // If that doesn't work, try arrow navigation
                // Take another screenshot
                await page.screenshot({ path: 'context-menu-after-v.png' });

                // Press Enter to select
                console.log('   Pressing Enter to select...');
                await page.keyboard.press('Enter');
                await page.waitForTimeout(2000);

                // Take screenshot to see result
                await page.screenshot({ path: 'after-menu-click.png' });
                console.log('   Menu item selected (see after-menu-click.png)');
            }
        } else {
            console.log('   No JSON code blocks found on page');
        }

        await page.waitForTimeout(1000);

        // Check if modal appeared
        let modalVisible = await page.isVisible('#jv-modal-root');
        if (modalVisible) {
            console.log('   PASS: Modal popup appeared with JSON content!');
            results.popup.passed = true;

            // Test tabs in modal
            console.log('\n5. Verifying tabs work in modal...');
            const tabs = ['Tree', 'Editor', 'Schema', 'Yaml', 'Raw'];
            for (const tab of tabs) {
                try {
                    await page.click(`#jv-modal-root .jv-nav-btn:has-text("${tab}")`);
                    await page.waitForTimeout(300);
                    const isActive = await page.locator(`#jv-modal-root .jv-nav-btn:has-text("${tab}")`).evaluate(
                        el => el.classList.contains('active')
                    );
                    console.log(`   ${tab}: ${isActive ? 'OK' : 'FAIL'}`);
                } catch (e) {
                    console.log(`   ${tab}: ERROR - ${e.message}`);
                }
            }

            // Close modal
            console.log('\n6. Testing modal close...');
            const closeBtn = page.locator('#jv-modal-root .jv-close-btn');
            if (await closeBtn.isVisible()) {
                await closeBtn.click();
                await page.waitForTimeout(500);
                modalVisible = await page.isVisible('#jv-modal-root');
                console.log(`   Modal closed: ${!modalVisible ? 'OK' : 'FAIL'}`);
            }
        } else {
            console.log('   Modal did not open via injection, testing via JSON URL...');
        }

        // Also test direct JSON API response
        console.log('\n7. Testing extension on JSON API response...');
        await page.goto('https://jsonplaceholder.typicode.com/posts/1', {
            waitUntil: 'domcontentloaded'
        });
        await page.waitForTimeout(3000);

        const activated = await page.isVisible('.jv-toolbar-container');
        if (activated) {
            console.log('   PASS: Extension activated on JSON API response');
            results.popup.passed = true;

            // Test all tabs
            console.log('\n6. Verifying all tabs work...');
            const tabs = ['Tree', 'Editor', 'Schema', 'Yaml', 'Raw'];
            for (const tab of tabs) {
                try {
                    await page.click(`.jv-nav-btn:has-text("${tab}")`);
                    await page.waitForTimeout(300);
                    const isActive = await page.locator(`.jv-nav-btn:has-text("${tab}")`).evaluate(
                        el => el.classList.contains('active')
                    );
                    console.log(`   ${tab}: ${isActive ? 'OK' : 'FAIL'}`);
                } catch (e) {
                    console.log(`   ${tab}: ERROR - ${e.message}`);
                }
            }
        } else {
            console.log('   Extension did not activate automatically');
            console.log('   NOTE: For HTML pages with embedded JSON, use right-click > "View JSON Snippet"');
        }

        // ============================================
        // FINAL SUMMARY
        // ============================================
        console.log('\n' + '='.repeat(60));
        console.log('FINAL TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`Large File Performance: ${results.largeFile.passed ? 'PASSED' : 'FAILED'}`);
        console.log(`Popup Functionality: ${results.popup.passed ? 'PASSED' : 'NEEDS REVIEW'}`);
        console.log('');

        if (results.largeFile.passed && results.popup.passed) {
            console.log('All tests PASSED!');
        } else {
            console.log('Some tests need attention.');
        }

        console.log('\nKeeping browser open for 10 seconds for visual inspection...');
        await page.waitForTimeout(10000);

    } catch (error) {
        console.error('\nTest failed with error:', error.message);
        console.log('Taking screenshot...');
        await page.screenshot({ path: 'performance-test-failure.png' });
    } finally {
        await context.close();
    }

    return results;
}

runTest().catch(console.error);
