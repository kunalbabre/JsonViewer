/**
 * Capture screenshots of JSON Viewer extension for UI analysis
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../..');
const userDataDir = path.join(os.tmpdir(), 'jv-test-profile');
const screenshotDir = path.join(extensionPath, 'screenshots');

// Create screenshots directory
if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
}

async function captureScreenshots() {
    console.log('Capturing UI screenshots for analysis...\n');

    const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'msedge',
        headless: false,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--no-sandbox',
        ],
        viewport: { width: 1400, height: 900 }
    });

    let page = context.pages()[0] || await context.newPage();

    try {
        // Load JSON data
        console.log('Loading JSON file...');
        await page.goto('https://jsonplaceholder.typicode.com/users', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Wait for extension
        for (let i = 0; i < 5; i++) {
            try {
                await page.waitForSelector('.jv-toolbar-container', { timeout: 5000 });
                break;
            } catch {
                await page.reload({ waitUntil: 'domcontentloaded' });
            }
        }
        await page.waitForTimeout(1000);

        // Screenshot 1: Tree View (default) - Light Theme
        console.log('1. Tree View (Light Theme)...');
        await page.screenshot({ path: path.join(screenshotDir, '01-tree-view-light.png') });

        // Screenshot 2: Tree View Expanded
        console.log('2. Tree View Expanded...');
        const expandBtn = page.locator('.jv-btn:has-text("Expand")');
        if (await expandBtn.isVisible()) {
            await expandBtn.click();
            await page.waitForTimeout(500);
        }
        await page.screenshot({ path: path.join(screenshotDir, '02-tree-expanded.png') });

        // Screenshot 3: Editor View
        console.log('3. Editor View...');
        await page.click('.jv-nav-btn:has-text("Editor")');
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(screenshotDir, '03-editor-view.png') });

        // Screenshot 4: Schema View
        console.log('4. Schema View...');
        await page.click('.jv-nav-btn:has-text("Schema")');
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(screenshotDir, '04-schema-view.png') });

        // Screenshot 5: YAML View
        console.log('5. YAML View...');
        await page.click('.jv-nav-btn:has-text("Yaml")');
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(screenshotDir, '05-yaml-view.png') });

        // Screenshot 6: Raw View
        console.log('6. Raw View...');
        await page.click('.jv-nav-btn:has-text("Raw")');
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(screenshotDir, '06-raw-view.png') });

        // Screenshot 7: Search Active
        console.log('7. Search with Results...');
        await page.click('.jv-nav-btn:has-text("Tree")');
        await page.waitForTimeout(500);
        const searchInput = page.locator('.jv-search');
        await searchInput.fill('email');
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(screenshotDir, '07-search-results.png') });

        // Screenshot 8: Dark Theme - Tree View
        console.log('8. Dark Theme - Tree View...');
        await searchInput.fill('');
        await page.waitForTimeout(300);
        const themeBtn = page.locator('.jv-btn.jv-icon-only').last();
        await themeBtn.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(screenshotDir, '08-tree-dark.png') });

        // Screenshot 9: Dark Theme - Editor View
        console.log('9. Dark Theme - Editor View...');
        await page.click('.jv-nav-btn:has-text("Editor")');
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(screenshotDir, '09-editor-dark.png') });

        // Screenshot 10: Level Dropdown
        console.log('10. Level Dropdown...');
        await page.click('.jv-nav-btn:has-text("Tree")');
        await page.waitForTimeout(300);
        const levelBtn = page.locator('.jv-level-btn');
        if (await levelBtn.isVisible()) {
            await levelBtn.click();
            await page.waitForTimeout(300);
            await page.screenshot({ path: path.join(screenshotDir, '10-level-dropdown.png') });
        }

        // Screenshot 11: Toolbar hover state
        console.log('11. Toolbar buttons...');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(screenshotDir, '11-toolbar.png') });

        console.log('\n✓ Screenshots saved to:', screenshotDir);
        console.log('\nKeeping browser open for 5 seconds...');
        await page.waitForTimeout(5000);

    } catch (error) {
        console.error('Error:', error.message);
        await page.screenshot({ path: path.join(screenshotDir, 'error.png') });
    } finally {
        await context.close();
    }
}

captureScreenshots().catch(console.error);
