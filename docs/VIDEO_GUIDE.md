# Video Recording & YouTube Upload Guide

This guide covers creating demo videos for JSON Viewer and uploading them to YouTube.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Recording Demo Videos](#recording-demo-videos)
- [Voice Setup](#voice-setup)
- [YouTube Upload](#youtube-upload)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### FFmpeg (Required)

FFmpeg is needed for video processing, audio merging, and format conversion.

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows (via Chocolatey)
choco install ffmpeg
```

### Playwright Browsers

The recorder uses Microsoft Edge for the best extension support:

```bash
npx playwright install msedge
```

---

## Recording Demo Videos

The project includes an automated demo recorder using Playwright. It records a live browser session demonstrating all features with optional AI voiceover.

### Quick Start

```bash
# Record without voice (subtitles only) - fastest
npm run record

# Record with AI voiceover - best quality
npm run record -- --voice

# Re-mix audio on existing video (no re-recording)
npm run remix
```

### What Gets Recorded

The demo automatically showcases:
1. **Tree View** - Expanding/collapsing nodes
2. **Editor View** - Syntax highlighting, line numbers
3. **Schema View** - Data type visualization
4. **YAML View** - JSON to YAML conversion
5. **Search** - Finding keys and values
6. **Level Controls** - Expand/collapse depth
7. **Copy to Clipboard**
8. **Theme Toggle** - Dark/light modes

### Output

| Property | Value |
|----------|-------|
| Location | `docs/video/json-viewer-demo-youtube.mp4` |
| Resolution | 1920x1080 (Full HD) |
| Format | MP4 (H.264 + AAC) |
| Duration | ~90 seconds |

---

## Voice Setup

### Option 1: ElevenLabs AI Voice (Recommended)

High-quality, natural-sounding AI voiceover with two speakers (host + developer reactions).

1. **Get API Key**
   - Sign up at [elevenlabs.io](https://elevenlabs.io) (free tier available)
   - Go to Profile → API Key → Copy

2. **Configure**

   Create `.env` file in project root:
   ```
   ELEVENLABS_API_KEY=your_api_key_here
   ```

3. **Record**
   ```bash
   npm run record -- --voice
   ```

**Voice Characters:**
- **Rachel** (Host) - Main narrator explaining features
- **Adam** (Dev) - Developer reactions and enthusiasm

### Option 2: macOS Built-in Voice (Free)

Uses macOS's "Samantha" voice. Decent quality, no API needed.

1. Remove or comment out `ELEVENLABS_API_KEY` in `.env`
2. Run: `npm run record -- --voice`

**Note:** Only works on macOS.

### Option 3: Subtitles Only (No Voice)

Silent video with on-screen captions:

```bash
npm run record
```

### Audio Caching

Generated audio files are cached in `docs/video/audio/`. To regenerate:

```bash
rm -rf docs/video/audio/
npm run record -- --voice
```

---

## YouTube Upload

Upload demo videos directly to YouTube with automated metadata, chapters, and descriptions.

### One-Time Setup

#### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click **Select a project** → **New Project**
3. Name it (e.g., "JSON Viewer Upload")
4. Click **Create**

#### Step 2: Enable YouTube API

1. In your project, go to **APIs & Services** → **Library**
2. Search for "YouTube Data API v3"
3. Click on it → **Enable**

#### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** → **Create**
3. Fill in required fields:
   - **App name:** JSON Viewer Upload
   - **User support email:** your email
   - **Developer email:** your email
4. Click **Save and Continue** through all steps (no scopes needed)
5. Click **Back to Dashboard**

#### Step 4: Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Desktop app**
4. Name: "JSON Viewer CLI"
5. Click **Create**
6. Click **Download JSON** (⬇️ icon)
7. Save as `youtube-client-secret.json` in project root

#### Step 5: Add Test User

While the app is in testing mode, you must add yourself as a test user:

1. Go to **APIs & Services** → **OAuth consent screen**
2. Scroll to **Test users**
3. Click **Add Users**
4. Enter your Google/YouTube email
5. Click **Save**

### Upload Commands

```bash
# Upload with default settings (unlisted)
npm run upload

# Custom title
npm run upload -- --title "JSON Viewer Demo - All Features"

# Upload as public
npm run upload -- --public

# Upload as private
npm run upload -- --private

# Show all options
npm run upload -- --help
```

### First Run Authorization

On first upload:

1. Browser opens automatically
2. Sign in with the Google account you added as test user
3. You'll see "Google hasn't verified this app"
   - Click **Advanced**
   - Click **Go to JSON Viewer Upload (unsafe)**
4. Click **Continue** to grant permissions
5. Return to terminal - upload proceeds automatically

The OAuth token is saved to `.youtube-token.json` for future uploads.

### Default Video Metadata

The upload script automatically sets:

| Field | Value |
|-------|-------|
| Title | "JSON Viewer - Chrome Extension Demo \| Tree, Editor, Schema, YAML Views" |
| Description | Features, Chrome Web Store link, GitHub link, chapters |
| Tags | JSON, Chrome Extension, Developer Tools, etc. |
| Category | Science & Technology |
| Privacy | Unlisted |

### Video Chapters

The description includes YouTube chapters:
```
0:00 Intro - The JSON problem
0:08 Tree View - Collapsible nodes
0:18 Editor View - Syntax highlighting
0:28 Schema View - Data types
0:38 YAML View - Instant conversion
0:48 Search - Find anything
1:00 Level Controls - Expand/collapse
1:10 Copy to Clipboard
1:18 Theme Toggle - Dark/Light
1:28 Outro
```

---

## Troubleshooting

### Recording Issues

| Problem | Solution |
|---------|----------|
| "Browser not found" | Run `npx playwright install msedge` |
| "FFmpeg not found" | Install FFmpeg (see Prerequisites) |
| Video has no audio | Run with `--voice` flag |
| Subtitles not showing | Check browser console for errors |

### Voice Issues

| Problem | Solution |
|---------|----------|
| "API key invalid" | Verify `ELEVENLABS_API_KEY` in `.env` |
| "Rate limit exceeded" | Wait a few minutes, ElevenLabs has rate limits |
| Audio sounds robotic | Use ElevenLabs instead of macOS voice |
| Wrong voice | Delete `docs/video/audio/` and re-record |

### YouTube Upload Issues

| Problem | Solution |
|---------|----------|
| "App not verified" | Add your email as test user (Step 5 above) |
| "Access denied" | Ensure YouTube Data API v3 is enabled |
| "Invalid client" | Re-download `youtube-client-secret.json` |
| "Token expired" | Delete `.youtube-token.json` and re-authorize |
| "Quota exceeded" | YouTube API has daily limits, wait 24h |

---

## Security Notes

These files contain sensitive credentials and are in `.gitignore`:

| File | Contains |
|------|----------|
| `.env` | ElevenLabs API key |
| `youtube-client-secret.json` | Google OAuth credentials |
| `.youtube-token.json` | Your OAuth access token |

**Never commit these files to version control.**

---

## Customization

### Changing Voice Scripts

Edit the `VOICEOVER` object in `scripts/record-demo.mjs`:

```javascript
const VOICEOVER = {
    intro: { text: "Your custom intro text", voice: 'host' },
    // ...
};
```

### Changing Video Layout

In `scripts/record-demo.mjs`:

```javascript
const BROWSER_SIZE = { width: 1280, height: 720 };  // Recording size
const FINAL_SIZE = { width: 1920, height: 1080 };   // Output size
const ENABLE_SIDEBAR = false;  // Set true for branded sidebar
```

### Adding New Scenes

Add new scenes in the `recordDemo()` function following the existing pattern:

```javascript
// Your new scene
console.log('\n📹 Recording Scene X: Feature Name');
dur = await speak(page, 'yourVoiceKey');
// ... your actions
await endSpeech(page, dur);
```
