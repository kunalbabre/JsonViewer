#!/usr/bin/env node
/**
 * YouTube Upload Script for JSON Viewer Demo Videos
 *
 * Uploads recorded demo videos to YouTube using the YouTube Data API v3.
 *
 * Setup (one-time):
 * 1. Go to Google Cloud Console: https://console.cloud.google.com
 * 2. Create a new project or select existing one
 * 3. Enable "YouTube Data API v3"
 * 4. Create OAuth 2.0 credentials (Desktop App type)
 * 5. Download the credentials JSON file
 * 6. Save as 'youtube-client-secret.json' in project root (or set YOUTUBE_CLIENT_SECRET_PATH)
 *
 * Usage:
 *   npm run upload                    # Upload with default settings
 *   npm run upload -- --title "My Video"  # Custom title
 *   npm run upload -- --private       # Upload as private (default: unlisted)
 *   npm run upload -- --public        # Upload as public
 *
 * Environment variables:
 *   YOUTUBE_CLIENT_SECRET_PATH  - Path to OAuth client secret JSON (default: ./youtube-client-secret.json)
 *   YOUTUBE_TOKEN_PATH          - Path to store OAuth token (default: ./.youtube-token.json)
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const videoDir = path.join(projectRoot, 'docs', 'video');

// Default video metadata
const DEFAULT_TITLE = 'JSON Viewer - Chrome Extension Demo';
const DEFAULT_DESCRIPTION = `JSON Viewer - Transform raw JSON into beautiful, readable format.

Features:
- Tree View with expand/collapse
- Editor mode with syntax highlighting
- Schema view showing data types
- YAML export
- Dark & Light themes
- Search functionality
- Copy to clipboard

Get it free on Chrome Web Store!

100% offline and private - your data never leaves your browser.

#JSONViewer #ChromeExtension #DeveloperTools #JSON #WebDevelopment`;

const DEFAULT_TAGS = [
    'JSON Viewer',
    'Chrome Extension',
    'Developer Tools',
    'JSON',
    'API',
    'Web Development',
    'JSON Formatter',
    'JSON Editor',
    'Browser Extension'
];

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        tags: DEFAULT_TAGS,
        privacy: 'unlisted', // unlisted, private, or public
        videoPath: path.join(videoDir, 'json-viewer-demo-youtube.mp4')
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--title' && args[i + 1]) {
            options.title = args[++i];
        } else if (arg === '--description' && args[i + 1]) {
            options.description = args[++i];
        } else if (arg === '--private') {
            options.privacy = 'private';
        } else if (arg === '--public') {
            options.privacy = 'public';
        } else if (arg === '--unlisted') {
            options.privacy = 'unlisted';
        } else if (arg === '--video' && args[i + 1]) {
            options.videoPath = args[++i];
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
YouTube Upload Script

Usage: npm run upload [options]

Options:
  --title <title>       Video title (default: "${DEFAULT_TITLE}")
  --description <desc>  Video description
  --private             Upload as private
  --public              Upload as public
  --unlisted            Upload as unlisted (default)
  --video <path>        Path to video file
  --help, -h            Show this help

Setup:
  1. Create OAuth credentials at https://console.cloud.google.com
  2. Save client secret as 'youtube-client-secret.json' in project root
  3. Run this script - it will open browser for one-time auth
`);
            process.exit(0);
        }
    }

    return options;
}

// Load .env file if it exists
function loadEnvFile() {
    const envPath = path.join(projectRoot, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        for (const line of envContent.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex > 0) {
                const key = trimmed.slice(0, eqIndex).trim();
                let value = trimmed.slice(eqIndex + 1).trim();
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                if (!process.env[key]) {
                    process.env[key] = value;
                }
            }
        }
    }
}

// Dynamically import googleapis (installed on first run)
async function getGoogleApis() {
    try {
        const { google } = await import('googleapis');
        return google;
    } catch (e) {
        console.log('\nInstalling googleapis package...');
        await new Promise((resolve, reject) => {
            exec('npm install googleapis --save-dev', { cwd: projectRoot }, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        const { google } = await import('googleapis');
        return google;
    }
}

// Start local server for OAuth callback
function startAuthServer(port) {
    return new Promise((resolve) => {
        let authCode = null;
        const server = http.createServer((req, res) => {
            const url = new URL(req.url, `http://localhost:${port}`);
            const code = url.searchParams.get('code');
            if (code) {
                authCode = code;
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
                    <html>
                    <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e; color: white;">
                        <div style="text-align: center;">
                            <h1 style="color: #10b981;">Authorization Successful!</h1>
                            <p>You can close this window and return to the terminal.</p>
                        </div>
                    </body>
                    </html>
                `);
                setTimeout(() => {
                    server.close();
                    resolve(authCode);
                }, 1000);
            } else {
                res.writeHead(400);
                res.end('Missing authorization code');
            }
        });
        server.listen(port, () => {
            resolve({ server, getCode: () => authCode });
        });
    });
}

// Open URL in browser
function openBrowser(url) {
    const platform = process.platform;
    let cmd;
    if (platform === 'darwin') {
        cmd = `open "${url}"`;
    } else if (platform === 'win32') {
        cmd = `start "${url}"`;
    } else {
        cmd = `xdg-open "${url}"`;
    }
    exec(cmd);
}

// Authenticate with YouTube API
async function authenticate(google, clientSecretPath, tokenPath) {
    // Load client credentials
    if (!fs.existsSync(clientSecretPath)) {
        console.error(`\nClient secret file not found: ${clientSecretPath}`);
        console.log(`
Setup instructions:
1. Go to https://console.cloud.google.com
2. Create/select a project
3. Enable "YouTube Data API v3"
4. Go to Credentials > Create Credentials > OAuth 2.0 Client ID
5. Select "Desktop App" as application type
6. Download the JSON file
7. Save it as '${path.basename(clientSecretPath)}' in project root
`);
        process.exit(1);
    }

    const credentials = JSON.parse(fs.readFileSync(clientSecretPath, 'utf-8'));
    const { client_id, client_secret } = credentials.installed || credentials.web || {};

    if (!client_id || !client_secret) {
        console.error('\nInvalid client secret file format');
        process.exit(1);
    }

    const REDIRECT_PORT = 8085;
    const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;

    const oauth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        REDIRECT_URI
    );

    // Check for existing token
    if (fs.existsSync(tokenPath)) {
        try {
            const token = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
            oauth2Client.setCredentials(token);

            // Check if token is expired and refresh if needed
            if (token.expiry_date && token.expiry_date < Date.now()) {
                console.log('Refreshing access token...');
                const { credentials } = await oauth2Client.refreshAccessToken();
                oauth2Client.setCredentials(credentials);
                fs.writeFileSync(tokenPath, JSON.stringify(credentials, null, 2));
            }

            console.log('Using saved authentication token');
            return oauth2Client;
        } catch (e) {
            console.log('Saved token invalid, re-authenticating...');
        }
    }

    // Start auth server and get authorization
    console.log('\nStarting OAuth flow...');
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/youtube.upload']
    });

    // Start local server for callback
    const serverResult = await startAuthServer(REDIRECT_PORT);

    if (serverResult.server) {
        console.log(`Opening browser for authorization...`);
        console.log(`\nIf browser doesn't open, visit:\n${authUrl}\n`);
        openBrowser(authUrl);

        // Wait for authorization code
        const code = await new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                const code = serverResult.getCode();
                if (code) {
                    clearInterval(checkInterval);
                    serverResult.server.close();
                    resolve(code);
                }
            }, 500);

            // Timeout after 5 minutes
            setTimeout(() => {
                clearInterval(checkInterval);
                serverResult.server.close();
                resolve(null);
            }, 300000);
        });

        if (!code) {
            console.error('\nAuthorization timed out or failed');
            process.exit(1);
        }

        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Save token for future use
        fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
        console.log('Authorization successful! Token saved.');

        return oauth2Client;
    }

    console.error('\nFailed to start auth server');
    process.exit(1);
}

// Upload video to YouTube
async function uploadVideo(youtube, options) {
    const { videoPath, title, description, tags, privacy } = options;

    if (!fs.existsSync(videoPath)) {
        console.error(`\nVideo file not found: ${videoPath}`);
        console.log('Run "npm run record" first to create a demo video.');
        process.exit(1);
    }

    const fileSize = fs.statSync(videoPath).size;
    console.log(`\nUploading: ${path.basename(videoPath)}`);
    console.log(`Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Title: ${title}`);
    console.log(`Privacy: ${privacy}`);

    const res = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
            snippet: {
                title,
                description,
                tags,
                categoryId: '28' // Science & Technology
            },
            status: {
                privacyStatus: privacy,
                selfDeclaredMadeForKids: false
            }
        },
        media: {
            body: fs.createReadStream(videoPath)
        }
    }, {
        // Track upload progress
        onUploadProgress: (evt) => {
            const progress = (evt.bytesRead / fileSize * 100).toFixed(1);
            process.stdout.write(`\rProgress: ${progress}% (${(evt.bytesRead / 1024 / 1024).toFixed(1)} MB)`);
        }
    });

    return res.data;
}

// Main function
async function main() {
    console.log('='.repeat(60));
    console.log('YouTube Upload - JSON Viewer Demo');
    console.log('='.repeat(60));

    loadEnvFile();
    const options = parseArgs();

    // Paths for credentials and token
    const clientSecretPath = process.env.YOUTUBE_CLIENT_SECRET_PATH ||
        path.join(projectRoot, 'youtube-client-secret.json');
    const tokenPath = process.env.YOUTUBE_TOKEN_PATH ||
        path.join(projectRoot, '.youtube-token.json');

    // Get googleapis
    const google = await getGoogleApis();

    // Authenticate
    const auth = await authenticate(google, clientSecretPath, tokenPath);
    const youtube = google.youtube({ version: 'v3', auth });

    // Upload video
    try {
        const result = await uploadVideo(youtube, options);
        console.log('\n\n' + '='.repeat(60));
        console.log('UPLOAD COMPLETE');
        console.log('='.repeat(60));
        console.log(`\nVideo ID: ${result.id}`);
        console.log(`URL: https://www.youtube.com/watch?v=${result.id}`);
        console.log(`Status: ${result.status.uploadStatus}`);
        if (options.privacy === 'private' || options.privacy === 'unlisted') {
            console.log(`\nNote: Video is ${options.privacy}. Change privacy in YouTube Studio to make it public.`);
        }
    } catch (error) {
        console.error('\n\nUpload failed:', error.message);
        if (error.errors) {
            error.errors.forEach(e => console.error(`  - ${e.message}`));
        }
        process.exit(1);
    }
}

main().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
