#!/usr/bin/env node
/**
 * Demo Video Recorder for JSON Viewer
 *
 * Uses Playwright to record a live demo of the extension in action.
 * Records the browser as it demonstrates all features with voiceover.
 *
 * Run with:
 *   npm run record              # Subtitles only (silent video)
 *   npm run record -- --voice   # With AI voice (requires API key)
 *
 * For AI voice, create a .env file in the project root:
 *   ELEVENLABS_API_KEY=your_key_here
 *
 * Or pass it inline:
 *   ELEVENLABS_API_KEY=your_key npm run record -- --voice
 *
 * Get free ElevenLabs API key at: https://elevenlabs.io
 *
 * Prerequisites for voice:
 *   brew install ffmpeg
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '..');
const outputDir = path.join(extensionPath, 'docs', 'video');
const audioDir = path.join(outputDir, 'audio');
const userDataDir = path.join(os.tmpdir(), 'jv-record-profile-' + Date.now());

// Load .env file if it exists (simple dotenv implementation)
function loadEnvFile() {
    const envPath = path.join(extensionPath, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        for (const line of envContent.split('\n')) {
            const trimmed = line.trim();
            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex > 0) {
                const key = trimmed.slice(0, eqIndex).trim();
                let value = trimmed.slice(eqIndex + 1).trim();
                // Remove surrounding quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                // Only set if not already in environment
                if (!process.env[key]) {
                    process.env[key] = value;
                }
            }
        }
    }
}
loadEnvFile();

// Check for --voice flag and ElevenLabs API key
const enableVoice = process.argv.includes('--voice');
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const useElevenLabs = enableVoice && ELEVENLABS_API_KEY;
const useMacVoice = enableVoice && !ELEVENLABS_API_KEY && process.platform === 'darwin';

// ElevenLabs voice settings
// Voice options: 'pNInz6obpgDQGcFmaJgB' (Adam), '21m00Tcm4TlvDq8ikWAM' (Rachel), 'EXAVITQu4vr4xnSDxMaL' (Bella)
const ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel - natural female voice
const ELEVENLABS_MODEL = 'eleven_multilingual_v2'; // Better quality model

// macOS voice settings (use 'say -v ?' to see available voices)
const MAC_VOICE = 'Samantha'; // Good quality built-in voice

// Video layout settings
// Browser demo on left (1400px), branded sidebar on right (520px)
const BROWSER_SIZE = { width: 1400, height: 1080 };
const FINAL_SIZE = { width: 1920, height: 1080 };
const SIDEBAR_WIDTH = FINAL_SIZE.width - BROWSER_SIZE.width; // 520px

// Voiceover scripts for each scene - developer-friendly and fun
const VOICEOVER = {
    intro: "Hey developer! Tired of squinting at raw JSON blobs? Let's fix that.",
    treeView: "Tree View. Expand, collapse, explore. Finally, JSON that doesn't hurt your eyes.",
    expandNodes: "Click to dig deeper. No more scrolling through walls of curly braces.",
    editorView: "Editor mode. Line numbers, syntax highlighting, and yes, it validates too. Your code review buddy.",
    schemaView: "Schema View shows you what's what. Strings here, numbers there, booleans being dramatic as usual.",
    yamlView: "YAML fans, we got you. One click and boom, instant conversion. No library needed.",
    search: "Search as you type. Finding that one nested key? We'll highlight it for you.",
    levelControls: "Level controls. Expand to depth 3, collapse to 1. Control your chaos.",
    copy: "Copy to clipboard. Paste it into Postman, your tests, wherever. You're welcome.",
    theme: "Dark mode, light mode. Because we all have our preferences. No judgment.",
    outro: "JSON Viewer. Free, fast, and all local. Your data stays yours. Now go ship something!"
};

// Rich sample JSON for demo
const DEMO_JSON = {
    "apiResponse": {
        "status": "success",
        "timestamp": "2024-01-15T10:30:00Z",
        "data": {
            "user": {
                "id": "usr_12345",
                "name": "John Developer",
                "email": "john@example.com",
                "role": "admin",
                "verified": true
            },
            "projects": [
                {
                    "id": "proj_001",
                    "name": "JSON Viewer Extension",
                    "language": "JavaScript",
                    "stars": 1250,
                    "active": true
                },
                {
                    "id": "proj_002",
                    "name": "API Dashboard",
                    "language": "TypeScript",
                    "stars": 890,
                    "active": true
                },
                {
                    "id": "proj_003",
                    "name": "CLI Tools",
                    "language": "Rust",
                    "stars": 456,
                    "active": false
                }
            ],
            "settings": {
                "theme": "dark",
                "notifications": true,
                "twoFactor": true,
                "apiLimit": 10000
            },
            "metrics": {
                "totalRequests": 1542789,
                "successRate": 99.7,
                "avgResponseTime": 45.2
            }
        },
        "pagination": {
            "page": 1,
            "perPage": 20,
            "total": 156
        }
    }
};

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// Check if FFmpeg is available
function checkFFmpeg() {
    try {
        execSync('ffmpeg -version', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

// Generate audio using macOS 'say' command (no API needed)
function generateMacAudio(text, outputPath) {
    const aiffPath = outputPath.replace('.mp3', '.aiff');

    // Generate AIFF with macOS say command
    execSync(`say -v "${MAC_VOICE}" -o "${aiffPath}" "${text.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });

    // Convert to MP3 with FFmpeg
    execSync(`ffmpeg -y -i "${aiffPath}" -acodec libmp3lame -ab 192k "${outputPath}"`, { stdio: 'pipe' });

    // Remove temp AIFF
    fs.unlinkSync(aiffPath);

    return outputPath;
}

// Generate audio using ElevenLabs API
async function generateAudio(text, outputPath) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            text: text,
            model_id: ELEVENLABS_MODEL,
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75
            }
        });

        const options = {
            hostname: 'api.elevenlabs.io',
            port: 443,
            path: `/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            if (res.statusCode !== 200) {
                let errorBody = '';
                res.on('data', chunk => errorBody += chunk);
                res.on('end', () => {
                    let errorMsg = `HTTP ${res.statusCode}`;
                    try {
                        const parsed = JSON.parse(errorBody);
                        errorMsg = parsed.detail?.message || parsed.detail || errorBody;
                    } catch {
                        errorMsg = errorBody || `HTTP ${res.statusCode}`;
                    }
                    reject(new Error(errorMsg));
                });
                return;
            }

            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                if (buffer.length < 1000) {
                    reject(new Error('Audio file too small - API may have returned an error'));
                    return;
                }
                fs.writeFileSync(outputPath, buffer);
                resolve(outputPath);
            });
        });

        req.on('error', (e) => {
            reject(new Error(`Network error: ${e.message}`));
        });

        req.write(postData);
        req.end();
    });
}

// Get audio duration using FFprobe
function getAudioDuration(audioPath) {
    try {
        const result = execSync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
            { encoding: 'utf-8' }
        );
        return parseFloat(result.trim()) * 1000; // Convert to milliseconds
    } catch {
        return 3000; // Default 3 seconds
    }
}

// Generate branded sidebar panel image
function generateSidebarImage(outputPath) {
    console.log('  Creating branded sidebar panel...');

    // Sidebar content
    const features = [
        'Tree View',
        'Editor Mode',
        'Schema View',
        'YAML Export',
        'Dark & Light Themes',
        'Keyboard Shortcuts',
        '100% Offline & Private'
    ];

    // Build FFmpeg filter for sidebar with gradient background and text
    // Using drawtext for each element
    const filters = [
        // Dark gradient background
        `color=c=0x1a1a2e:s=${SIDEBAR_WIDTH}x${FINAL_SIZE.height}`,
        // Subtle gradient overlay
        `drawbox=x=0:y=0:w=${SIDEBAR_WIDTH}:h=${FINAL_SIZE.height}:c=0x16213e@0.6:t=fill`
    ];

    // JSON icon brackets
    const iconY = 80;
    filters.push(
        `drawtext=text='{ }':fontsize=72:fontcolor=0x10b981:x=(w-text_w)/2:y=${iconY}:fontfile=/System/Library/Fonts/Menlo.ttc`
    );

    // Title
    const titleY = iconY + 100;
    filters.push(
        `drawtext=text='JSON Viewer':fontsize=42:fontcolor=white:x=(w-text_w)/2:y=${titleY}:fontfile=/System/Library/Fonts/Helvetica.ttc`
    );

    // Tagline
    const taglineY = titleY + 55;
    filters.push(
        `drawtext=text='Transform raw JSON':fontsize=20:fontcolor=0xaaaaaa:x=(w-text_w)/2:y=${taglineY}:fontfile=/System/Library/Fonts/Helvetica.ttc`
    );

    // Features list with checkmarks
    const featuresStartY = taglineY + 80;
    const featureSpacing = 48;
    features.forEach((feature, i) => {
        const y = featuresStartY + (i * featureSpacing);
        // Checkmark
        filters.push(
            `drawtext=text='✓':fontsize=22:fontcolor=0x10b981:x=60:y=${y}:fontfile=/System/Library/Fonts/Apple\\ Symbols.ttf`
        );
        // Feature text
        filters.push(
            `drawtext=text='${feature}':fontsize=22:fontcolor=white:x=100:y=${y}:fontfile=/System/Library/Fonts/Helvetica.ttc`
        );
    });

    // CTA box background
    const ctaY = FINAL_SIZE.height - 180;
    filters.push(
        `drawbox=x=40:y=${ctaY}:w=${SIDEBAR_WIDTH - 80}:h=100:c=0x10b981:t=fill`
    );
    // Rounded corners effect (small boxes at corners)
    filters.push(
        `drawtext=text='Free on Chrome':fontsize=24:fontcolor=white:x=(w-text_w)/2:y=${ctaY + 25}:fontfile=/System/Library/Fonts/Helvetica.ttc`
    );
    filters.push(
        `drawtext=text='Web Store':fontsize=24:fontcolor=white:x=(w-text_w)/2:y=${ctaY + 55}:fontfile=/System/Library/Fonts/Helvetica.ttc`
    );

    const filterStr = filters.join(',');

    try {
        const args = [
            '-y',
            '-f', 'lavfi',
            '-i', filterStr,
            '-frames:v', '1',
            outputPath
        ];

        const result = spawnSync('ffmpeg', args, { stdio: 'pipe' });
        if (result.status !== 0) {
            throw new Error(result.stderr?.toString() || 'FFmpeg failed');
        }
        console.log('  ✓ Sidebar panel created');
        return true;
    } catch (error) {
        console.error('  ✗ Sidebar generation failed:', error.message);
        return false;
    }
}

// Composite browser video with sidebar panel
async function compositeWithSidebar(videoPath, sidebarPath, outputPath) {
    console.log('\n🎨 Compositing video with branded sidebar...');

    try {
        // Use FFmpeg to place browser video on left, sidebar image on right
        const args = [
            '-y',
            '-i', videoPath,           // Input 0: browser video
            '-i', sidebarPath,         // Input 1: sidebar image
            '-filter_complex', [
                // Scale browser video if needed and pad to final size
                `[0:v]scale=${BROWSER_SIZE.width}:${BROWSER_SIZE.height}[browser]`,
                // Loop sidebar image to match video duration
                `[1:v]loop=-1:size=1[sidebar]`,
                // Stack horizontally: browser on left, sidebar on right
                `[browser][sidebar]hstack=inputs=2[vout]`
            ].join(';'),
            '-map', '[vout]',
            '-map', '0:a?',             // Keep audio if present
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '18',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'copy',
            '-movflags', '+faststart',
            '-shortest',
            outputPath
        ];

        console.log('  Running FFmpeg composite...');
        const result = spawnSync('ffmpeg', args, { stdio: 'pipe' });

        if (result.status !== 0) {
            const stderr = result.stderr?.toString() || 'Unknown error';
            throw new Error(stderr.split('\n').slice(-5).join('\n'));
        }

        console.log('  ✓ Video composited successfully');
        return true;
    } catch (error) {
        console.error('  ✗ Composite failed:', error.message);
        return false;
    }
}

// Pre-generate all audio files
async function generateAllAudio() {
    const voiceType = useElevenLabs ? 'ElevenLabs AI' : 'macOS Samantha';
    console.log(`\n🎙️  Generating voiceover audio (${voiceType})...`);
    console.log(`  Cache: ${audioDir}`);
    console.log('  (Delete cache folder to regenerate with different voice)');
    ensureDir(audioDir);

    const audioFiles = {};
    const entries = Object.entries(VOICEOVER);

    for (let i = 0; i < entries.length; i++) {
        const [key, text] = entries[i];
        const audioPath = path.join(audioDir, `${key}.mp3`);

        // Skip if already generated (delete docs/video/audio/ to regenerate)
        if (fs.existsSync(audioPath)) {
            console.log(`  ✓ ${key} (cached)`);
            audioFiles[key] = { path: audioPath, duration: getAudioDuration(audioPath) };
            continue;
        }

        try {
            console.log(`  Generating ${key}... (${i + 1}/${entries.length})`);

            if (useElevenLabs) {
                await generateAudio(text, audioPath);
            } else {
                generateMacAudio(text, audioPath);
            }

            audioFiles[key] = { path: audioPath, duration: getAudioDuration(audioPath) };
            console.log(`  ✓ ${key} (${(audioFiles[key].duration / 1000).toFixed(1)}s)`);
        } catch (error) {
            console.error(`  ✗ Failed to generate ${key}: ${error.message}`);
            audioFiles[key] = null;
        }

        // Small delay between API calls to avoid rate limiting (ElevenLabs only)
        if (useElevenLabs && i < entries.length - 1) {
            await sleep(100);
        }
    }

    return audioFiles;
}

// Merge video with audio timeline using FFmpeg
async function mergeAudioWithVideo(videoPath, audioTimeline, outputPath) {
    console.log('\n🔊 Merging audio with video...');

    // Filter to only valid audio files
    const validAudio = audioTimeline.filter(item =>
        item.audioPath && fs.existsSync(item.audioPath)
    );

    if (validAudio.length === 0) {
        console.log('  No audio to merge, copying video as-is');
        fs.copyFileSync(videoPath, outputPath);
        return;
    }

    console.log(`  Merging ${validAudio.length} audio clips...`);

    // Build FFmpeg command with correct input indices
    // Input 0 = video, Input 1+ = audio files
    const audioInputs = validAudio.flatMap(item => ['-i', item.audioPath]);
    const filterParts = [];
    const mixLabels = [];

    validAudio.forEach((item, i) => {
        const inputIdx = i + 1; // +1 because video is input 0
        const delayMs = Math.round(item.startTime);
        const label = `a${i}`;
        filterParts.push(`[${inputIdx}:a]adelay=${delayMs}|${delayMs}[${label}]`);
        mixLabels.push(`[${label}]`);
    });

    // Combine all audio streams and boost volume (amix normalizes which makes it quiet)
    filterParts.push(`${mixLabels.join('')}amix=inputs=${validAudio.length}:duration=longest:normalize=0,volume=2.0[aout]`);

    const filterComplex = filterParts.join(';');

    // Determine output format - WebM input needs re-encoding for MP4
    const isWebM = videoPath.endsWith('.webm');
    const outputIsMP4 = outputPath.endsWith('.mp4');
    const needsReencode = isWebM && outputIsMP4;

    try {
        // Use spawn with array args to handle paths with spaces properly
        const args = [
            '-y',
            '-i', videoPath,
            ...audioInputs,
            '-filter_complex', filterComplex,
            '-map', '0:v',
            '-map', '[aout]',
            // VP8 (WebM) can't be copied to MP4, need to re-encode
            // CRF 18 = high quality for YouTube, preset slow = better compression
            ...(needsReencode ? ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p'] : ['-c:v', 'copy']),
            '-c:a', 'aac',
            '-b:a', '256k',
            '-movflags', '+faststart',
            outputPath
        ];

        console.log('  Running FFmpeg...');
        const result = spawnSync('ffmpeg', args, { stdio: 'pipe' });

        if (result.status !== 0) {
            const stderr = result.stderr?.toString() || 'Unknown error';
            throw new Error(stderr.split('\n').slice(-5).join('\n'));
        }

        console.log('  ✓ Audio merged successfully');
    } catch (error) {
        console.error('  ✗ FFmpeg merge failed:', error.message);
        // Fall back to video without audio
        fs.copyFileSync(videoPath, outputPath);
    }
}

// Track audio timeline for later merging
const audioTimeline = [];

function createServer(port) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');

            const url = req.url.split('?')[0];

            if (url === '/demo-json') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(DEMO_JSON, null, 2));
                return;
            }

            if (url.startsWith('/src/') || url.startsWith('/icons/')) {
                const filePath = path.join(extensionPath, url.substring(1));
                fs.readFile(filePath, (err, data) => {
                    if (err) {
                        res.writeHead(404);
                        res.end('Not found');
                        return;
                    }
                    let contentType = 'text/plain';
                    if (filePath.endsWith('.js')) contentType = 'application/javascript';
                    else if (filePath.endsWith('.css')) contentType = 'text/css';
                    res.writeHead(200, { 'Content-Type': contentType });
                    res.end(data);
                });
                return;
            }

            res.writeHead(404);
            res.end('Not found');
        });
        server.listen(port, () => resolve(server));
    });
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Inject custom cursor for video recording (Playwright doesn't capture system cursor)
async function injectCustomCursor(page) {
    await page.evaluate(() => {
        // Create cursor element
        const cursor = document.createElement('div');
        cursor.id = 'jv-demo-cursor';
        cursor.innerHTML = `
            <div style="
                width: 20px;
                height: 20px;
                border: 3px solid #10b981;
                border-radius: 50%;
                background: rgba(16, 185, 129, 0.3);
                pointer-events: none;
                transform: translate(-50%, -50%);
                transition: transform 0.05s ease-out;
            "></div>
        `;
        cursor.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            z-index: 999999;
            pointer-events: none;
        `;
        document.body.appendChild(cursor);

        // Track mouse movement
        document.addEventListener('mousemove', (e) => {
            cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        });

        // Click animation
        document.addEventListener('mousedown', () => {
            cursor.firstElementChild.style.transform = 'translate(-50%, -50%) scale(0.8)';
            cursor.firstElementChild.style.background = 'rgba(16, 185, 129, 0.6)';
        });
        document.addEventListener('mouseup', () => {
            cursor.firstElementChild.style.transform = 'translate(-50%, -50%) scale(1)';
            cursor.firstElementChild.style.background = 'rgba(16, 185, 129, 0.3)';
        });
    });
}

// Show subtitle on screen
async function showSubtitle(page, text) {
    await page.evaluate((text) => {
        // Create or update subtitle container
        let subtitle = document.getElementById('jv-demo-subtitle');
        if (!subtitle) {
            subtitle = document.createElement('div');
            subtitle.id = 'jv-demo-subtitle';
            subtitle.style.cssText = `
                position: fixed;
                bottom: 40px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.85);
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 18px;
                max-width: 80%;
                text-align: center;
                z-index: 999999;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                transition: opacity 0.3s ease;
            `;
            document.body.appendChild(subtitle);
        }
        subtitle.textContent = text;
        subtitle.style.opacity = '1';
    }, text);
}

// Hide subtitle
async function hideSubtitle(page) {
    await page.evaluate(() => {
        const subtitle = document.getElementById('jv-demo-subtitle');
        if (subtitle) {
            subtitle.style.opacity = '0';
            setTimeout(() => subtitle.remove(), 300);
        }
    });
}

// Audio files storage (populated when generating audio)
let audioFiles = {};
let recordingStartTime = 0;

// Speak text with subtitle display - tracks audio timestamps for later merging
async function speak(page, voiceKey, showSub = true) {
    const text = VOICEOVER[voiceKey];
    if (!text) return 0;

    console.log(`  🎙️  "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

    // Show subtitle
    if (showSub) {
        await showSubtitle(page, text);
    }

    // Calculate duration based on audio file or text length
    let duration;
    const hasAudio = audioFiles[voiceKey] && audioFiles[voiceKey].path;

    if (hasAudio) {
        duration = audioFiles[voiceKey].duration;

        // Track this audio for later merging
        audioTimeline.push({
            voiceKey,
            audioPath: audioFiles[voiceKey].path,
            startTime: Date.now() - recordingStartTime,
            duration
        });
    } else {
        // Estimate duration from text length (for subtitle timing)
        duration = text.length * 55;
    }

    return duration;
}

// Wait for speech to complete and hide subtitle
async function endSpeech(page, duration) {
    await sleep(duration + 200);
    await hideSubtitle(page);
    await sleep(300);
}

async function recordDemo() {
    console.log('='.repeat(60));
    console.log('JSON Viewer - Demo Video Recorder');
    console.log('='.repeat(60));

    if (enableVoice) {
        if (!checkFFmpeg()) {
            console.error('\n✗ FFmpeg required for voice');
            console.log('  Install with: brew install ffmpeg\n');
            process.exit(1);
        }
        if (useElevenLabs) {
            console.log('Voice: ENABLED (ElevenLabs AI)');
            console.log(`  API Key: ${ELEVENLABS_API_KEY.slice(0, 8)}...`);
        } else if (useMacVoice) {
            console.log('Voice: ENABLED (macOS Samantha)');
            console.log('  Tip: Set ELEVENLABS_API_KEY for more natural AI voice');
        } else {
            console.error('\n✗ Voice generation not available on this platform');
            console.log('  macOS required, or set ELEVENLABS_API_KEY\n');
            process.exit(1);
        }
    } else {
        console.log('Voice: disabled (use --voice flag to enable)');
        if (ELEVENLABS_API_KEY) {
            console.log(`  Note: ELEVENLABS_API_KEY is set (${ELEVENLABS_API_KEY.slice(0, 8)}...)`);
        }
    }
    console.log('');

    ensureDir(outputDir);

    // Pre-generate audio if voice is enabled
    if (enableVoice && (useElevenLabs || useMacVoice)) {
        audioFiles = await generateAllAudio();
    }

    const PORT = 9890;
    const server = await createServer(PORT);
    console.log(`✓ Test server running on http://localhost:${PORT}`);

    // Launch browser with extension and video recording
    const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'msedge',
        headless: false,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--no-sandbox',
        ],
        viewport: BROWSER_SIZE,
        recordVideo: {
            dir: outputDir,
            size: BROWSER_SIZE
        }
    });

    console.log(`✓ Browser launched with video recording`);
    console.log(`  Browser: ${BROWSER_SIZE.width}x${BROWSER_SIZE.height}`);
    console.log(`  Final output: ${FINAL_SIZE.width}x${FINAL_SIZE.height} (with branded sidebar)`);

    let page = context.pages()[0];
    if (!page) {
        page = await context.newPage();
    }

    try {
        // Mark recording start time for audio timeline
        recordingStartTime = Date.now();

        // ========================================
        // SCENE 1: Load JSON and show Tree View
        // ========================================
        console.log('\n📹 Recording Scene 1: Intro & Tree View');

        await page.goto(`http://localhost:${PORT}/demo-json`, { waitUntil: 'networkidle' });
        await page.waitForSelector('.jv-toolbar-container', { timeout: 10000 });

        // Inject custom cursor for recording
        await injectCustomCursor(page);

        // Set dark theme
        await page.evaluate(() => {
            localStorage.setItem('json-viewer-theme', 'dark');
        });
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForSelector('.jv-toolbar-container', { timeout: 10000 });
        await injectCustomCursor(page); // Re-inject after reload
        await sleep(500);

        // Intro - show subtitle, wait, then hide
        let dur = await speak(page, 'intro');
        await endSpeech(page, dur);

        // Tree view - speak while showing
        dur = await speak(page, 'treeView');
        await endSpeech(page, dur);

        // Expand nodes while speaking
        console.log('  Expanding nodes...');
        dur = await speak(page, 'expandNodes');
        const toggles = await page.$$('.jv-toggle');
        for (let i = 0; i < Math.min(5, toggles.length); i++) {
            await toggles[i].click();
            await sleep(350);
        }
        await endSpeech(page, dur - (toggles.length * 350));

        // ========================================
        // SCENE 2: Editor View (action first, then speak)
        // ========================================
        console.log('\n📹 Recording Scene 2: Editor View');

        await page.click('.jv-nav-btn:has-text("Editor")');
        await page.waitForSelector('.jv-editor-wrapper', { timeout: 5000 });
        await sleep(300);

        dur = await speak(page, 'editorView');
        // Scroll editor while speaking
        const editor = await page.$('.jv-editor-wrapper');
        if (editor) {
            await sleep(400);
            await editor.evaluate(el => el.scrollTop = 100);
            await sleep(400);
            await editor.evaluate(el => el.scrollTop = 0);
        }
        await endSpeech(page, dur);

        // ========================================
        // SCENE 3: Schema View (action first, then speak)
        // ========================================
        console.log('\n📹 Recording Scene 3: Schema View');

        await page.click('.jv-nav-btn:has-text("Schema")');
        await sleep(300);
        dur = await speak(page, 'schemaView');
        await endSpeech(page, dur);

        // ========================================
        // SCENE 4: YAML View (action first, then speak)
        // ========================================
        console.log('\n📹 Recording Scene 4: YAML View');

        await page.click('.jv-nav-btn:has-text("YAML")');
        await sleep(300);
        dur = await speak(page, 'yamlView');
        await endSpeech(page, dur);

        // ========================================
        // SCENE 5: Search functionality
        // ========================================
        console.log('\n📹 Recording Scene 5: Search');

        await page.click('.jv-nav-btn:has-text("Tree")');
        await sleep(300);

        const searchInput = await page.$('.jv-search');
        if (searchInput) {
            await searchInput.focus();
            await sleep(200);
        }

        dur = await speak(page, 'search');
        if (searchInput) {
            // Type search term while speaking
            const searchTerm = 'projects';
            for (const char of searchTerm) {
                await page.keyboard.type(char);
                await sleep(80);
            }
            await sleep(500);
            await searchInput.fill('');
        }
        await endSpeech(page, dur);

        // ========================================
        // SCENE 6: Expand/Collapse levels
        // ========================================
        console.log('\n📹 Recording Scene 6: Level Controls');

        const levelBtn = await page.$('.jv-level-btn');
        if (levelBtn) {
            await levelBtn.click();
            await sleep(300);
        }

        dur = await speak(page, 'levelControls');
        if (levelBtn) {
            const level1 = await page.$('.jv-level-item:has-text("1")');
            if (level1) {
                await level1.click();
                await sleep(500);
            }
            await levelBtn.click();
            await sleep(300);
            const level3 = await page.$('.jv-level-item:has-text("3")');
            if (level3) {
                await level3.click();
            }
        }
        await endSpeech(page, dur);

        // ========================================
        // SCENE 7: Copy action
        // ========================================
        console.log('\n📹 Recording Scene 7: Copy Action');

        const copyBtn = await page.$('.jv-btn[title*="Copy"]');
        if (copyBtn) {
            await copyBtn.click();
            await sleep(200);
        }
        dur = await speak(page, 'copy');
        await endSpeech(page, dur);

        // ========================================
        // SCENE 8: Theme toggle
        // ========================================
        console.log('\n📹 Recording Scene 8: Theme Toggle');

        const themeBtn = await page.$('.jv-btn[title*="Theme"]');
        if (themeBtn) {
            await themeBtn.click();
            await sleep(300);
        }
        dur = await speak(page, 'theme');
        if (themeBtn) {
            await sleep(600);
            await themeBtn.click();
        }
        await endSpeech(page, dur);

        // ========================================
        // SCENE 9: Outro
        // ========================================
        console.log('\n📹 Recording outro...');
        dur = await speak(page, 'outro');
        await endSpeech(page, dur);
        await sleep(500);

    } catch (error) {
        console.error('\n✗ Recording error:', error.message);
    }

    // Close and save video
    console.log('\n⏹️  Stopping recording...');
    await page.close();
    await context.close();

    // Find the recorded video file
    const videoFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.webm') && !f.startsWith('json-viewer'));
    if (videoFiles.length > 0) {
        const latestVideo = videoFiles[videoFiles.length - 1];
        const rawVideoPath = path.join(outputDir, latestVideo);
        const browserVideoPath = path.join(outputDir, 'browser-temp.mp4');
        const sidebarPath = path.join(outputDir, 'sidebar.png');
        const mp4Path = path.join(outputDir, 'json-viewer-demo-youtube.mp4');

        // Remove existing files if present
        [browserVideoPath, sidebarPath, mp4Path].forEach(p => {
            if (fs.existsSync(p)) fs.unlinkSync(p);
        });

        // Debug: Log audio timeline status
        console.log(`\n📊 Audio timeline: ${audioTimeline.length} clips recorded`);
        if (audioTimeline.length > 0) {
            audioTimeline.forEach((item, i) => {
                console.log(`  ${i + 1}. ${item.voiceKey} @ ${(item.startTime/1000).toFixed(1)}s`);
            });
        }

        // Step 1: Merge audio with browser video (or just convert to MP4)
        if ((useElevenLabs || useMacVoice) && audioTimeline.length > 0) {
            await mergeAudioWithVideo(rawVideoPath, audioTimeline, browserVideoPath);
        } else {
            // Convert browser video to MP4 without audio
            console.log('\n📦 Converting browser video to MP4...');
            try {
                execSync(`ffmpeg -y -i "${rawVideoPath}" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart "${browserVideoPath}"`, { stdio: 'pipe' });
            } catch (e) {
                console.log('  (Conversion failed, using raw video)');
                fs.copyFileSync(rawVideoPath, browserVideoPath);
            }
        }

        // Step 2: Generate branded sidebar panel
        generateSidebarImage(sidebarPath);

        // Step 3: Composite browser video + sidebar into final output
        if (fs.existsSync(browserVideoPath) && fs.existsSync(sidebarPath)) {
            const compositeSuccess = await compositeWithSidebar(browserVideoPath, sidebarPath, mp4Path);

            // Cleanup intermediate files
            if (compositeSuccess) {
                try { fs.unlinkSync(rawVideoPath); } catch {}
                try { fs.unlinkSync(browserVideoPath); } catch {}
                try { fs.unlinkSync(sidebarPath); } catch {}
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('RECORDING COMPLETE');
        console.log('='.repeat(60));

        if (fs.existsSync(mp4Path)) {
            const mp4Stats = fs.statSync(mp4Path);
            console.log(`\n✓ MP4: ${mp4Path}`);
            console.log(`  Resolution: ${FINAL_SIZE.width}x${FINAL_SIZE.height}`);
            console.log(`  Size: ${(mp4Stats.size / 1024 / 1024).toFixed(2)} MB`);
            console.log(`  Audio: ${audioTimeline.length > 0 ? 'Yes (' + audioTimeline.length + ' clips)' : 'No'}`);
            console.log(`  Layout: Browser (${BROWSER_SIZE.width}px) + Sidebar (${SIDEBAR_WIDTH}px)`);
            console.log('\n📺 Ready to upload to YouTube!');
        } else {
            console.log('\n⚠️  Final video creation failed.');
            console.log('  Check FFmpeg output above for details.');
        }

        if (!enableVoice) {
            console.log('\n💡 To add AI voiceover:');
            console.log('  npm run record -- --voice');
        }
    } else {
        console.log('\n⚠️  No video file found. Recording may have failed.');
    }

    // Cleanup
    server.close();
    try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
}

recordDemo().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
