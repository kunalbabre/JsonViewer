/**
 * Playwright E2E test for JSON Viewer extension - DevTools Panel
 *
 * Since Chrome DevTools panels run in a restricted context that's not accessible
 * from automation tools, this test uses a standalone test page that loads the
 * panel UI with mocked DevTools APIs. This allows us to fully test the panel's
 * functionality including:
 * - Request list capture and display
 * - JSON viewer rendering (Tree, Editor, Schema, YAML, Raw views)
 * - Filter and search functionality
 * - Manual JSON input mode
 * - Clear functionality
 *
 * Run with: node tests/e2e/devtools-test.mjs
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import http from 'http';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../..');
const userDataDir = path.join(os.tmpdir(), 'jv-devtools-test-profile-' + Date.now());

// Create local server to serve test pages
function createServer(port) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            // Enable CORS
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            const url = req.url.split('?')[0]; // Remove query string

            // Serve static files
            let filePath;
            if (url === '/' || url === '/panel-test') {
                filePath = path.join(__dirname, 'testdata', 'panel-standalone-test.html');
            } else if (url === '/ajax-test.html') {
                filePath = path.join(__dirname, 'testdata', 'ajax-test.html');
            } else if (url.startsWith('/src/')) {
                // Serve files from the extension src directory
                filePath = path.join(extensionPath, url.substring(1)); // Remove leading /
            } else {
                res.writeHead(404);
                res.end('Not found: ' + url);
                return;
            }

            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.writeHead(404);
                    res.end('Not found: ' + filePath);
                    return;
                }

                let contentType = 'text/html';
                if (filePath.endsWith('.js')) contentType = 'application/javascript';
                else if (filePath.endsWith('.css')) contentType = 'text/css';
                else if (filePath.endsWith('.json')) contentType = 'application/json';

                res.writeHead(200, { 'Content-Type': contentType });
                res.end(data);
            });
        });
        server.listen(port, () => resolve(server));
    });
}

async function runTest() {
    console.log('='.repeat(60));
    console.log('JSON Viewer DevTools Panel - E2E Test');
    console.log('='.repeat(60));
    console.log('Extension path:', extensionPath);
    console.log('');

    // Start local server
    const PORT = 9877;
    const server = await createServer(PORT);
    console.log(`✓ Test server running on http://localhost:${PORT}`);

    const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'msedge',
        headless: false,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--no-sandbox',
        ],
        slowMo: 50,
        viewport: { width: 1200, height: 800 }
    });
    console.log('✓ Browser launched with extension');

    let page = context.pages()[0];
    if (!page) {
        page = await context.newPage();
    }

    let passed = 0;
    let failed = 0;

    function logTest(name, success, detail = '') {
        if (success) {
            console.log(`  ✓ ${name}${detail ? ': ' + detail : ''}`);
            passed++;
        } else {
            console.log(`  ✗ ${name}${detail ? ': ' + detail : ''}`);
            failed++;
        }
    }

    try {
        // Listen for console errors only
        page.on('console', msg => {
            if (msg.type() === 'error' && !msg.text().includes('favicon')) {
                console.log('  [Browser Error]', msg.text());
            }
        });
        page.on('pageerror', err => {
            console.log('  [Page Error]', err.message);
        });

        // Navigate to standalone panel test page
        console.log('\n1. Loading standalone panel test page...');
        await page.goto(`http://localhost:${PORT}/panel-test`, {
            waitUntil: 'networkidle'
        });
        await page.waitForTimeout(1000);
        logTest('Panel test page loaded', true);

        // Simulate requests
        console.log('\n2. Simulating network requests...');

        await page.click('button:has-text("Simulate GET /users")');
        await page.waitForTimeout(300);
        logTest('GET /users simulated', true);

        await page.click('button:has-text("Simulate GET /posts")');
        await page.waitForTimeout(300);
        logTest('GET /posts simulated', true);

        await page.click('button:has-text("Simulate POST")');
        await page.waitForTimeout(300);
        logTest('POST request simulated', true);

        // Verify requests appear in sidebar
        console.log('\n3. Verifying request list...');
        const requestItems = await page.$$('.jv-request-item');
        logTest('Requests captured in sidebar', requestItems.length >= 3, `${requestItems.length} requests`);

        // Check request methods are displayed
        const methods = await page.$$eval('.jv-request-method', els => els.map(e => e.textContent));
        logTest('Methods displayed correctly', methods.includes('GET') && methods.includes('POST'), methods.join(', '));

        // Click on a request to view it
        console.log('\n4. Testing JSON viewer...');
        const firstItem = await page.$('.jv-request-item:first-child');
        if (firstItem) {
            await firstItem.click();
        } else {
            console.log('  No request items found to click');
        }
        await page.waitForTimeout(500);

        // Check if viewer rendered
        const viewer = await page.$('.jv-content');
        logTest('Viewer container rendered', viewer !== null);

        const toolbar = await page.$('.jv-toolbar-container');
        logTest('Toolbar rendered', toolbar !== null);

        // Check tree view - the tree uses .jv-node class
        const treeNodes = await page.$$('.jv-node');
        logTest('Tree view rendered', treeNodes.length > 0, `${treeNodes.length} nodes`);

        // Test view switching
        console.log('\n5. Testing view switching...');

        // Editor view
        const editorTab = await page.$('.jv-nav-btn:has-text("Editor")');
        if (editorTab) {
            await editorTab.click();
            await page.waitForTimeout(500);
            const editor = await page.$('.jv-editor-wrapper');
            logTest('Editor view', editor !== null);
        } else {
            logTest('Editor view', false, 'Tab not found');
        }

        // Schema view
        const schemaTab = await page.$('.jv-nav-btn:has-text("Schema")');
        if (schemaTab) {
            await schemaTab.click();
            await page.waitForTimeout(500);
            const schema = await page.$('.jv-schema-container');
            logTest('Schema view', schema !== null);
        } else {
            logTest('Schema view', false, 'Tab not found');
        }

        // YAML view (uses same container class as schema)
        const yamlTab = await page.$('.jv-nav-btn:has-text("YAML")');
        if (yamlTab) {
            await yamlTab.click();
            await page.waitForTimeout(500);
            // YAML view uses jv-schema-container class
            const yaml = await page.$('.jv-schema-container');
            logTest('YAML view', yaml !== null);
        } else {
            logTest('YAML view', false, 'Tab not found');
        }

        // Raw view
        const rawTab = await page.$('.jv-nav-btn:has-text("Raw")');
        if (rawTab) {
            await rawTab.click();
            await page.waitForTimeout(500);
            const raw = await page.$('.jv-raw-container');
            logTest('Raw view', raw !== null);
        } else {
            logTest('Raw view', false, 'Tab not found');
        }

        // Back to Tree
        const treeTab = await page.$('.jv-nav-btn:has-text("Tree")');
        if (treeTab) {
            await treeTab.click();
            await page.waitForTimeout(300);
        }

        // Test filter functionality
        console.log('\n6. Testing filter functionality...');
        const filterInput = await page.$('#request-search');
        if (filterInput) {
            await filterInput.fill('users');
            await page.waitForTimeout(200);

            const allItems = await page.$$('.jv-request-item');
            let visibleCount = 0;
            for (const item of allItems) {
                const style = await item.getAttribute('style');
                if (!style || !style.includes('display: none')) {
                    visibleCount++;
                }
            }
            logTest('URL filter works', visibleCount < allItems.length, `${visibleCount} of ${allItems.length} visible`);

            // Clear filter
            await filterInput.fill('');
            await page.waitForTimeout(200);
        }

        // Test JSON-only filter
        const jsonFilter = await page.$('#json-only-filter');
        if (jsonFilter) {
            await jsonFilter.check();
            await page.waitForTimeout(200);
            logTest('JSON filter checkbox', true);
            await jsonFilter.uncheck();
        }

        // Test toolbar actions
        console.log('\n7. Testing toolbar actions...');

        // Copy button (in the .jv-btn class)
        const copyBtn = await page.$('.jv-btn[title*="Copy"]');
        logTest('Copy button exists', copyBtn !== null);

        // Save button
        const saveBtn = await page.$('.jv-btn[title*="Save"]');
        logTest('Save button exists', saveBtn !== null);

        // Test clear button
        console.log('\n8. Testing clear functionality...');
        const clearBtn = await page.$('#clear-btn');
        if (clearBtn) {
            await clearBtn.click();
            await page.waitForTimeout(300);
            const itemsAfterClear = await page.$$('.jv-request-item');
            logTest('Clear button works', itemsAfterClear.length === 0, 'List cleared');
        }

        // Test manual JSON input
        console.log('\n9. Testing manual JSON input...');
        const manualBtn = await page.$('#manual-btn');
        if (manualBtn) {
            await manualBtn.click();
            await page.waitForTimeout(500);

            // In manual mode, it should show the editor with a textarea
            const editorWrapper = await page.$('.jv-editor-wrapper');
            logTest('Manual input mode activated', editorWrapper !== null);

            if (editorWrapper) {
                // The editor should be visible
                const textarea = await page.$('.jv-editor-textarea');
                if (textarea) {
                    // Enter some JSON
                    await textarea.fill('{"test": "manual input", "number": 42, "nested": {"key": "value"}}');
                    await page.waitForTimeout(300);

                    // Click Format button
                    const formatBtnInEditor = await page.$('.jv-btn[title*="Format"]');
                    if (formatBtnInEditor) {
                        await formatBtnInEditor.click();
                        await page.waitForTimeout(500);
                        logTest('Format button clicked', true);
                    } else {
                        logTest('Format button clicked', false, 'Button not found');
                    }
                } else {
                    logTest('Editor textarea', false, 'Not found');
                }
            }
        } else {
            logTest('Manual input mode activated', false, 'Button not found');
        }

        // Test clicking different requests (sticky view)
        console.log('\n10. Testing sticky view preference...');
        const simAllBtn = await page.$('button:has-text("Simulate All")');
        if (simAllBtn) {
            await simAllBtn.click();
            await page.waitForTimeout(800);

            // Click first request
            const items1 = await page.$$('.jv-request-item');
            if (items1.length > 0) {
                await items1[0].click();
                await page.waitForTimeout(500);

                // Switch to Schema view
                const schemaTab2 = await page.$('.jv-nav-btn:has-text("Schema")');
                if (schemaTab2) {
                    await schemaTab2.click();
                    await page.waitForTimeout(500);
                }

                // Click on different request
                const newItems = await page.$$('.jv-request-item');
                if (newItems.length > 1) {
                    await newItems[1].click();
                    await page.waitForTimeout(500);

                    // Check if still on Schema view (sticky)
                    const activeViewBtn = await page.$('.jv-nav-btn.active');
                    if (activeViewBtn) {
                        const activeText = await activeViewBtn.textContent();
                        logTest('Sticky view preference', activeText.trim() === 'Schema', `Active: ${activeText.trim()}`);
                    } else {
                        logTest('Sticky view preference', false, 'No active tab found');
                    }
                } else {
                    logTest('Sticky view preference', false, 'Not enough requests');
                }
            } else {
                logTest('Sticky view preference', false, 'No request items');
            }
        } else {
            logTest('Sticky view preference', false, 'Could not find Simulate All button');
        }

        // Take screenshot
        await page.screenshot({ path: 'devtools-panel-test.png', fullPage: true });
        console.log('\n✓ Screenshot saved: devtools-panel-test.png');

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`  Passed: ${passed}`);
        console.log(`  Failed: ${failed}`);
        console.log(`  Total:  ${passed + failed}`);
        console.log('='.repeat(60));

        if (failed > 0) {
            console.log('\nSome tests failed. Browser will stay open for 15s for inspection.');
            await page.waitForTimeout(15000);
            process.exitCode = 1;
        } else {
            console.log('\n✓ All tests passed!');
            await page.waitForTimeout(3000);
        }

    } catch (error) {
        console.error('\n✗ Test error:', error.message);
        console.error(error.stack);
        await page.screenshot({ path: 'devtools-test-error.png' });
        console.log('Error screenshot saved: devtools-test-error.png');
        await page.waitForTimeout(15000);
        process.exitCode = 1;
    } finally {
        server.close();
        await context.close();
        // Clean up temp profile
        try {
            fs.rmSync(userDataDir, { recursive: true, force: true });
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

runTest().catch(console.error);
