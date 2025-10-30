// Content script for Jotty Clipper - runs on all pages
// Extracts content based on site-specific logic

// Site-specific extractors
const extractors = {
  // Reddit extractor
  'reddit.com': {
    name: 'Reddit',
    extract: () => {
      const result = {
        title: '',
        content: '',
        metadata: {}
      };

      // Get post title - modern Reddit (shreddit) layout
      const titleEl = document.querySelector('shreddit-post h1, h1[slot="title"], h1');
      result.title = titleEl ? titleEl.textContent.trim() : document.title;

      // Get post content
      let content = '';

      // Modern Reddit (shreddit) - the post content is in different places depending on post type
      // Try text post content
      const textPost = document.querySelector('div[slot="text-body"], shreddit-post div[slot="text-body"]');
      if (textPost) {
        content += `## Post Content\n\n${extractTextWithWhitespace(textPost).trim()}\n\n`;
      }

      // Try to get post content from the main post container
      if (!content) {
        const postContent = document.querySelector('[data-test-id="post-content"] p, shreddit-post p');
        if (postContent) {
          // Get all paragraphs in the post
          const allParas = document.querySelectorAll('[data-test-id="post-content"] p, shreddit-post div[slot="text-body"] p');
          if (allParas.length > 0) {
            content += `## Post Content\n\n`;
            allParas.forEach(p => {
              const text = extractTextWithWhitespace(p).trim();
              if (text && text.length > 0) {
                content += `${text}\n\n`;
              }
            });
          } else {
            content += `## Post Content\n\n${extractTextWithWhitespace(postContent).trim()}\n\n`;
          }
        }
      }

      // Fallback: try old Reddit layout
      if (!content) {
        const oldRedditContent = document.querySelector('.usertext-body .md');
        if (oldRedditContent) {
          content += `## Post Content\n\n${convertToMarkdown(oldRedditContent).trim()}\n\n`;
        }
      }

      // Get images from the post
      const images = document.querySelectorAll('shreddit-post img[src*="redd.it"], shreddit-post img[src*="imgur"], img[src*="preview.redd.it"]');
      const seenImages = new Set();
      images.forEach((img) => {
        if (img.src && !img.src.includes('icon') && !img.src.includes('avatar') && !img.src.includes('emoji')) {
          // Avoid duplicates
          if (!seenImages.has(img.src)) {
            seenImages.add(img.src);
            content += `![Image](${img.src})\n\n`;
          }
        }
      });

      // Get video if present
      const video = document.querySelector('shreddit-player video source, video[src*="redd.it"]');
      if (video) {
        const videoSrc = video.src || video.getAttribute('src');
        if (videoSrc) {
          content += `**Video:** [Watch Video](${videoSrc})\n\n`;
        }
      }

      // Check for link posts
      const linkPost = document.querySelector('a[slot="full-post-link"], shreddit-post a[data-click-id="timestamp"]');
      if (linkPost && linkPost.href && !linkPost.href.includes('reddit.com')) {
        content += `**Link:** [${linkPost.href}](${linkPost.href})\n\n`;
      }

      // Get metadata
      const author = document.querySelector('shreddit-post [slot="authorName"] a, a[author]');
      const subreddit = document.querySelector('shreddit-post [slot="subreddit"] a, a[slot="subreddit-name"]');
      const timestamp = document.querySelector('shreddit-post time, time');

      result.metadata = {
        author: author ? author.textContent.trim().replace('u/', '') : null,
        subreddit: subreddit ? subreddit.textContent.trim().replace('r/', '') : null,
        timestamp: timestamp ? timestamp.getAttribute('datetime') : null,
        type: 'reddit-post'
      };

      result.content = content.trim() || 'Could not extract post content';
      return result;
    }
  },

  // YouTube extractor
  'youtube.com': {
    name: 'YouTube',
    extract: async () => {
      const result = {
        title: '',
        content: '',
        metadata: {}
      };

      // Get video title - modern YouTube layout
      const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1 yt-formatted-string.ytd-watch-metadata');
      result.title = titleEl ? titleEl.textContent.trim() : document.title.replace(' - YouTube', '');

      // Get channel info - modern layout
      const channelEl = document.querySelector('ytd-channel-name#channel-name a, #owner a');
      const channel = channelEl ? channelEl.textContent.trim() : '';

      // Get full description - CRITICAL PART
      let description = '';

      // Method 1: Try to get from YouTube's internal data (most reliable)
      try {
        // YouTube stores data in ytInitialData
        if (window.ytInitialData) {
          const contents = window.ytInitialData?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
          if (contents) {
            for (const content of contents) {
              if (content.videoSecondaryInfoRenderer) {
                const attrDesc = content.videoSecondaryInfoRenderer?.attributedDescription;
                if (attrDesc && attrDesc.content) {
                  description = attrDesc.content;
                  break;
                }
              }
            }
          }
        }
      } catch (e) {
        console.log('Could not get description from ytInitialData:', e);
      }

      // Method 2: Click expand button and scrape DOM (fallback)
      if (!description) {
        // Step 1: Click the "more" button if it exists to expand description
        const expandButton = document.querySelector('tp-yt-paper-button#expand, #expand');

        if (expandButton && expandButton.offsetParent !== null) {
          expandButton.click();
          // Wait for expansion animation
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Step 2: Get the expanded description text
        // Try modern layout first
        let descElement = document.querySelector('ytd-text-inline-expander#description-inline-expander yt-attributed-string span');

        if (descElement) {
          description = extractTextWithWhitespace(descElement).trim();
        } else {
          // Try alternative selector
          descElement = document.querySelector('#description-inline-expander yt-formatted-string, ytd-text-inline-expander #content');
          if (descElement) {
            // Get text preserving whitespace and clean it
            const allText = extractTextWithWhitespace(descElement);
            // Remove metadata lines that appear before the actual description
            description = allText
              .split('\n')
              .filter(line => {
                const trimmed = line.trim();
                // Filter out metadata lines
                return trimmed.length > 0 &&
                       !trimmed.match(/^[\d,]+ views/) &&
                       !trimmed.match(/^(Streamed|Premiered|Published)/) &&
                       !trimmed.match(/^#\d+ on Trending/) &&
                       !trimmed.match(/^\.\.\.more$/);
              })
              .join('\n')
              .trim();
          }
        }
      }

      // Method 3: Try LD+JSON structured data (last resort)
      if (!description || description.length < 20) {
        try {
          const ldJson = document.querySelector('script[type="application/ld+json"]');
          if (ldJson) {
            const data = JSON.parse(ldJson.textContent);
            if (data && data.description) {
              description = data.description;
            }
          }
        } catch (e) {
          console.log('Could not parse LD+JSON:', e);
        }
      }

      // Get video ID from URL
      const videoId = new URL(window.location.href).searchParams.get('v');

      // Build content
      result.content = `# ${result.title}\n\n`;
      result.content += `**Channel:** ${channel}\n`;
      result.content += `**Video URL:** [Watch on YouTube](${window.location.href})\n\n`;

      if (description && description.length > 0) {
        result.content += `## Description\n\n${description}\n`;
      } else {
        result.content += `## Description\n\n*No description available*\n`;
      }

      // Get thumbnail - use video ID to construct the correct thumbnail URL
      // YouTube thumbnail URL format is consistent and reliable
      if (videoId) {
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        result.content += `\n![Video Thumbnail](${thumbnailUrl})\n`;
      }

      result.metadata = {
        channel,
        videoId,
        type: 'youtube-video'
      };

      return result;
    }
  },

  // Twitter/X extractor
  'twitter.com': {
    name: 'Twitter',
    extract: () => extractTwitter()
  },
  'x.com': {
    name: 'X',
    extract: () => extractTwitter()
  },

  // Medium extractor
  'medium.com': {
    name: 'Medium',
    extract: () => {
      const result = {
        title: '',
        content: '',
        metadata: {}
      };

      // Get article title
      const titleEl = document.querySelector('h1');
      result.title = titleEl ? titleEl.textContent.trim() : document.title;

      // Get article content
      const article = document.querySelector('article');
      if (article) {
        // Convert to markdown-like format
        result.content = convertToMarkdown(article);
      }

      // Get metadata
      const author = document.querySelector('a[rel="author"]');
      const date = document.querySelector('time');

      result.metadata = {
        author: author ? author.textContent.trim() : null,
        publishDate: date ? date.getAttribute('datetime') : null,
        type: 'medium-article'
      };

      return result;
    }
  },

  // GitHub extractor
  'github.com': {
    name: 'GitHub',
    extract: () => {
      const result = {
        title: '',
        content: '',
        metadata: {}
      };

      const path = window.location.pathname;

      // Repository README
      if (path.split('/').length <= 3 || path.includes('/blob/')) {
        const repoName = document.querySelector('h1 strong a, h1 a strong');
        result.title = repoName ? repoName.textContent.trim() : document.title;

        const readme = document.querySelector('#readme article, .markdown-body');
        if (readme) {
          result.content = convertToMarkdown(readme);
        }

        const description = document.querySelector('[data-pjax="#repo-content-pjax-container"] p');
        result.metadata = {
          repository: result.title,
          description: description ? description.textContent.trim() : null,
          type: 'github-repo'
        };
      }
      // Issue or PR
      else if (path.includes('/issues/') || path.includes('/pull/')) {
        const titleEl = document.querySelector('.js-issue-title');
        result.title = titleEl ? titleEl.textContent.trim() : document.title;

        const body = document.querySelector('.comment-body');
        if (body) {
          result.content = convertToMarkdown(body);
        }

        result.metadata = {
          type: path.includes('/issues/') ? 'github-issue' : 'github-pr'
        };
      }

      return result;
    }
  },

  // Stack Overflow extractor
  'stackoverflow.com': {
    name: 'Stack Overflow',
    extract: () => {
      const result = {
        title: '',
        content: '',
        metadata: {}
      };

      // Get question title
      const titleEl = document.querySelector('#question-header h1');
      result.title = titleEl ? titleEl.textContent.trim() : document.title;

      let content = `# ${result.title}\n\n`;

      // Get question body
      const questionBody = document.querySelector('.question .js-post-body');
      if (questionBody) {
        content += `## Question\n\n${convertToMarkdown(questionBody)}\n\n`;
      }

      // Get accepted answer
      const acceptedAnswer = document.querySelector('.answer.accepted-answer .js-post-body');
      if (acceptedAnswer) {
        content += `## Accepted Answer\n\n${convertToMarkdown(acceptedAnswer)}\n\n`;
      }

      // Get tags
      const tags = Array.from(document.querySelectorAll('.post-tag')).map(tag => tag.textContent);

      result.content = content;
      result.metadata = {
        tags,
        type: 'stackoverflow-question'
      };

      return result;
    }
  },

  // Wikipedia extractor
  'wikipedia.org': {
    name: 'Wikipedia',
    extract: () => {
      const result = {
        title: '',
        content: '',
        metadata: {}
      };

      // Get article title
      const titleEl = document.querySelector('#firstHeading, h1');
      result.title = titleEl ? titleEl.textContent.trim() : document.title.replace(' - Wikipedia', '');

      // Get the main article content
      const articleContent = document.querySelector('#mw-content-text .mw-parser-output');

      if (articleContent) {
        let content = `# ${result.title}\n\n`;

        // Get the intro/summary (paragraphs before the first heading)
        const introParagraphs = [];
        let node = articleContent.firstElementChild;

        while (node) {
          if (node.tagName === 'P' && node.textContent.trim().length > 0) {
            // Skip reference notes
            const textWithoutRefs = node.cloneNode(true);
            textWithoutRefs.querySelectorAll('.reference, sup').forEach(el => el.remove());
            const text = textWithoutRefs.textContent.trim();
            if (text.length > 0) {
              introParagraphs.push(text);
            }
          } else if (['H1', 'H2', 'H3'].includes(node.tagName)) {
            break; // Stop at first heading
          }
          node = node.nextElementSibling;
        }

        if (introParagraphs.length > 0) {
          content += `## Summary\n\n${introParagraphs.join('\n\n')}\n\n`;
        }

        // Get main sections (skip TOC, infobox, etc.)
        const sections = articleContent.querySelectorAll('h2, h3');
        sections.forEach(heading => {
          const headingText = heading.querySelector('.mw-headline');
          if (headingText) {
            const sectionTitle = headingText.textContent.trim();

            // Skip certain sections
            if (['Contents', 'References', 'External links', 'See also', 'Notes'].includes(sectionTitle)) {
              return;
            }

            const level = heading.tagName === 'H2' ? '##' : '###';
            content += `${level} ${sectionTitle}\n\n`;

            // Get paragraphs following this heading
            let nextNode = heading.nextElementSibling;
            const sectionParas = [];

            while (nextNode && !['H2', 'H3'].includes(nextNode.tagName)) {
              if (nextNode.tagName === 'P') {
                const textNode = nextNode.cloneNode(true);
                textNode.querySelectorAll('.reference, sup').forEach(el => el.remove());
                const text = textNode.textContent.trim();
                if (text.length > 0) {
                  sectionParas.push(text);
                }
              }
              nextNode = nextNode.nextElementSibling;

              // Limit paragraphs per section
              if (sectionParas.length >= 3) break;
            }

            if (sectionParas.length > 0) {
              content += sectionParas.join('\n\n') + '\n\n';
            }
          }
        });

        result.content = content;
      }

      // Get infobox data if available
      const infobox = document.querySelector('.infobox');
      let infoboxData = null;
      if (infobox) {
        const rows = infobox.querySelectorAll('tr');
        const data = {};
        rows.forEach(row => {
          const header = row.querySelector('th');
          const value = row.querySelector('td');
          if (header && value) {
            data[header.textContent.trim()] = value.textContent.trim();
          }
        });
        infoboxData = data;
      }

      result.metadata = {
        url: window.location.href,
        infobox: infoboxData,
        type: 'wikipedia-article'
      };

      return result;
    }
  },

  // Amazon extractor
  'amazon.com': {
    name: 'Amazon',
    extract: () => {
      const result = {
        title: '',
        content: '',
        metadata: {}
      };

      // Get product title
      const titleEl = document.querySelector('#productTitle, h1.product-title');
      result.title = titleEl ? titleEl.textContent.trim() : document.title;

      let content = `# ${result.title}\n\n`;

      // Get price
      const priceWhole = document.querySelector('.a-price-whole');
      const priceFraction = document.querySelector('.a-price-fraction');
      let price = '';
      if (priceWhole) {
        price = priceWhole.textContent.trim();
        if (priceFraction) {
          price += priceFraction.textContent.trim();
        }
        content += `**Price:** $${price}\n\n`;
      }

      // Get rating
      const rating = document.querySelector('[data-hook="rating-out-of-text"], .a-icon-alt');
      if (rating) {
        content += `**Rating:** ${rating.textContent.trim()}\n\n`;
      }

      // Get product image
      const mainImage = document.querySelector('#landingImage, #imgBlkFront');
      if (mainImage && mainImage.src) {
        content += `![Product Image](${mainImage.src})\n\n`;
      }

      // Get product features
      const features = document.querySelector('#feature-bullets ul, #feature-bullets-btf ul');
      if (features) {
        content += `## Key Features\n\n`;
        const featureItems = features.querySelectorAll('li span.a-list-item');
        featureItems.forEach(item => {
          const text = item.textContent.trim();
          if (text && text.length > 0) {
            content += `- ${text}\n`;
          }
        });
        content += '\n';
      }

      // Get product description - try multiple selectors
      let description = '';

      // Method 1: Product description section
      const descSection = document.querySelector('#productDescription');
      if (descSection) {
        const descParagraphs = descSection.querySelectorAll('p');
        if (descParagraphs.length > 0) {
          description = Array.from(descParagraphs)
            .map(p => extractTextWithWhitespace(p).trim())
            .filter(text => text.length > 0)
            .join('\n\n');
        } else {
          // Fallback: get all text from the section preserving whitespace
          description = extractTextWithWhitespace(descSection).trim();
        }
      }

      // Method 2: Book description
      if (!description) {
        const bookDesc = document.querySelector('#bookDescription_feature_div noscript, #bookDescription_feature_div');
        if (bookDesc) {
          description = extractTextWithWhitespace(bookDesc).trim();
        }
      }

      // Method 3: A+ content
      if (!description) {
        const aplus = document.querySelector('#aplus, #aplus_feature_div');
        if (aplus) {
          const aplusParagraphs = aplus.querySelectorAll('p, .aplus-p1, .aplus-p2, .aplus-p3');
          if (aplusParagraphs.length > 0) {
            description = Array.from(aplusParagraphs)
              .map(p => extractTextWithWhitespace(p).trim())
              .filter(text => text.length > 20) // Filter out short/empty content
              .slice(0, 5) // Limit to first 5 paragraphs
              .join('\n\n');
          }
        }
      }

      // Method 4: Feature div
      if (!description) {
        const featureDiv = document.querySelector('#feature-bullets-btf');
        if (featureDiv) {
          const paras = featureDiv.querySelectorAll('p');
          if (paras.length > 0) {
            description = Array.from(paras)
              .map(p => extractTextWithWhitespace(p).trim())
              .filter(text => text.length > 0)
              .join('\n\n');
          }
        }
      }

      if (description && description.length > 0) {
        content += `## Description\n\n${description}\n\n`;
      }

      // Get ASIN and other details
      let details = {};

      // First, try to extract actual tables
      const productTables = document.querySelectorAll('#productDetails_detailBullets_sections table, #productDetails table, .technical-details table');
      if (productTables.length > 0) {
        let tableContent = '\n## Product Details\n\n';
        productTables.forEach((table, index) => {
          tableContent += convertTableToMarkdown(table);
          if (index < productTables.length - 1) {
            tableContent += '\n';
          }
        });
        content += tableContent;
      }

      // Fallback: extract from bullet/detail sections
      const detailsTable = document.querySelector('#detailBullets_feature_div, #prodDetails');
      if (detailsTable) {
        const rows = detailsTable.querySelectorAll('li, tr');
        rows.forEach(row => {
          const label = row.querySelector('.a-text-bold, th');
          const value = row.querySelector('span:not(.a-text-bold), td');
          if (label && value) {
            details[label.textContent.trim().replace(':', '')] = value.textContent.trim();
          }
        });
      }

      result.content = content;
      result.metadata = {
        price,
        asin: details['ASIN'] || null,
        details,
        type: 'amazon-product'
      };

      return result;
    }
  },

  // IMDb extractor
  'imdb.com': {
    name: 'IMDb',
    extract: () => {
      const result = {
        title: '',
        content: '',
        metadata: {}
      };

      // Get title
      const titleEl = document.querySelector('[data-testid="hero__primary-text"], h1');
      result.title = titleEl ? titleEl.textContent.trim() : document.title.replace(' - IMDb', '');

      let content = `# ${result.title}\n\n`;

      // Get year and type
      const subtitleList = document.querySelector('[data-testid="hero__subtitle-list"]');
      if (subtitleList) {
        const items = subtitleList.querySelectorAll('li');
        const info = Array.from(items).map(item => item.textContent.trim()).join(' • ');
        content += `**Info:** ${info}\n\n`;
      }

      // Get rating
      const rating = document.querySelector('[data-testid="hero-rating-bar__aggregate-rating__score"] span');
      if (rating) {
        content += `**Rating:** ${rating.textContent.trim()}/10\n\n`;
      }

      // Get poster image
      const poster = document.querySelector('[data-testid="hero-media__poster"] img, .ipc-image');
      if (poster && poster.src) {
        content += `![Poster](${poster.src})\n\n`;
      }

      // Get plot/storyline
      const plot = document.querySelector('[data-testid="plot"] span, [data-testid="storyline-plot-summary"]');
      if (plot) {
        content += `## Plot\n\n${plot.textContent.trim()}\n\n`;
      }

      // Get directors
      const directors = document.querySelectorAll('[data-testid="title-pc-principal-credit"]:first-child a');
      if (directors.length > 0) {
        const directorNames = Array.from(directors).map(d => d.textContent.trim()).join(', ');
        content += `**Director(s):** ${directorNames}\n\n`;
      }

      // Get cast
      const cast = document.querySelectorAll('[data-testid="title-cast-item__actor"]');
      if (cast.length > 0) {
        content += `## Cast\n\n`;
        const topCast = Array.from(cast).slice(0, 10).map(actor => `- ${actor.textContent.trim()}`);
        content += topCast.join('\n') + '\n\n';
      }

      // Get genres
      const genres = document.querySelectorAll('[data-testid="genres"] a, .ipc-chip__text');
      if (genres.length > 0) {
        const genreList = Array.from(genres).map(g => g.textContent.trim()).join(', ');
        content += `**Genres:** ${genreList}\n\n`;
      }

      result.content = content;
      result.metadata = {
        imdbUrl: window.location.href,
        type: 'imdb-title'
      };

      return result;
    }
  }
};

// Helper function for Twitter/X
function extractTwitter() {
  const result = {
    title: '',
    content: '',
    metadata: {}
  };

  // Get tweet text
  const tweetText = document.querySelector('[data-testid="tweetText"]');
  if (tweetText) {
    result.content = tweetText.innerText;
    result.title = result.content.substring(0, 100) + (result.content.length > 100 ? '...' : '');
  }

  // Get author
  const author = document.querySelector('[data-testid="User-Name"] span');

  // Get images
  const images = document.querySelectorAll('[data-testid="tweetPhoto"] img');
  images.forEach((img, idx) => {
    result.content += `\n\n![Image ${idx + 1}](${img.src})`;
  });

  result.metadata = {
    author: author ? author.textContent.trim() : null,
    type: 'tweet'
  };

  return result;
}

// Helper function to preserve whitespace when extracting text
function extractTextWithWhitespace(element) {
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let text = '';
  let currentNode;

  while (currentNode = walker.nextNode()) {
    const parent = currentNode.parentElement;
    const parentTag = parent ? parent.tagName.toLowerCase() : '';

    // Preserve line breaks for block elements
    if (['p', 'div', 'section', 'article', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br'].includes(parentTag)) {
      text += currentNode.textContent + '\n';
    } else if (parentTag === 'br') {
      text += '\n';
    } else {
      text += currentNode.textContent;
    }
  }

  return text;
}

// Convert HTML table to Markdown table format
function convertTableToMarkdown(table) {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  let markdown = '\n';
  let hasHeaders = false;
  let headerAdded = false;

  // Check if table has headers and process each row
  rows.forEach((row, rowIndex) => {
    const cells = Array.from(row.querySelectorAll('th, td'));
    const cellTexts = cells.map(cell => {
      // Clean and escape pipe characters in cell content
      let text = cell.textContent.trim();
      // Escape pipe characters that would break markdown table format
      text = text.replace(/\|/g, '\\|');
      // Handle multi-line content by replacing with spaces
      text = text.replace(/\s+/g, ' ');
      return text;
    });

    // Check if this row contains headers
    if (row.querySelector('th')) {
      hasHeaders = true;
    }

    // Create the markdown row
    markdown += '| ' + cellTexts.join(' | ') + ' |\n';

    // Add separator row after first row if it has headers, or after first row if no headers found
    if (!headerAdded && (rowIndex === 0 && hasHeaders || (rowIndex === 0 && !hasHeaders))) {
      // Create separator row with minimum 3 dashes for markdown compatibility
      const separators = cellTexts.map(text => '-'.repeat(Math.max(text.length, 3)));
      markdown += '| ' + separators.join(' | ') + ' |\n';
      headerAdded = true;
    } else if (!headerAdded && rowIndex === 1 && hasHeaders) {
      // Add separator after header row if headers weren't in first row
      const separators = cellTexts.map(text => '-'.repeat(Math.max(text.length, 3)));
      markdown += '| ' + separators.join(' | ') + ' |\n';
      headerAdded = true;
    }
  });

  // Add some spacing around the table
  return markdown + '\n';
}

// Convert HTML to Markdown-like format with better whitespace preservation
function convertToMarkdown(element) {
  let markdown = '';
  const clone = element.cloneNode(true);

  // Process tables first - before other processing
  clone.querySelectorAll('table').forEach(table => {
    const tableMarkdown = convertTableToMarkdown(table);
    table.outerHTML = tableMarkdown;
  });

  // Process headings
  clone.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
    const level = parseInt(heading.tagName[1]);
    const prefix = '#'.repeat(level);
    heading.innerHTML = `\n${prefix} ${heading.textContent.trim()}\n\n`;
  });

  // Process paragraphs - add line breaks after each
  clone.querySelectorAll('p').forEach(p => {
    p.innerHTML = `${p.innerHTML.trim()}\n\n`;
  });

  // Process line breaks explicitly
  clone.querySelectorAll('br').forEach(br => {
    br.outerHTML = '\n';
  });

  // Process code blocks with proper whitespace
  clone.querySelectorAll('pre').forEach(pre => {
    const code = pre.querySelector('code');
    if (code) {
      pre.textContent = `\n\`\`\`\n${code.textContent}\n\`\`\`\n\n`;
    }
  });

  // Process inline code
  clone.querySelectorAll('code:not(pre code)').forEach(code => {
    code.textContent = `\`${code.textContent}\``;
  });

  // Process links
  clone.querySelectorAll('a').forEach(a => {
    a.textContent = `[${a.textContent}](${a.href})`;
  });

  // Process images
  clone.querySelectorAll('img').forEach(img => {
    img.outerHTML = `![${img.alt || 'Image'}](${img.src})`;
  });

  // Process bold
  clone.querySelectorAll('strong, b').forEach(el => {
    el.textContent = `**${el.textContent}**`;
  });

  // Process italic
  clone.querySelectorAll('em, i').forEach(el => {
    el.textContent = `*${el.textContent}*`;
  });

  // Process lists with proper formatting
  clone.querySelectorAll('ul, ol').forEach(list => {
    const items = list.querySelectorAll('li');
    const isOrdered = list.tagName === 'OL';
    let listContent = '\n';

    items.forEach((item, idx) => {
      const prefix = isOrdered ? `${idx + 1}. ` : '- ';
      // Get the content of the li element, preserving internal structure
      const itemClone = item.cloneNode(true);
      // Remove the original li content and replace with formatted version
      itemClone.querySelectorAll('ul, ol').forEach(nestedList => {
        nestedList.remove(); // Handle nested lists separately
      });
      const itemText = itemClone.textContent.trim();
      listContent += `${prefix}${itemText}\n`;
    });

    list.outerHTML = listContent + '\n';
  });

  // Extract text preserving whitespace structure
  markdown = extractTextWithWhitespace(clone);

  // Clean up excessive whitespace while preserving meaningful structure
  markdown = markdown
    .replace(/\n{3,}/g, '\n\n') // Reduce multiple consecutive newlines to max 2
    .replace(/[ \t]+/g, ' ') // Collapse multiple spaces/tabs to single space
    .replace(/^\n+|\n+$/g, '') // Trim leading/trailing newlines
    + '\n'; // Ensure trailing newline

  return markdown;
}

// Generic extractor for sites without specific logic
function genericExtract(clipType) {
  const result = {
    title: document.title,
    content: '',
    metadata: {
      type: 'generic'
    }
  };

  if (clipType === 'selection') {
    const selection = window.getSelection();
    let selectedText = '';

    // Preserve whitespace in selections
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = document.createElement('div');
      container.appendChild(range.cloneContents());
      selectedText = extractTextWithWhitespace(container).trim();
    } else {
      selectedText = selection.toString();
    }

    result.content = selectedText || 'No text selected';
    result.title = selectedText.substring(0, 100) + (selectedText.length > 100 ? '...' : '');
  } else if (clipType === 'full') {
    // Get main content
    const article = document.querySelector('article, main, [role="main"], .post, .content');
    if (article) {
      result.content = convertToMarkdown(article);
    } else {
      result.content = convertToMarkdown(document.body);
    }
  } else {
    // Auto mode - try to detect main content
    const article = document.querySelector('article, main, [role="main"]');
    if (article) {
      result.content = convertToMarkdown(article);
    } else {
      // Fall back to readable content with better whitespace preservation
      const paragraphs = Array.from(document.querySelectorAll('p'))
        .filter(p => p.textContent.trim().length > 50)
        .slice(0, 20);

      result.content = paragraphs
        .map(p => extractTextWithWhitespace(p).trim())
        .join('\n\n');
    }
  }

  return result;
}

// Listen for messages from popup
browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ status: 'ready' });
    return true;
  }

  if (request.action === 'getPageInfo') {
    const hostname = new URL(window.location.href).hostname;
    const extractor = findExtractor(hostname);

    // Handle async extractors
    (async () => {
      try {
        if (extractor) {
          const info = await extractor.extract();
          sendResponse({ title: info.title });
        } else {
          sendResponse({ title: document.title });
        }
      } catch (error) {
        console.error('Error getting page info:', error);
        sendResponse({ title: document.title });
      }
    })();
    return true; // Will respond asynchronously
  }

  if (request.action === 'extractContent') {
    const hostname = new URL(window.location.href).hostname;
    const extractor = findExtractor(hostname);

    // Handle async extractors
    (async () => {
      try {
        let result;
        if (extractor && request.clipType === 'auto') {
          result = await extractor.extract();
        } else {
          result = genericExtract(request.clipType);
        }

        sendResponse({
          success: true,
          content: result.content,
          metadata: result.metadata
        });
      } catch (error) {
        console.error('Error extracting content:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();
    return true; // Will respond asynchronously
  }
});

// Find extractor for current site
function findExtractor(hostname) {
  for (const domain in extractors) {
    if (hostname.includes(domain)) {
      return extractors[domain];
    }
  }
  return null;
}
