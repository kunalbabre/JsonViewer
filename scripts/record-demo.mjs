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

// Check for --voice and --remix flags
const enableVoice = process.argv.includes('--voice');
const remixMode = process.argv.includes('--remix');
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const useElevenLabs = enableVoice && ELEVENLABS_API_KEY;
const useMacVoice = enableVoice && !ELEVENLABS_API_KEY && process.platform === 'darwin';

// ElevenLabs voice settings - Two voices for natural dialogue
// Voice options: 'pNInz6obpgDQGcFmaJgB' (Adam), '21m00Tcm4TlvDq8ikWAM' (Rachel), 'EXAVITQu4vr4xnSDxMaL' (Bella)
const VOICE_HOST = '21m00Tcm4TlvDq8ikWAM'; // Rachel - main narrator
const VOICE_DEV = 'pNInz6obpgDQGcFmaJgB'; // Adam - developer reactions
const ELEVENLABS_MODEL = 'eleven_multilingual_v2'; // Better quality model

// macOS voice settings (use 'say -v ?' to see available voices)
const MAC_VOICE = 'Samantha'; // Good quality built-in voice

// Video layout settings
// Browser demo on left (1400px), branded sidebar on right (520px)
// Browser fills full height for better use of space
const BROWSER_SIZE = { width: 1400, height: 1080 };
const FINAL_SIZE = { width: 1920, height: 1080 };
const SIDEBAR_WIDTH = FINAL_SIZE.width - BROWSER_SIZE.width; // 520px

// Voiceover scripts for each scene - two-person dialogue for natural feel
// voice: 'host' = Rachel (narrator), 'dev' = Adam (developer)
// Alternating speakers throughout for engaging conversation
// Using expressive punctuation and natural phrasing for ElevenLabs emotion
const VOICEOVER = {
    intro: { text: "Hey! Ever opened a JSON API response... and felt your eyes just glaze over?", voice: 'host' },
    introReact: { text: "Ugh, ALL the time! Nested objects everywhere, it's a nightmare.", voice: 'dev' },
    treeView: { text: "Well... Tree View makes it actually readable! Expand what you need, collapse the rest.", voice: 'host' },
    expandNodes: { text: "Oh nice! Just click to explore. This is SO much better than raw JSON.", voice: 'dev' },
    editorView: { text: "Need to edit something? Editor mode has line numbers AND syntax highlighting.", voice: 'host' },
    editorReact: { text: "Oh wow, that's clean! I can actually see the structure now.", voice: 'dev' },
    schemaView: { text: "And check this out... Schema View shows you the data types at a glance!", voice: 'host' },
    schemaReact: { text: "Strings, numbers, booleans... all labeled! That's super handy for debugging.", voice: 'dev' },
    yamlView: { text: "And for YAML fans? Instant conversion with just one click!", voice: 'host' },
    yamlReact: { text: "Wait wait wait... it converts to YAML?! That's actually really useful!", voice: 'dev' },
    search: { text: "Search finds anything instantly. Just... start typing!", voice: 'host' },
    searchReact: { text: "Projects... boom, found it! Way faster than scrolling through everything.", voice: 'dev' },
    levelControls: { text: "Collapse all, expand all, or pick a specific depth level.", voice: 'host' },
    levelReact: { text: "Total control over how much you see. I really like that!", voice: 'dev' },
    copy: { text: "Copy to clipboard for Postman, tests, wherever you need it!", voice: 'host' },
    copyReact: { text: "One click copy... perfect!", voice: 'dev' },
    theme: { text: "Oh, and... dark mode or light mode. Your choice!", voice: 'host' },
    themeReact: { text: "Dark mode, obviously! My eyes thank you.", voice: 'dev' },
    outro: { text: "JSON Viewer. Free, fast, and completely private. Your data never leaves your browser.", voice: 'host' },
    outroReact: { text: "Alright, I'm sold! Installing this right now.", voice: 'dev' }
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

// Find FFmpeg path - check common locations
function findFFmpegPath() {
    const paths = [
        '/opt/homebrew/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        'ffmpeg'
    ];
    for (const p of paths) {
        try {
            execSync(`${p} -version`, { stdio: 'pipe' });
            return p;
        } catch {}
    }
    return null;
}

const FFMPEG = findFFmpegPath();
const FFPROBE = FFMPEG ? FFMPEG.replace('ffmpeg', 'ffprobe') : null;

// Check if FFmpeg is available
function checkFFmpeg() {
    return FFMPEG !== null;
}

// Generate audio using macOS 'say' command (no API needed)
function generateMacAudio(text, outputPath) {
    const aiffPath = outputPath.replace('.mp3', '.aiff');

    // Generate AIFF with macOS say command
    execSync(`say -v "${MAC_VOICE}" -o "${aiffPath}" "${text.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });

    // Convert to MP3 with FFmpeg
    execSync(`${FFMPEG} -y -i "${aiffPath}" -acodec libmp3lame -ab 192k "${outputPath}"`, { stdio: 'pipe' });

    // Remove temp AIFF
    fs.unlinkSync(aiffPath);

    return outputPath;
}

// Generate audio using ElevenLabs API
async function generateAudio(text, outputPath, voiceType = 'host') {
    const voiceId = voiceType === 'dev' ? VOICE_DEV : VOICE_HOST;

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
            path: `/v1/text-to-speech/${voiceId}`,
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
            `${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
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

    // Sidebar content - features with checkmark bullets
    const features = [
        'Tree View',
        'Editor Mode',
        'Schema View',
        'YAML Export',
        'Dark & Light Themes',
        'Keyboard Shortcuts',
        'DevTools Integration',
        'Copy & Save',
        '100%% Offline & Private'  // %% escapes % in FFmpeg
    ];

    // "Why JSON Viewer" benefits
    const benefits = [
        'No data leaves your browser',
        'Works with any JSON API',
        'Zero configuration needed'
    ];

    // Build FFmpeg filter for sidebar with gradient background and text
    const filters = [
        // Dark gradient background
        `color=c=0x1a1a2e:s=${SIDEBAR_WIDTH}x${FINAL_SIZE.height}`,
        // Subtle gradient overlay
        `drawbox=x=0:y=0:w=${SIDEBAR_WIDTH}:h=${FINAL_SIZE.height}:c=0x16213e@0.6:t=fill`
    ];

    // JSON icon brackets (using { } which works in any font)
    const iconY = 40;
    filters.push(
        `drawtext=text='\\{ \\}':fontsize=70:fontcolor=0x10b981:x=(w-text_w)/2:y=${iconY}:fontfile=/System/Library/Fonts/Menlo.ttc`
    );

    // Title
    const titleY = iconY + 95;
    filters.push(
        `drawtext=text='JSON Viewer':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=${titleY}:fontfile=/System/Library/Fonts/Helvetica.ttc`
    );

    // Tagline
    const taglineY = titleY + 48;
    filters.push(
        `drawtext=text='Transform raw JSON':fontsize=18:fontcolor=0xaaaaaa:x=(w-text_w)/2:y=${taglineY}:fontfile=/System/Library/Fonts/Helvetica.ttc`
    );

    // Features section header
    const featureHeaderY = taglineY + 55;
    filters.push(
        `drawtext=text='FEATURES':fontsize=14:fontcolor=0x10b981:x=80:y=${featureHeaderY}:fontfile=/System/Library/Fonts/Helvetica.ttc`
    );

    // Features list with green bullets
    const featuresStartY = featureHeaderY + 30;
    const featureSpacing = 36;
    const bulletX = 80;
    const textX = 105;

    features.forEach((feature, i) => {
        const y = featuresStartY + (i * featureSpacing);
        // Green bullet dot
        filters.push(
            `drawbox=x=${bulletX}:y=${y + 6}:w=8:h=8:c=0x10b981:t=fill`
        );
        // Feature text
        filters.push(
            `drawtext=text='${feature}':fontsize=19:fontcolor=white:x=${textX}:y=${y}:fontfile=/System/Library/Fonts/Helvetica.ttc`
        );
    });

    // "Why JSON Viewer" section
    const whyHeaderY = featuresStartY + (features.length * featureSpacing) + 35;
    filters.push(
        `drawtext=text='WHY JSON VIEWER':fontsize=14:fontcolor=0x10b981:x=80:y=${whyHeaderY}:fontfile=/System/Library/Fonts/Helvetica.ttc`
    );

    const benefitsStartY = whyHeaderY + 30;
    benefits.forEach((benefit, i) => {
        const y = benefitsStartY + (i * 32);
        filters.push(
            `drawtext=text='${benefit}':fontsize=16:fontcolor=0xcccccc:x=80:y=${y}:fontfile=/System/Library/Fonts/Helvetica.ttc`
        );
    });

    // CTA box background (green button)
    const ctaY = FINAL_SIZE.height - 130;
    filters.push(
        `drawbox=x=60:y=${ctaY}:w=${SIDEBAR_WIDTH - 120}:h=80:c=0x10b981:t=fill`
    );
    // CTA text
    filters.push(
        `drawtext=text='Free on Chrome':fontsize=22:fontcolor=white:x=(w-text_w)/2:y=${ctaY + 18}:fontfile=/System/Library/Fonts/Helvetica.ttc`
    );
    filters.push(
        `drawtext=text='Web Store':fontsize=22:fontcolor=white:x=(w-text_w)/2:y=${ctaY + 46}:fontfile=/System/Library/Fonts/Helvetica.ttc`
    );

    const filterStr = filters.join(',');

    try {
        // Use execSync with shell quoting - spawnSync has issues with complex filter strings
        const cmd = `${FFMPEG} -y -f lavfi -i "${filterStr}" -frames:v 1 -update 1 "${outputPath}"`;
        execSync(cmd, { stdio: 'pipe' });
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
        // Use FFmpeg overlay approach: scale browser to fit left side, then overlay sidebar on right
        const args = [
            '-y',
            '-i', videoPath,           // Input 0: browser video
            '-i', sidebarPath,         // Input 1: sidebar image
            '-filter_complex', [
                // Scale browser video to exact size and pad to final width (browser on left, dark bg for sidebar area)
                `[0:v]scale=${BROWSER_SIZE.width}:${BROWSER_SIZE.height}:force_original_aspect_ratio=disable,pad=${FINAL_SIZE.width}:${FINAL_SIZE.height}:0:0:0x1a1a2e[padded]`,
                // Overlay sidebar image on the right side
                `[padded][1:v]overlay=${BROWSER_SIZE.width}:0[vout]`
            ].join(';'),
            '-map', '[vout]',
            '-map', '0:a',              // Keep audio (fail if no audio)
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '18',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',              // Re-encode audio to ensure compatibility
            '-b:a', '320k',
            '-movflags', '+faststart',
            outputPath
        ];

        // Check if input has audio first
        try {
            const hasAudio = execSync(`${FFPROBE} -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "${videoPath}"`, { encoding: 'utf-8' }).trim();
            console.log(`  Input video audio: ${hasAudio || 'NONE'}`);
            if (!hasAudio) {
                // No audio in input, use optional mapping
                args[args.indexOf('-map', args.indexOf('[vout]') + 1) + 1] = '0:a?';
            }
        } catch {}

        console.log('  Running FFmpeg composite (this may take a minute)...');
        const result = spawnSync(FFMPEG, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 600000,  // 10 min timeout
            maxBuffer: 50 * 1024 * 1024  // 50MB buffer for large videos
        });

        if (result.error) {
            throw new Error(`Spawn error: ${result.error.message}`);
        }

        if (result.status !== 0) {
            const stderr = result.stderr?.toString() || 'Unknown error';
            console.error('  FFmpeg stderr:', stderr.slice(-500));
            throw new Error(`Exit code ${result.status}`);
        }

        // Verify final output has audio
        try {
            const finalAudio = execSync(`${FFPROBE} -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "${outputPath}"`, { encoding: 'utf-8' }).trim();
            if (finalAudio) {
                console.log(`  ✓ Video composited with audio (codec: ${finalAudio})`);
            } else {
                console.warn('  ⚠ Warning: Final video has NO audio!');
            }
        } catch {
            console.log('  ✓ Video composited (unable to verify audio)');
        }
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
        const [key, voiceData] = entries[i];
        const text = voiceData.text;
        const voiceType = voiceData.voice;
        const audioPath = path.join(audioDir, `${key}.mp3`);

        // Skip if already generated (delete docs/video/audio/ to regenerate)
        if (fs.existsSync(audioPath)) {
            console.log(`  ✓ ${key} [${voiceType}] (cached)`);
            audioFiles[key] = { path: audioPath, duration: getAudioDuration(audioPath), voice: voiceType };
            continue;
        }

        try {
            console.log(`  Generating ${key} [${voiceType}]... (${i + 1}/${entries.length})`);

            if (useElevenLabs) {
                await generateAudio(text, audioPath, voiceType);
            } else {
                generateMacAudio(text, audioPath);
            }

            audioFiles[key] = { path: audioPath, duration: getAudioDuration(audioPath), voice: voiceType };
            console.log(`  ✓ ${key} [${voiceType}] (${(audioFiles[key].duration / 1000).toFixed(1)}s)`);
        } catch (error) {
            console.error(`  ✗ Failed to generate ${key}: ${error.message}`);
            audioFiles[key] = null;
        }

        // Small delay between API calls to avoid rate limiting (ElevenLabs only)
        if (useElevenLabs && i < entries.length - 1) {
            await sleep(150);
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
        // Boost volume for each track - female voice (host) gets more boost
        const isHost = item.voiceKey && !item.voiceKey.includes('React');
        const vol = isHost ? '3.0' : '2.0';
        filterParts.push(`[${inputIdx}:a]volume=${vol},adelay=${delayMs}|${delayMs}[${label}]`);
        mixLabels.push(`[${label}]`);
    });

    // Combine audio streams - normalize=0 prevents amix from reducing volume
    filterParts.push(`${mixLabels.join('')}amix=inputs=${validAudio.length}:duration=longest:normalize=0[aout]`);

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
            '-b:a', '320k',  // High quality audio
            '-movflags', '+faststart',
            outputPath
        ];

        console.log('  Running FFmpeg audio merge...');
        console.log(`  Filter: ${filterComplex.substring(0, 200)}...`);

        const result = spawnSync(FFMPEG, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 600000,  // 10 min timeout
            maxBuffer: 50 * 1024 * 1024  // 50MB buffer
        });

        if (result.error) {
            console.error('  Spawn error:', result.error.message);
            throw new Error(`Spawn error: ${result.error.message}`);
        }

        if (result.status !== 0) {
            const stderr = result.stderr?.toString() || 'Unknown error';
            console.error('  FFmpeg failed with exit code:', result.status);
            console.error('  stderr:', stderr.slice(-1000));
            throw new Error(`Exit code ${result.status}`);
        }

        // Verify output has audio
        try {
            const probeResult = execSync(`${FFPROBE} -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "${outputPath}"`, { encoding: 'utf-8' });
            if (probeResult.trim()) {
                console.log(`  ✓ Audio merged successfully (codec: ${probeResult.trim()})`);
            } else {
                console.warn('  ⚠ Warning: Output video has no audio stream!');
            }
        } catch {
            console.log('  ✓ Audio merge completed (unable to verify)')
        }
    } catch (error) {
        console.error('  ✗ FFmpeg merge failed:', error.message);
        // Fall back to video without audio
        fs.copyFileSync(videoPath, outputPath);
    }
}

// Track audio timeline for later merging
const audioTimeline = [];
const audioTimelinePath = path.join(outputDir, 'audio-timeline.json');

// Save audio timeline to file for remix mode
function saveAudioTimeline() {
    fs.writeFileSync(audioTimelinePath, JSON.stringify(audioTimeline, null, 2));
    console.log(`  Saved audio timeline (${audioTimeline.length} clips)`);
}

// Load audio timeline from file for remix mode
function loadAudioTimeline() {
    if (!fs.existsSync(audioTimelinePath)) {
        console.error('  No audio timeline found. Run full recording first.');
        return null;
    }
    const timeline = JSON.parse(fs.readFileSync(audioTimelinePath, 'utf-8'));
    console.log(`  Loaded audio timeline (${timeline.length} clips)`);
    return timeline;
}

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

// Smooth mouse movement to element (for natural demo feel)
async function smoothMoveTo(page, selector, options = {}) {
    const element = typeof selector === 'string' ? await page.$(selector) : selector;
    if (!element) return null;

    const box = await element.boundingBox();
    if (!box) return null;

    // Target center of element with optional offset
    const targetX = box.x + box.width / 2 + (options.offsetX || 0);
    const targetY = box.y + box.height / 2 + (options.offsetY || 0);

    // Move with steps for smooth animation
    await page.mouse.move(targetX, targetY, { steps: options.steps || 15 });
    await sleep(options.pauseAfter || 100);

    return element;
}

// Click with smooth movement and visible feedback
async function smoothClick(page, selector, options = {}) {
    const element = await smoothMoveTo(page, selector, { ...options, pauseAfter: 150 });
    if (!element) return false;

    await page.mouse.down();
    await sleep(80);
    await page.mouse.up();
    await sleep(options.pauseAfter || 200);

    return true;
}

// Type text with visible keystrokes
async function smoothType(page, selector, text, options = {}) {
    const element = await smoothMoveTo(page, selector, options);
    if (!element) return false;

    await element.click();
    await sleep(100);

    for (const char of text) {
        await page.keyboard.type(char, { delay: options.typeDelay || 60 });
    }
    await sleep(options.pauseAfter || 200);
    return true;
}

// Inject custom cursor for video recording (Playwright doesn't capture system cursor)
async function injectCustomCursor(page) {
    await page.evaluate(() => {
        // Create cursor element - larger and more visible
        const cursor = document.createElement('div');
        cursor.id = 'jv-demo-cursor';
        cursor.innerHTML = `
            <div class="cursor-ring" style="
                width: 28px;
                height: 28px;
                border: 3px solid #10b981;
                border-radius: 50%;
                background: rgba(16, 185, 129, 0.25);
                pointer-events: none;
                transform: translate(-50%, -50%);
                transition: transform 0.1s ease-out, background 0.1s ease;
                box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
            "></div>
            <div class="cursor-dot" style="
                position: absolute;
                top: 50%;
                left: 50%;
                width: 6px;
                height: 6px;
                background: #10b981;
                border-radius: 50%;
                transform: translate(-50%, -50%);
                pointer-events: none;
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

        const ring = cursor.querySelector('.cursor-ring');
        const dot = cursor.querySelector('.cursor-dot');

        // Track mouse movement with smooth transition
        document.addEventListener('mousemove', (e) => {
            cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        });

        // Click animation - ring shrinks, dot pulses
        document.addEventListener('mousedown', () => {
            ring.style.transform = 'translate(-50%, -50%) scale(0.7)';
            ring.style.background = 'rgba(16, 185, 129, 0.5)';
            ring.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.6)';
            dot.style.transform = 'translate(-50%, -50%) scale(1.5)';
        });
        document.addEventListener('mouseup', () => {
            ring.style.transform = 'translate(-50%, -50%) scale(1)';
            ring.style.background = 'rgba(16, 185, 129, 0.25)';
            ring.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.4)';
            dot.style.transform = 'translate(-50%, -50%) scale(1)';
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
    const voiceData = VOICEOVER[voiceKey];
    if (!voiceData) return 0;

    const text = voiceData.text;
    const voice = voiceData.voice;
    const icon = voice === 'dev' ? '👨‍💻' : '🎙️';

    console.log(`  ${icon} "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

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
    await sleep(Math.max(0, duration) + 300); // Add 300ms buffer to prevent audio overlap
    await hideSubtitle(page);
    await sleep(100); // Quick transition to next scene
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

        // Intro dialogue
        let dur = await speak(page, 'intro');
        await endSpeech(page, dur);
        dur = await speak(page, 'introReact');
        await endSpeech(page, dur);

        // Tree view - host explains
        dur = await speak(page, 'treeView');
        await endSpeech(page, dur);

        // Expand nodes - dev reacts
        console.log('  Expanding nodes...');
        dur = await speak(page, 'expandNodes');
        const toggles = await page.$$('.jv-toggle');
        // Expand first 4 nodes with smooth clicks
        for (let i = 0; i < Math.min(4, toggles.length); i++) {
            await smoothClick(page, toggles[i], { pauseAfter: 250 });
        }
        await sleep(150);
        // Collapse a couple back to show toggle works both ways
        console.log('  Collapsing some nodes...');
        const expandedToggles = await page.$$('.jv-toggle.jv-expanded');
        for (let i = 0; i < Math.min(2, expandedToggles.length); i++) {
            await smoothClick(page, expandedToggles[i], { pauseAfter: 200 });
        }
        await sleep(100);
        // Re-expand one
        const collapsedToggles = await page.$$('.jv-toggle:not(.jv-expanded)');
        if (collapsedToggles.length > 0) {
            await smoothClick(page, collapsedToggles[0], { pauseAfter: 200 });
        }
        await endSpeech(page, dur);

        // ========================================
        // SCENE 2: Editor View (action first, then speak)
        // ========================================
        console.log('\n📹 Recording Scene 2: Editor View');

        await smoothClick(page, '.jv-nav-btn:has-text("Editor")', { pauseAfter: 250 });
        await page.waitForSelector('.jv-editor-wrapper', { timeout: 5000 });

        dur = await speak(page, 'editorView');
        // Scroll editor while speaking - move mouse to editor area
        const editor = await page.$('.jv-editor-wrapper');
        if (editor) {
            await smoothMoveTo(page, editor, { pauseAfter: 200 });
            await editor.evaluate(el => el.scrollTop = 100);
            await sleep(300);
            await editor.evaluate(el => el.scrollTop = 0);
        }
        await endSpeech(page, dur);
        dur = await speak(page, 'editorReact');
        await endSpeech(page, dur);

        // ========================================
        // SCENE 3: Schema View (action first, then speak)
        // ========================================
        console.log('\n📹 Recording Scene 3: Schema View');

        await smoothClick(page, '.jv-nav-btn:has-text("Schema")', { pauseAfter: 250 });
        dur = await speak(page, 'schemaView');
        await endSpeech(page, dur);
        dur = await speak(page, 'schemaReact');
        await endSpeech(page, dur);

        // ========================================
        // SCENE 4: YAML View (action first, then speak)
        // ========================================
        console.log('\n📹 Recording Scene 4: YAML View');

        await smoothClick(page, '.jv-nav-btn:has-text("YAML")', { pauseAfter: 250 });
        dur = await speak(page, 'yamlView');
        await endSpeech(page, dur);
        dur = await speak(page, 'yamlReact');
        await endSpeech(page, dur);

        // ========================================
        // SCENE 5: Search functionality
        // ========================================
        console.log('\n📹 Recording Scene 5: Search');

        await smoothClick(page, '.jv-nav-btn:has-text("Tree")', { pauseAfter: 250 });

        dur = await speak(page, 'search');
        await endSpeech(page, dur);
        // Type search term with smooth mouse movement to search box
        const searchInput = await page.$('.jv-search');
        if (searchInput) {
            await smoothType(page, searchInput, 'projects', { typeDelay: 60, pauseAfter: 400 });
            dur = await speak(page, 'searchReact');
            await endSpeech(page, dur);
            await sleep(250);
            await searchInput.fill('');
        }

        // ========================================
        // SCENE 6: Expand/Collapse All
        // ========================================
        console.log('\n📹 Recording Scene 6: Expand/Collapse');

        dur = await speak(page, 'levelControls');
        await endSpeech(page, dur);

        // Click Collapse All button
        await smoothClick(page, '.jv-btn[title="Collapse All"]', { pauseAfter: 400 });

        // Click Expand All button
        await smoothClick(page, '.jv-btn[title="Expand All"]', { pauseAfter: 300 });

        // Also show level dropdown for depth control
        await smoothClick(page, '.jv-level-btn', { pauseAfter: 250 });
        const level2 = await page.$('.jv-level-item:has-text("2")');
        if (level2) {
            await smoothClick(page, level2, { pauseAfter: 250 });
        }
        dur = await speak(page, 'levelReact');
        await endSpeech(page, dur);

        // ========================================
        // SCENE 7: Copy action
        // ========================================
        console.log('\n📹 Recording Scene 7: Copy Action');

        dur = await speak(page, 'copy');
        await endSpeech(page, dur);
        await smoothClick(page, '.jv-btn[title*="Copy"]', { pauseAfter: 250 });
        dur = await speak(page, 'copyReact');
        await endSpeech(page, dur);

        // ========================================
        // SCENE 8: Theme toggle
        // ========================================
        console.log('\n📹 Recording Scene 8: Theme Toggle');

        dur = await speak(page, 'theme');
        await endSpeech(page, dur);
        // Toggle to light theme
        await smoothClick(page, '.jv-btn[title*="Theme"]', { pauseAfter: 500 });
        // Toggle back to dark
        await smoothClick(page, '.jv-btn[title*="Theme"]', { pauseAfter: 250 });
        dur = await speak(page, 'themeReact');
        await endSpeech(page, dur);

        // ========================================
        // SCENE 9: Outro
        // ========================================
        console.log('\n📹 Recording outro...');
        dur = await speak(page, 'outro');
        await endSpeech(page, dur);
        dur = await speak(page, 'outroReact');
        await endSpeech(page, dur);
        await sleep(300);

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
            // Save timeline for remix mode
            saveAudioTimeline();
        }

        // Step 1: Merge audio with browser video (or just convert to MP4)
        if ((useElevenLabs || useMacVoice) && audioTimeline.length > 0) {
            await mergeAudioWithVideo(rawVideoPath, audioTimeline, browserVideoPath);
        } else {
            // Convert browser video to MP4 without audio
            console.log('\n📦 Converting browser video to MP4...');
            try {
                execSync(`${FFMPEG} -y -i "${rawVideoPath}" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart "${browserVideoPath}"`, { stdio: 'pipe' });
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

// Remix mode - just re-mix audio with existing video (no screen recording)
async function remixVideo() {
    console.log('='.repeat(60));
    console.log('JSON Viewer - Remix Audio');
    console.log('='.repeat(60));
    console.log('Mode: REMIX (skip recording, re-mix audio only)\n');

    if (!checkFFmpeg()) {
        console.error('✗ FFmpeg required for remix');
        console.log('  Install with: brew install ffmpeg\n');
        process.exit(1);
    }

    ensureDir(outputDir);

    // Find the raw video file
    const videoFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.webm'));
    if (videoFiles.length === 0) {
        console.error('✗ No raw video file found in docs/video/');
        console.log('  Run full recording first: npm run record -- --voice\n');
        process.exit(1);
    }

    const rawVideoPath = path.join(outputDir, videoFiles[videoFiles.length - 1]);
    console.log(`✓ Found raw video: ${videoFiles[videoFiles.length - 1]}`);

    // Load or rebuild audio timeline
    let timeline = loadAudioTimeline();

    if (!timeline) {
        // Rebuild timeline from audio files with estimated timings
        console.log('\n  Rebuilding audio timeline from files...');
        const voiceKeys = Object.keys(VOICEOVER);
        let currentTime = 500; // Start 500ms in

        timeline = [];
        for (const key of voiceKeys) {
            const audioPath = path.join(audioDir, `${key}.mp3`);
            if (fs.existsSync(audioPath)) {
                const duration = getAudioDuration(audioPath);
                timeline.push({
                    voiceKey: key,
                    audioPath,
                    startTime: currentTime,
                    duration
                });
                currentTime += duration + 400; // Add gap between clips
                console.log(`    ${key}: ${(duration/1000).toFixed(1)}s`);
            }
        }
        console.log(`  Rebuilt timeline with ${timeline.length} clips`);
    }

    if (timeline.length === 0) {
        console.error('✗ No audio clips found');
        console.log('  Generate audio first: npm run record -- --voice\n');
        process.exit(1);
    }

    // Regenerate audio if needed
    if (useElevenLabs || useMacVoice) {
        audioFiles = await generateAllAudio();
    }

    const browserVideoPath = path.join(outputDir, 'browser-temp.mp4');
    const sidebarPath = path.join(outputDir, 'sidebar.png');
    const mp4Path = path.join(outputDir, 'json-viewer-demo-youtube.mp4');

    // Remove old output files
    [browserVideoPath, mp4Path].forEach(p => {
        if (fs.existsSync(p)) fs.unlinkSync(p);
    });

    // Step 1: Merge audio with video
    console.log('\n🔊 Merging audio with video...');
    await mergeAudioWithVideo(rawVideoPath, timeline, browserVideoPath);

    // Step 2: Generate sidebar if needed
    if (!fs.existsSync(sidebarPath)) {
        generateSidebarImage(sidebarPath);
    }

    // Step 3: Composite with sidebar
    if (fs.existsSync(browserVideoPath) && fs.existsSync(sidebarPath)) {
        await compositeWithSidebar(browserVideoPath, sidebarPath, mp4Path);

        // Cleanup temp file
        try { fs.unlinkSync(browserVideoPath); } catch {}
    }

    console.log('\n' + '='.repeat(60));
    console.log('REMIX COMPLETE');
    console.log('='.repeat(60));

    if (fs.existsSync(mp4Path)) {
        const mp4Stats = fs.statSync(mp4Path);
        console.log(`\n✓ Output: ${mp4Path}`);
        console.log(`  Size: ${(mp4Stats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Audio: ${timeline.length} clips`);
    } else {
        console.log('\n⚠️  Remix failed. Check errors above.');
    }
}

// Main entry point
if (remixMode) {
    remixVideo().catch(e => {
        console.error('Error:', e.message);
        process.exit(1);
    });
} else {
    recordDemo().catch(e => {
        console.error('Error:', e.message);
        process.exit(1);
    });
}
