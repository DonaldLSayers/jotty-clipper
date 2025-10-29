# Chrome Web Store Deployment Setup

This guide explains how to set up automated deployment to the Chrome Web Store via GitHub Actions.

## Prerequisites

1. **Chrome Web Store Developer Account** - $5 one-time fee

   - Sign up at: https://browser.google.com/webstore/devconsole

2. **First Manual Upload Required**
   - You must upload the extension manually once to get an Extension ID
   - After that, the GitHub Action can publish updates automatically

## Step 1: Initial Manual Upload

1. Go to [Chrome Web Store Developer Dashboard](https://browser.google.com/webstore/devconsole)
2. Click "New Item"
3. Upload `jotty-clipper-v1.0.0.zip`
4. Fill in the store listing:
   - **Name**: Jotty Clipper
   - **Summary**: Clip web content to your Jotty notes with smart extraction
   - **Description**: (Use README content)
   - **Category**: Productivity
   - **Screenshots**: Add screenshots of the popup and settings
   - **Icon**: Upload the 128x128 icon
5. Click "Save draft" (don't publish yet)
6. **Note the Extension ID** from the URL (looks like: `abcdefghijklmnopqrstuvwxyz123456`)

## Step 2: Get Chrome Web Store API Credentials

### 2.1 Enable Chrome Web Store API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Chrome Web Store API**:
   - Go to APIs & Services → Library
   - Search for "Chrome Web Store API"
   - Click Enable

### 2.2 Create OAuth Credentials

1. Go to APIs & Services → Credentials
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: **Desktop app**
4. Name: "Jotty Clipper GitHub Deploy"
5. Click "Create"
6. **Save the Client ID and Client Secret**

### 2.3 Get Refresh Token

Run this command locally (replace with your credentials):

```bash
# Install Chrome Web Store API tool
npm install -g chrome-webstore-upload-cli

# Get refresh token
chrome-webstore-upload \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET \
  --extension-id YOUR_EXTENSION_ID
```

This will open a browser and ask you to authorize. After authorization, it will display your **refresh token**. Save it!

Alternatively, use this Python script:

```python
import requests
from http.server import HTTPServer, BaseHTTPRequestHandler
import webbrowser

CLIENT_ID = "YOUR_CLIENT_ID"
CLIENT_SECRET = "YOUR_CLIENT_SECRET"
REDIRECT_URI = "http://localhost:8080"

# Step 1: Get authorization code
auth_url = f"https://accounts.google.com/o/oauth2/auth?response_type=code&client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=https://www.googleapis.com/auth/chromewebstore"
print(f"Open this URL in your browser:\n{auth_url}")
webbrowser.open(auth_url)

# Step 2: Capture the code from redirect
code = input("Paste the 'code' parameter from the redirect URL: ")

# Step 3: Exchange code for refresh token
token_url = "https://oauth2.googleapis.com/token"
data = {
    "code": code,
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "redirect_uri": REDIRECT_URI,
    "grant_type": "authorization_code"
}
response = requests.post(token_url, data=data)
tokens = response.json()

print(f"\nRefresh Token: {tokens['refresh_token']}")
```

## Step 3: Add Secrets to GitHub

1. Go to your GitHub repository: https://github.com/DonaldLSayers/jotty-clipper
2. Click Settings → Secrets and variables → Actions
3. Click "New repository secret" and add these four secrets:

| Secret Name            | Value                                    |
| ---------------------- | ---------------------------------------- |
| `CHROME_EXTENSION_ID`  | Your extension ID (from Step 1)          |
| `CHROME_CLIENT_ID`     | Your OAuth client ID (from Step 2.2)     |
| `CHROME_CLIENT_SECRET` | Your OAuth client secret (from Step 2.2) |
| `CHROME_REFRESH_TOKEN` | Your refresh token (from Step 2.3)       |

## Step 4: Test the Deployment

1. Make a small change to your extension
2. Update the version in `manifest.json` (e.g., `1.0.1`)
3. Commit and push:
   ```bash
   git add manifest.json
   git commit -m "Bump version to 1.0.1"
   git push
   ```
4. Create and push a tag:
   ```bash
   git tag v1.0.1
   git push --tags
   ```

The GitHub Action will automatically:

- Create a ZIP file
- Upload it to Chrome Web Store
- Create a GitHub Release with the ZIP attached

## How It Works

The workflow (`.github/workflows/deploy.yml`) triggers when you push a tag starting with `v` (like `v1.0.1`).

It will:

1. ✅ Package the extension as a ZIP
2. ✅ Upload to Chrome Web Store (as draft)
3. ✅ Create a GitHub Release

**Note:** The upload goes to Chrome Web Store as a **draft**. You still need to manually publish it from the dashboard (for review compliance).

## Publishing Updates

After the GitHub Action uploads:

1. Go to [Chrome Web Store Developer Dashboard](https://browser.google.com/webstore/devconsole)
2. Your extension will have a new draft version
3. Review the changes
4. Click "Submit for review"
5. Google will review (usually takes 1-3 days)

## Troubleshooting

### "Extension ID not found"

- Make sure you've done the initial manual upload
- Verify the Extension ID is correct in GitHub secrets

### "Invalid credentials"

- Regenerate your OAuth credentials
- Get a new refresh token
- Update GitHub secrets

### "Quota exceeded"

- Chrome Web Store API has rate limits
- Wait a few hours and try again

## Alternative: Manual Deployment

If you prefer manual deployment:

1. Create a ZIP: `zip -r jotty-clipper.zip . -x "*.git*"`
2. Go to Chrome Web Store Developer Dashboard
3. Click on your extension
4. Click "Upload new package"
5. Select the ZIP file
6. Click "Submit for review"

## Resources

- [Chrome Web Store Publish API](https://developer.browser.com/docs/webstore/using_webstore_api/)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [chrome-webstore-upload](https://github.com/fregante/chrome-webstore-upload)
