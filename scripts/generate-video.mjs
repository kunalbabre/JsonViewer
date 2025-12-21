#!/usr/bin/env node
/**
 * Promo Video Generator for JSON Viewer
 *
 * Creates a promotional video from screenshots using FFmpeg.
 *
 * Prerequisites:
 *   brew install ffmpeg
 *
 * Run with:
 *   npm run video
 */

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const storeDir = path.join(rootDir, 'docs', 'store');
const screenshotsDir = path.join(rootDir, 'docs', 'screenshots');
const outputDir = path.join(rootDir, 'docs', 'video');

// Video settings
const VIDEO_WIDTH = 1920;
const VIDEO_HEIGHT = 1080;
const FPS = 30;
const SLIDE_DURATION = 3; // seconds per slide
const TRANSITION_DURATION = 0.5; // seconds for fade transition

// Slides configuration
const SLIDES = [
    {
        type: 'title',
        title: 'JSON Viewer',
        subtitle: 'Transform raw JSON into something beautiful',
        duration: 3
    },
    {
        type: 'screenshot',
        file: 'screenshot-1-tree.png',
        caption: 'Tree View - Explore nested structures',
        duration: 3
    },
    {
        type: 'screenshot',
        file: 'screenshot-2-editor.png',
        caption: 'Editor View - Edit with syntax highlighting',
        duration: 3
    },
    {
        type: 'screenshot',
        file: 'screenshot-3-schema.png',
        caption: 'Schema View - Visualize data types',
        duration: 3
    },
    {
        type: 'screenshot',
        file: 'screenshot-4-yaml.png',
        caption: 'YAML View - Instant conversion',
        duration: 3
    },
    {
        type: 'screenshot',
        file: 'screenshot-5-search.png',
        caption: 'Powerful Search - Find anything instantly',
        duration: 3
    },
    {
        type: 'features',
        title: 'Key Features',
        items: [
            'Five view modes',
            'Dark & light themes',
            'Keyboard shortcuts',
            '100% offline & private',
            'DevTools integration'
        ],
        duration: 4
    },
    {
        type: 'cta',
        title: 'Get JSON Viewer',
        subtitle: 'Free on Chrome Web Store',
        duration: 3
    }
];

function log(msg) {
    console.log(`\x1b[36m${msg}\x1b[0m`);
}

function success(msg) {
    console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
}

function error(msg) {
    console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
}

function checkFFmpeg() {
    try {
        execSync('ffmpeg -version', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

function createTitleSlide(slide, outputPath) {
    const { title, subtitle } = slide;

    // Create title slide using FFmpeg with drawtext
    const cmd = [
        'ffmpeg', '-y',
        '-f', 'lavfi',
        '-i', `color=c=0x1a1a2e:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=1`,
        '-vf', [
            // Gradient background effect (simulated with multiple color overlays)
            `drawbox=x=0:y=0:w=${VIDEO_WIDTH}:h=${VIDEO_HEIGHT}:c=0x16213e@0.5:t=fill`,
            // Main title
            `drawtext=text='${title}':fontsize=120:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-60:fontfile=/System/Library/Fonts/Helvetica.ttc`,
            // Subtitle
            `drawtext=text='${subtitle}':fontsize=36:fontcolor=0xcccccc:x=(w-text_w)/2:y=(h-text_h)/2+80:fontfile=/System/Library/Fonts/Helvetica.ttc`
        ].join(','),
        '-frames:v', '1',
        outputPath
    ];

    execSync(cmd.join(' '), { stdio: 'pipe' });
}

function createScreenshotSlide(slide, outputPath) {
    const { file, caption } = slide;
    const inputPath = path.join(storeDir, file);

    if (!fs.existsSync(inputPath)) {
        error(`Screenshot not found: ${file}`);
        return false;
    }

    // Scale screenshot to video size and add caption
    const cmd = [
        'ffmpeg', '-y',
        '-i', `"${inputPath}"`,
        '-vf', [
            `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease`,
            `pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=0x1a1a2e`,
            // Caption bar at bottom
            `drawbox=x=0:y=${VIDEO_HEIGHT - 80}:w=${VIDEO_WIDTH}:h=80:c=0x000000@0.7:t=fill`,
            `drawtext=text='${caption}':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=${VIDEO_HEIGHT - 55}:fontfile=/System/Library/Fonts/Helvetica.ttc`
        ].join(','),
        '-frames:v', '1',
        outputPath
    ];

    execSync(cmd.join(' '), { stdio: 'pipe' });
    return true;
}

function createFeaturesSlide(slide, outputPath) {
    const { title, items } = slide;

    // Build feature list text
    const itemsText = items.map((item, i) =>
        `drawtext=text='• ${item}':fontsize=36:fontcolor=white:x=${VIDEO_WIDTH/2 - 200}:y=${400 + i * 60}:fontfile=/System/Library/Fonts/Helvetica.ttc`
    ).join(',');

    const cmd = [
        'ffmpeg', '-y',
        '-f', 'lavfi',
        '-i', `color=c=0x1a1a2e:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=1`,
        '-vf', [
            `drawbox=x=0:y=0:w=${VIDEO_WIDTH}:h=${VIDEO_HEIGHT}:c=0x16213e@0.5:t=fill`,
            `drawtext=text='${title}':fontsize=72:fontcolor=0x10b981:x=(w-text_w)/2:y=200:fontfile=/System/Library/Fonts/Helvetica.ttc`,
            itemsText
        ].join(','),
        '-frames:v', '1',
        outputPath
    ];

    execSync(cmd.join(' '), { stdio: 'pipe' });
}

function createCTASlide(slide, outputPath) {
    const { title, subtitle } = slide;

    const cmd = [
        'ffmpeg', '-y',
        '-f', 'lavfi',
        '-i', `color=c=0x10b981:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=1`,
        '-vf', [
            `drawtext=text='${title}':fontsize=96:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-40:fontfile=/System/Library/Fonts/Helvetica.ttc`,
            `drawtext=text='${subtitle}':fontsize=36:fontcolor=0xffffff@0.9:x=(w-text_w)/2:y=(h-text_h)/2+80:fontfile=/System/Library/Fonts/Helvetica.ttc`
        ].join(','),
        '-frames:v', '1',
        outputPath
    ];

    execSync(cmd.join(' '), { stdio: 'pipe' });
}

async function generateVideo() {
    console.log('='.repeat(60));
    console.log('JSON Viewer - Promo Video Generator');
    console.log('='.repeat(60));

    // Check FFmpeg
    log('\n1. Checking FFmpeg...');
    if (!checkFFmpeg()) {
        error('FFmpeg not found. Install with: brew install ffmpeg');
        process.exit(1);
    }
    success('FFmpeg found');

    // Create output directory
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate individual slide images
    log('\n2. Generating slide images...');
    const slideImages = [];

    for (let i = 0; i < SLIDES.length; i++) {
        const slide = SLIDES[i];
        const outputPath = path.join(outputDir, `slide_${String(i).padStart(2, '0')}.png`);

        try {
            switch (slide.type) {
                case 'title':
                    createTitleSlide(slide, outputPath);
                    break;
                case 'screenshot':
                    createScreenshotSlide(slide, outputPath);
                    break;
                case 'features':
                    createFeaturesSlide(slide, outputPath);
                    break;
                case 'cta':
                    createCTASlide(slide, outputPath);
                    break;
            }
            slideImages.push({ path: outputPath, duration: slide.duration });
            console.log(`  ✓ Slide ${i + 1}: ${slide.type}`);
        } catch (e) {
            error(`Failed to create slide ${i + 1}: ${e.message}`);
        }
    }

    // Create concat file for FFmpeg
    log('\n3. Creating video from slides...');
    const concatFile = path.join(outputDir, 'concat.txt');
    const concatContent = slideImages.map(s =>
        `file '${path.basename(s.path)}'\nduration ${s.duration}`
    ).join('\n');
    fs.writeFileSync(concatFile, concatContent);

    // Generate video with crossfade transitions
    const outputVideo = path.join(outputDir, 'promo.mp4');

    try {
        // Simple concat approach (works reliably)
        const cmd = [
            'ffmpeg', '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', `"${concatFile}"`,
            '-vf', `fps=${FPS},format=yuv420p`,
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '23',
            '-movflags', '+faststart',
            `"${outputVideo}"`
        ];

        execSync(cmd.join(' '), { cwd: outputDir, stdio: 'inherit' });
        success(`Video created: ${outputVideo}`);
    } catch (e) {
        error(`Video creation failed: ${e.message}`);
        process.exit(1);
    }

    // Also create a GIF version for GitHub
    log('\n4. Creating GIF preview...');
    const outputGif = path.join(outputDir, 'promo.gif');

    try {
        const gifCmd = [
            'ffmpeg', '-y',
            '-i', `"${outputVideo}"`,
            '-vf', 'fps=10,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
            '-loop', '0',
            `"${outputGif}"`
        ];

        execSync(gifCmd.join(' '), { stdio: 'pipe' });
        success(`GIF created: ${outputGif}`);
    } catch (e) {
        console.log('  (GIF creation skipped - optional)');
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('VIDEO GENERATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nOutput files:`);
    console.log(`  ${outputVideo}`);
    if (fs.existsSync(outputGif)) {
        console.log(`  ${outputGif}`);
    }

    // Get video duration
    try {
        const duration = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputVideo}"`, { encoding: 'utf-8' });
        console.log(`\nVideo duration: ${parseFloat(duration).toFixed(1)} seconds`);
    } catch {}

    console.log('\nNext steps:');
    console.log('  1. Review the video: open docs/video/promo.mp4');
    console.log('  2. Upload to YouTube or use for store listing');
}

generateVideo().catch(e => {
    error(e.message);
    process.exit(1);
});
