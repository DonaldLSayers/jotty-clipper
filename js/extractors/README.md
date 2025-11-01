# Site-Specific Extractors

This directory contains modular site-specific content extractors for the Jotty Clipper extension.

## How It Works

Each extractor is a separate JavaScript module that handles content extraction for specific websites. The extractors are automatically loaded and registered by `index.js`.

## Adding a New Extractor

To add a new site-specific extractor:

1. **Create a new file** in this directory (e.g., `twitter.js`)

2. **Define your extractor** using this template:

```javascript
// Twitter/X extractor
export default {
  name: 'Twitter',
  domains: ['twitter.com', 'x.com'],  // Array of domains this extractor handles
  extract: async () => {              // Can be async if needed
    const result = {
      title: '',
      content: '',
      metadata: {}
    };

    // Your extraction logic here
    // Use DOM selectors to find and extract content
    const titleEl = document.querySelector('.tweet-title');
    result.title = titleEl ? titleEl.textContent.trim() : document.title;

    // Build your content (typically in Markdown format)
    result.content = `# ${result.title}\n\n`;
    result.content += `Your extracted content here...\n`;

    // Add metadata
    result.metadata = {
      type: 'twitter-post',
      // any other metadata you want
    };

    return result;
  }
};
```

3. **Import it in index.js**:

```javascript
import twitterExtractor from './twitter.js';

const extractorModules = [
  youtubeExtractor,
  amazonExtractor,
  redditExtractor,
  twitterExtractor  // Add your new extractor here
];
```

4. **Update the manifest files** to include your new extractor:

Add `"js/extractors/twitter.js"` to the `web_accessible_resources` in:
- `manifest.json`
- `manifest-chrome.json`
- `manifest-firefox.json`

## Existing Extractors

### YouTube (`youtube.js`)
- Handles: `youtube.com`, `youtu.be`
- Extracts: Video title, channel, description, thumbnail, and metadata
- Features: Multiple fallback methods for description extraction

### Amazon (`amazon.js`)
- Handles: All Amazon international domains (`.com`, `.co.uk`, `.de`, etc.)
- Extracts: Product title, price, rating, images, features, description, and details
- Features: Cleans up JavaScript artifacts from Amazon's dynamic content

### Reddit (`reddit.js`)
- Handles: `reddit.com`
- Extracts: Post title, content, thumbnails (including animated GIFs), images, and embedded links
- Features: Detects and enriches links to other platforms (YouTube, Twitch, GitHub, etc.)

## Extractor Structure

Each extractor module must export a default object with:

- **name** (string): Display name for the extractor
- **domains** (array): List of domain names this extractor handles
- **extract** (function): Extraction logic that returns a result object

The result object should have:
- **title** (string): Extracted title
- **content** (string): Extracted content (typically in Markdown)
- **metadata** (object): Additional metadata about the extracted content

## Tips

- Use `document.querySelector()` and `document.querySelectorAll()` to find elements
- Format content in Markdown for better compatibility with note-taking apps
- Add multiple fallback methods for robustness (websites often change their HTML structure)
- Include helpful metadata that users might want to reference later
- Test your extractor on different types of pages from the target site
