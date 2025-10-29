# Jotty Clipper

A Chrome extension for clipping web content to your [Jotty](https://github.com/fccview/jotty) notes with intelligent extraction for popular websites.

## Features

- **Smart Content Extraction**: Automatically detects and extracts the main content from web pages
- **Site-Specific Extractors**: Optimized clipping for:
  - **Reddit**: Clips main post content with embedded images and videos
  - **YouTube**: Extracts video title and full description (not truncated)
  - **Twitter/X**: Captures tweets with images
  - **Medium**: Saves articles with proper formatting
  - **GitHub**: Clips repositories, issues, and pull requests
  - **Stack Overflow**: Saves questions with accepted answers
- **Multiple Clip Modes**:
  - Auto: Smart extraction based on the site
  - Full Page: Captures entire page content
  - Selection: Clips only selected text
- **Context Menu Integration**: Right-click to clip selections, images, links, or full pages
- **Customizable Settings**: Configure your Jotty instance URL, API key, and default category

## Installation

### From Source

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the `jotty-clipper` folder

## Configuration

1. Click the Jotty Clipper icon in your Chrome toolbar
2. Click "Settings" or "Configure API settings"
3. Enter your configuration:
   - **Jotty URL**: Your Jotty instance URL (e.g., `https://your-jotty.com`)
   - **API Key**: Your personal API key from Jotty
   - **Default Category**: (Optional) Choose a default category for clips
4. Click "Test Connection" to verify your settings
5. Click "Save Settings"

## Usage

### Using the Popup

1. Navigate to any web page
2. Click the Jotty Clipper icon
3. Select a category (if not using default)
4. Choose a clip type:
   - **Auto**: Smart extraction based on the website
   - **Full Page**: Capture everything
   - **Selection**: Clip selected text only
5. Optionally edit the title
6. Click "Clip to Jotty"

### Using the Context Menu

Right-click on any page element:
- **Clip selection to Jotty**: Saves highlighted text
- **Clip page to Jotty**: Saves the entire page
- **Clip image to Jotty**: Saves an image with its URL
- **Clip link to Jotty**: Saves a link reference

## About Jotty

[Jotty](https://github.com/fccview/jotty) is a modern note-taking and checklist application. This extension allows you to quickly save web content to your Jotty notes with smart extraction tailored to each website.

## Site-Specific Features

### YouTube

The extension extracts the **full video description**, not the truncated version shown initially. It automatically expands the description section to capture all content.

**Extracted data:**
- Video title
- Channel name
- View count
- Upload date
- Complete description
- Video thumbnail
- Video URL

### Reddit

Clips the main post content while preserving:
- Post title
- Post text content
- Embedded images (from Reddit and Imgur)
- Video links
- Author and subreddit information
- Timestamp

### Twitter/X

Captures:
- Tweet text
- Author information
- Embedded images
- Timestamp

### Medium

Extracts:
- Article title
- Full article content with formatting
- Author name
- Publication date
- Proper markdown conversion

### GitHub

Supports:
- Repository READMEs
- Issue descriptions
- Pull request details
- Markdown content preservation

### Stack Overflow

Saves:
- Question title and body
- Accepted answer
- Code snippets with syntax preservation
- Question tags

## Development

### Project Structure

```
jotty-clipper/
├── manifest.json          # Extension manifest
├── popup.html            # Popup interface
├── popup.css             # Popup styles
├── popup.js              # Popup logic
├── options.html          # Settings page
├── options.css           # Settings styles
├── options.js            # Settings logic
├── content.js            # Content extraction scripts
├── background.js         # Background service worker
├── README.md             # Documentation
├── README_EXTRACTORS.md  # Guide for adding extractors
└── icons/                # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### Adding New Site Extractors

See [README_EXTRACTORS.md](README_EXTRACTORS.md) for a comprehensive guide on adding custom extractors for new websites.

## API Requirements

Your Jotty instance must support the following API endpoints:

- `GET /api/notes` - List all notes (used to fetch categories)
- `POST /api/notes` - Create a new note

### Note Creation Request Format

```json
{
  "title": "Note title",
  "content": "Note content in markdown",
  "category": "Category Name"
}
```

**Authentication:** Uses `x-api-key` header with your Jotty API key.

## Troubleshooting

### Categories Not Loading

- Verify your Jotty URL is correct (no trailing slash)
- Check that your API key is valid
- Ensure your Jotty instance is accessible
- Use "Test Connection" in settings to diagnose

### Content Not Extracting

- Make sure the content script has loaded (refresh the page after installing)
- Try different clip modes (Auto, Full Page, Selection)
- Check the browser console for errors

### YouTube Description Truncated

The extension automatically expands descriptions, but if you still see truncation:
1. Manually click "Show more" on the YouTube page first
2. Wait a moment for the page to load completely
3. Then use the clipper

## Privacy

This extension:
- Only communicates with your configured Jotty instance
- Does not collect or transmit data to third parties
- Stores API credentials locally in Chrome's secure storage
- Requires host permissions to extract content from web pages

## License

MIT License - Feel free to modify and distribute

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

## Version History

### v1.0.0
- Initial release
- Support for Reddit, YouTube, Twitter, Medium, GitHub, Stack Overflow
- Smart content extraction
- Context menu integration
- Configurable settings

## Related Projects

- **[Jotty](https://github.com/fccview/jotty)** - The note-taking application this extension is built for
