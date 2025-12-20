/**
 * Playwright E2E test for JSON Viewer extension - Popup/Context Menu test
 *
 * Tests the "View JSON Snippet" context menu functionality on jsoning.com
 *
 * NOTE: This test requires manual interaction to click the context menu item.
 * When the browser pauses, click "View JSON Snippet" in the context menu,
 * then click "Resume" in the Playwright Inspector.
 *
 * Run with: PWDEBUG=1 node tests/e2e/popup-test.mjs
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../..');
const userDataDir = path.join(os.tmpdir(), 'jv-test-profile');

const TEST_URL = 'https://jsoning.com/examples/';

async function runTest() {
    console.log('='.repeat(60));
    console.log('JSON Viewer Popup/Context Menu Test');
    console.log('='.repeat(60));
    console.log('Extension path:', extensionPath);
    console.log('URL:', TEST_URL);
    console.log('');

    const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'msedge',
        headless: false,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--no-sandbox',
        ],
        slowMo: 50,
        viewport: { width: 1400, height: 900 }
    });

    let page = context.pages()[0];
    if (!page) {
        page = await context.newPage();
    }

    try {
        // Navigate to jsoning.com
        console.log('\n1. Navigating to jsoning.com examples...');
        await page.goto(TEST_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await page.waitForTimeout(2000);

        // Scroll down to find JSON examples
        console.log('2. Scrolling to find JSON examples...');
        await page.evaluate(() => window.scrollBy(0, 300));
        await page.waitForTimeout(500);

        // Find JSON code blocks
        const codeBlocks = await page.locator('pre, code').count();
        console.log(`   Found ${codeBlocks} code blocks`);

        // Get the JSON content
        const jsonContent = await page.evaluate(() => {
            const codeElements = document.querySelectorAll('pre code, pre');
            for (const el of codeElements) {
                const text = el.textContent.trim();
                if (text.startsWith('{') || text.startsWith('[')) {
                    return text;
                }
            }
            return null;
        });

        if (!jsonContent) {
            throw new Error('No JSON code blocks found on page');
        }

        console.log(`\n3. Found JSON content (${jsonContent.length} chars)`);
        console.log(`   Preview: "${jsonContent.substring(0, 60)}..."`);

        // Select JSON text
        console.log('\n4. Selecting JSON text...');
        const codeBlock = page.locator('pre code').first();

        if (await codeBlock.count() === 0) {
            throw new Error('No code block found');
        }

        await codeBlock.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);

        // Select text programmatically
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
        console.log('\n5. Right-clicking to open context menu...');
        console.log('   NOTE: Browser will pause - manually click "View JSON Snippet" in the context menu');
        console.log('   Then click "Resume" in Playwright Inspector to continue the test');
        console.log('');

        await codeBlock.click({ button: 'right' });

        // Pause for manual interaction - user needs to click "View JSON Snippet"
        await page.pause();

        // After resume, wait a bit for modal to appear
        await page.waitForTimeout(1000);

        await page.screenshot({ path: 'after-menu-click.png' });

        // Check if modal appeared
        console.log('\n7. Checking for modal...');
        let modalVisible = await page.isVisible('#jv-modal-root');

        if (modalVisible) {
            console.log('   SUCCESS: Modal popup appeared!');

            // Test tabs in modal
            console.log('\n8. Testing tabs in modal...');
            const tabs = ['Tree', 'Editor', 'Schema', 'Yaml', 'Raw'];
            for (const tab of tabs) {
                try {
                    await page.click(`#jv-modal-root .jv-nav-btn:has-text("${tab}")`);
                    await page.waitForTimeout(400);
                    const isActive = await page.locator(`#jv-modal-root .jv-nav-btn:has-text("${tab}")`).evaluate(
                        el => el.classList.contains('active')
                    );
                    console.log(`   ${tab}: ${isActive ? 'OK' : 'FAIL'}`);
                } catch (e) {
                    console.log(`   ${tab}: ERROR`);
                }
            }

            // Test close button
            console.log('\n9. Testing close button...');
            const closeBtn = page.locator('#jv-modal-root .jv-close-btn');
            if (await closeBtn.isVisible()) {
                await closeBtn.click();
                await page.waitForTimeout(500);
                modalVisible = await page.isVisible('#jv-modal-root');
                console.log(`   Close button: ${!modalVisible ? 'OK' : 'FAIL'}`);
            }

            console.log('\n=== TEST PASSED ===');
        } else {
            console.log('   Modal did not appear');
            console.log('   Check screenshots: context-menu.png, context-menu-v.png, after-enter.png');
            console.log('\n   TIP: The "View JSON Snippet" option should appear in the context menu');
            console.log('   when text is selected. Make sure the extension is installed.');

            // Let user inspect
            console.log('\n   Keeping browser open for manual testing...');
            console.log('   Try: Select JSON text > Right-click > "View JSON Snippet"');
        }

        console.log('\nKeeping browser open for 15 seconds...');
        await page.waitForTimeout(15000);

    } catch (error) {
        console.error('\nTest failed:', error.message);
        await page.screenshot({ path: 'popup-test-error.png' });
    } finally {
        await context.close();
    }
}

runTest().catch(console.error);
