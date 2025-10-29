# Adding New Site Extractors

This guide shows you how to add custom content extractors for new websites.

## Quick Guide

All extractors are in `content.js` in the `extractors` object (starts around line 5).

### Basic Template

```javascript
// Your Site extractor
'example.com': {
  name: 'Example',
  extract: () => {
    const result = {
      title: '',
      content: '',
      metadata: {}
    };

    // 1. Get title
    const titleEl = document.querySelector('h1');
    result.title = titleEl ? titleEl.textContent.trim() : document.title;

    // 2. Build content
    let content = `# ${result.title}\n\n`;

    // Extract main text
    const article = document.querySelector('article');
    if (article) {
      content += article.innerText.trim() + '\n\n';
    }

    // Extract images
    const images = document.querySelectorAll('img.content-image');
    images.forEach((img, idx) => {
      if (img.src) {
        content += `![Image ${idx + 1}](${img.src})\n\n`;
      }
    });

    result.content = content;

    // 3. Add metadata
    result.metadata = {
      author: 'Author name here',
      type: 'example-type'
    };

    return result;
  }
},
```

## Where to Add

Open `content.js` and find:

```javascript
const extractors = {
  // Reddit extractor
  'reddit.com': {
    ...
  },

  // ADD YOUR NEW EXTRACTOR HERE (before the closing };)

};
```

Add your extractor before the final `};`

## Step-by-Step

### 1. Open DevTools on Target Site

- Press F12 on the website
- Right-click elements you want to extract → Inspect
- Note the selectors (classes, IDs, tags)

### 2. Find Selectors

Examples:
- Title: `h1.post-title` or `#article-title`
- Content: `article.main-content` or `.post-body`
- Author: `.author-name` or `[data-author]`
- Images: `img.article-image`

### 3. Test Selectors in Console

In DevTools Console, test:
```javascript
document.querySelector('h1.title')
document.querySelectorAll('p')
```

### 4. Write Your Extractor

Copy the template above and modify the selectors.

### 5. Reload Extension

1. Save `content.js`
2. Go to `chrome://extensions/`
3. Click reload on Jotty Clipper
4. Test on the target website

## Examples

### News Article

```javascript
'news.example.com': {
  name: 'Example News',
  extract: () => {
    const result = { title: '', content: '', metadata: {} };

    // Title
    result.title = document.querySelector('h1.headline').textContent.trim();

    // Content
    let content = `# ${result.title}\n\n`;

    // Byline
    const author = document.querySelector('.byline');
    if (author) content += `**By:** ${author.textContent.trim()}\n\n`;

    // Article text
    const paragraphs = document.querySelectorAll('.article-body p');
    paragraphs.forEach(p => {
      content += p.textContent.trim() + '\n\n';
    });

    result.content = content;
    result.metadata = { type: 'news-article' };
    return result;
  }
},
```

### Product Page

```javascript
'store.example.com': {
  name: 'Example Store',
  extract: () => {
    const result = { title: '', content: '', metadata: {} };

    result.title = document.querySelector('.product-name').textContent.trim();

    let content = `# ${result.title}\n\n`;

    // Price
    const price = document.querySelector('.price');
    if (price) content += `**Price:** ${price.textContent}\n\n`;

    // Description
    const desc = document.querySelector('.description');
    if (desc) content += desc.textContent.trim() + '\n\n';

    // Image
    const img = document.querySelector('.product-image');
    if (img) content += `![Product](${img.src})\n\n`;

    result.content = content;
    result.metadata = { type: 'product' };
    return result;
  }
},
```

## Tips

### Handle Missing Elements

Always check if elements exist:
```javascript
const author = document.querySelector('.author');
if (author) {
  content += `**Author:** ${author.textContent.trim()}\n\n`;
}
```

### Multiple Selectors (Fallbacks)

```javascript
const title = document.querySelector('h1.new-class') ||
              document.querySelector('h1.old-class') ||
              document.querySelector('h1');
```

### Clean Text

Remove unwanted elements:
```javascript
const article = document.querySelector('article').cloneNode(true);
article.querySelectorAll('.ad, .share-buttons').forEach(el => el.remove());
const cleanText = article.textContent.trim();
```

### Limit Content

```javascript
// Get only first 10 paragraphs
const paragraphs = Array.from(document.querySelectorAll('p')).slice(0, 10);
```

### Async Extractors

If you need to click buttons or wait for content:

```javascript
extract: async () => {  // <-- Add 'async'
  const result = { title: '', content: '', metadata: {} };

  // Click "Show More"
  const btn = document.querySelector('.show-more');
  if (btn) {
    btn.click();
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
  }

  // Now extract
  result.title = document.querySelector('h1').textContent.trim();
  return result;
}
```

## Common Selectors

| Element | Selector Examples |
|---------|------------------|
| Title | `h1`, `h1.title`, `#page-title` |
| Article | `article`, `.post`, `.content` |
| Author | `.author`, `[data-author]`, `.byline` |
| Date | `time`, `.date`, `[datetime]` |
| Images | `img`, `.article-img`, `img[src*="cdn"]` |
| Paragraphs | `p`, `.content p`, `article p` |

## Debugging

If extraction isn't working:

1. **Check Console:** Look for errors in DevTools
2. **Test Selectors:** Use console to test: `document.querySelector('...')`
3. **Check Element:** Make sure it exists on the page
4. **Try Different Pages:** Test on multiple pages from the same site
5. **Add Logging:** Use `console.log()` to debug:

```javascript
extract: () => {
  const result = { title: '', content: '', metadata: {} };

  const titleEl = document.querySelector('h1');
  console.log('Title element:', titleEl);
  console.log('Title text:', titleEl?.textContent);

  // ... rest of code
}
```

## Current Extractors

The extension includes extractors for:
- ✅ Reddit
- ✅ YouTube
- ✅ Twitter/X
- ✅ Medium
- ✅ GitHub
- ✅ Stack Overflow
- ✅ Wikipedia
- ✅ Amazon
- ✅ IMDb

Check `content.js` to see how they work!

## Need Help?

1. Look at existing extractors in `content.js` for examples
2. Use Chrome DevTools to inspect the page structure
3. Test selectors in the console before adding them

Happy clipping! 🎉
