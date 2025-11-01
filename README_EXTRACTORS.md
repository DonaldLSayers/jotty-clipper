# Adding New Site Extractors

This guide shows you how to add custom content extractors for new websites.

## Quick Start

All extractors are now **modular** - each site has its own file in the `js/extractors/` directory. See the detailed [js/extractors/README.md](js/extractors/README.md) for more info.

## How to Add a New Extractor

### 1. Create Your Extractor File

Create a new file in `js/extractors/` (e.g., `js/extractors/twitter.js`):

```javascript
// Twitter/X extractor
(function() {
  'use strict';

  if (typeof window.JottyExtractors === 'undefined') {
    window.JottyExtractors = {};
  }

  window.JottyExtractors.twitter = {
    name: 'Twitter',
    domains: ['twitter.com', 'x.com'],
    extract: () => {
      const result = {
        title: '',
        content: '',
        metadata: {}
      };

      // 1. Get title
      const titleEl = document.querySelector('[data-testid="tweet"] div[lang]');
      result.title = titleEl ? titleEl.textContent.trim() : document.title;

      // 2. Build content
      let content = `# ${result.title}\n\n`;

      // Extract tweet text
      const tweetText = document.querySelector('[data-testid="tweetText"]');
      if (tweetText) {
        content += tweetText.textContent.trim() + '\n\n';
      }

      // Extract images
      const images = document.querySelectorAll('[data-testid="tweetPhoto"] img');
      images.forEach((img, idx) => {
        if (img.src) {
          content += `![Image ${idx + 1}](${img.src})\n\n`;
        }
      });

      result.content = content;

      // 3. Add metadata
      result.metadata = {
        author: 'Author name here',
        type: 'twitter-post'
      };

      return result;
    }
  };
})();
```

**Important:** Use the IIFE pattern shown above - browser extensions don't support ES6 modules in content scripts.

### 2. Register in index.js

Add your extractor to `js/extractors/index.js`:

```javascript
// Import your extractor
window.JottyExtractors.loadExtractors = function() {
  const extractors = {};

  // Get all registered extractors
  const extractorModules = [
    window.JottyExtractors.youtube,
    window.JottyExtractors.amazon,
    window.JottyExtractors.reddit,
    window.JottyExtractors.twitter  // <-- Add your extractor here
  ];

  // ... rest of the code
};
```

### 3. Update Manifest Files

Add your extractor file to the `web_accessible_resources` in **all three** manifest files:

**manifest.json:**
```json
"web_accessible_resources": [
  {
    "resources": [
      "js/content.js",
      "js/browser-polyfill.min.js",
      "js/global.js",
      "js/options.js",
      "js/popup.js",
      "js/readability.js",
      "js/extractors/index.js",
      "js/extractors/youtube.js",
      "js/extractors/amazon.js",
      "js/extractors/reddit.js",
      "js/extractors/twitter.js",  // <-- Add here
      "icons/lucide/lucide.min.js"
    ],
    "matches": ["*://*/*"]
  }
]
```

Repeat for `manifest-chrome.json` and `manifest-firefox.json`.

### 4. Update Injection Scripts

Add your extractor to the injection list in **both** `background.js` and `js/popup.js`:

**background.js:**
```javascript
await browser.scripting.executeScript({
  target: { tabId: tabId },
  files: [
    'js/browser-polyfill.min.js',
    'js/extractors/youtube.js',
    'js/extractors/amazon.js',
    'js/extractors/reddit.js',
    'js/extractors/twitter.js',  // <-- Add here
    'js/extractors/index.js',
    'js/content.js'
  ]
});
```

**js/popup.js:**
```javascript
await browser.scripting.executeScript({
  target: { tabId: currentTab.id },
  files: [
    'js/browser-polyfill.min.js',
    'js/extractors/youtube.js',
    'js/extractors/amazon.js',
    'js/extractors/reddit.js',
    'js/extractors/twitter.js',  // <-- Add here
    'js/extractors/index.js',
    'js/content.js'
  ]
});
```

### 5. Reload Extension

1. Save all files
2. Go to `chrome://extensions/` (or `about:addons` in Firefox)
3. Click reload on Jotty Clipper
4. Test on the target website

## Development Tips

### Finding Selectors

1. **Open DevTools** (F12) on the target website
2. **Right-click** elements you want to extract → Inspect
3. **Note the selectors** (classes, IDs, data attributes)
4. **Test in Console:**
   ```javascript
   document.querySelector('h1.title')
   document.querySelectorAll('.content p')
   ```

### Common Patterns

**Handle Missing Elements:**
```javascript
const author = document.querySelector('.author');
if (author) {
  content += `**Author:** ${author.textContent.trim()}\n\n`;
}
```

**Multiple Selectors (Fallbacks):**
```javascript
const title = document.querySelector('h1.new-class') ||
              document.querySelector('h1.old-class') ||
              document.querySelector('h1');
```

**Async Extractors:**
```javascript
extract: async () => {  // <-- Add 'async'
  const result = { title: '', content: '', metadata: {} };

  // Click "Show More" button
  const btn = document.querySelector('.show-more');
  if (btn) {
    btn.click();
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
  }

  // Now extract expanded content
  result.title = document.querySelector('h1').textContent.trim();
  return result;
}
```

### Debugging

Add console logging to debug:

```javascript
extract: () => {
  console.log('🔍 Twitter extractor starting...');

  const titleEl = document.querySelector('[data-testid="tweet"]');
  console.log('✓ Found title element:', titleEl);
  console.log('Title text:', titleEl?.textContent);

  // ... rest of code
}
```

## Current Extractors

The extension includes extractors for:
- ✅ **YouTube** - Video title, description, thumbnail, channel info
- ✅ **Amazon** - Product name, image, price, rating, features, specs
- ✅ **Reddit** - Post title, content, images, embedded links

Check `js/extractors/` to see how they work!

## Example: Look at Amazon

The Amazon extractor (`js/extractors/amazon.js`) is a good example:
- Handles multiple domains (all Amazon international sites)
- Multiple fallback selectors for each element
- Clean text extraction
- Debug logging with console.log

## Need Help?

1. Check existing extractors in `js/extractors/` for examples
2. Read the detailed guide: [js/extractors/README.md](js/extractors/README.md)
3. Use Chrome DevTools to inspect page structure
4. Test selectors in the console before adding them

Happy clipping! 🎉
