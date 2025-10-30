// Content script for Jotty Clipper - runs on all pages
// Uses Mozilla Readability.js for clean content extraction with fallbacks for specific sites

// Helper function to determine platform from URL
const getPlatformFromUrl = (url) => {
  const urlLower = url.toLowerCase();
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'YouTube';
  if (urlLower.includes('twitch.tv')) return 'Twitch';
  if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) return 'X/Twitter';
  if (urlLower.includes('instagram.com')) return 'Instagram';
  if (urlLower.includes('tiktok.com')) return 'TikTok';
  if (urlLower.includes('github.com')) return 'GitHub';
  if (urlLower.includes('stackoverflow.com')) return 'Stack Overflow';
  if (urlLower.includes('medium.com')) return 'Medium';
  if (urlLower.includes('wikipedia.org')) return 'Wikipedia';
  try {
    return new URL(url).hostname;
  } catch (e) {
    return 'External Website';
  }
};

// Site-specific extractors - only for sites that need special handling
const extractors = {
  // YouTube extractor - keep this as Readability doesn't handle video metadata well
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
          description = descElement.textContent.trim();
        } else {
          // Try alternative selector
          descElement = document.querySelector('#description-inline-expander yt-formatted-string, ytd-text-inline-expander #content');
          if (descElement) {
            // Get text preserving whitespace and clean it
            const allText = descElement.innerText || descElement.textContent;
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

      // Get video thumbnail and links (GFM-compatible)
      if (videoId) {
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const embedUrl = `https://www.youtube.com/embed/${videoId}`;
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        const thumbnailHtmlUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

        result.content += `\n## Video\n\n`;

        // Add thumbnail with link to video (GFM-compatible)
        result.content += `[![Video Thumbnail - Click to Watch](${thumbnailHtmlUrl})](${videoUrl})\n\n`;

        // Add direct links for different ways to watch
        result.content += `**🔗 Links:**\n`;
        result.content += `- [▶️ Watch on YouTube](${videoUrl})\n`;
        result.content += `- [📺 Direct Embed](${embedUrl})\n`;
        result.content += `- [🖼️ High Quality Thumbnail](${thumbnailUrl})\n\n`;
      }

      result.metadata = {
        channel,
        videoId,
        type: 'youtube-video'
      };

      return result;
    }
  },

  // Amazon extractor - Amazon has specific product data structure that needs special handling
  'amazon.com': {
    name: 'Amazon',
    extract: () => {
      const result = {
        title: '',
        content: '',
        metadata: {}
      };

      // Helper function to clean text content
      const cleanText = (text) => {
        return text
          .replace(/var\s+\w+[\s\S]*?}/g, '') // Remove JavaScript variables
          .replace(/P\.when[\s\S]*?\)/g, '') // Remove Amazon P.when calls
          .replace(/A\.declarative[\s\S]*?\)/g, '') // Remove Amazon declarative calls
          .replace(/\s+/g, ' ') // Collapse multiple whitespace
          .trim();
      };

      // Get product title
      const titleEl = document.querySelector('#productTitle, h1.product-title');
      result.title = titleEl ? cleanText(titleEl.textContent) : document.title;

      let content = `# ${result.title}\n\n`;

      // Get price - be more specific to avoid picking up JavaScript
      const priceContainer = document.querySelector('.a-price.a-text-center.aok-align-center, .a-price.aok-align-center');
      if (priceContainer) {
        const priceWhole = priceContainer.querySelector('.a-price-whole');
        const priceFraction = priceContainer.querySelector('.a-price-fraction');
        let price = '';
        if (priceWhole && priceFraction) {
          price = cleanText(priceWhole.textContent) + cleanText(priceFraction.textContent);
          content += `**Price:** $${price}\n\n`;
        }
      }

      // Get rating - be more specific to avoid JavaScript
      const ratingContainer = document.querySelector('#acrPopover, [data-hook="average-star-rating"]');
      if (ratingContainer) {
        const ratingText = ratingContainer.querySelector('.a-color-base, [data-hook="rating-out-of-text"]');
        if (ratingText) {
          const rating = cleanText(ratingText.textContent);
          if (rating && !rating.includes('var') && !rating.includes('P.when')) {
            content += `**Rating:** ${rating}\n\n`;
          }
        }
      }

      // Get product image
      const mainImage = document.querySelector('#landingImage, #imgBlkFront');
      if (mainImage && mainImage.src && !mainImage.src.includes('javascript:')) {
        content += `![Product Image](${mainImage.src})\n\n`;
      }

      // Get product features - be more selective
      const featuresContainer = document.querySelector('#feature-bullets, #feature-bullets-btf');
      if (featuresContainer) {
        const featureItems = featuresContainer.querySelectorAll('li[data-a-expander-name], li span.a-list-item');
        if (featureItems.length > 0) {
          content += `## Key Features\n\n`;
          featureItems.forEach(item => {
            const text = cleanText(item.textContent);
            if (text && text.length > 10 && !text.includes('var') && !text.includes('P.when')) {
              content += `- ${text}\n`;
            }
          });
          content += '\n';
        }
      }

      // Get product description - try multiple clean selectors
      let description = '';

      // Method 1: Product description section - avoid script tags
      const descSection = document.querySelector('#productDescription');
      if (descSection) {
        const descParagraphs = descSection.querySelectorAll('p');
        if (descParagraphs.length > 0) {
          description = Array.from(descParagraphs)
            .map(p => {
              const text = cleanText(p.textContent);
              return text && text.length > 20 && !text.includes('var') ? text : '';
            })
            .filter(text => text.length > 0)
            .join('\n\n');
        }
      }

      // Method 2: Book description - clean
      if (!description) {
        const bookDesc = document.querySelector('#bookDescription_feature_div');
        if (bookDesc) {
          const paragraphs = bookDesc.querySelectorAll('p');
          if (paragraphs.length > 0) {
            description = Array.from(paragraphs)
              .map(p => {
                const text = cleanText(p.textContent);
                return text && text.length > 20 && !text.includes('var') ? text : '';
              })
              .filter(text => text.length > 0)
              .join('\n\n');
          }
        }
      }

      // Method 3: A+ content - clean
      if (!description) {
        const aplus = document.querySelector('#aplus, #aplus_feature_div');
        if (aplus) {
          const aplusParagraphs = aplus.querySelectorAll('p, .aplus-p1, .aplus-p2, .aplus-p3');
          if (aplusParagraphs.length > 0) {
            description = Array.from(aplusParagraphs)
              .map(p => {
                const text = cleanText(p.textContent);
                return text && text.length > 30 && !text.includes('var') ? text : '';
              })
              .filter(text => text.length > 0)
              .slice(0, 5)
              .join('\n\n');
          }
        }
      }

      if (description && description.length > 0) {
        content += `## Description\n\n${description}\n\n`;
      }

      // Extract product detail tables - clean
      const productTables = document.querySelectorAll('#productDetails_detailBullets_sections table, #productDetails table, .technical-details table');
      if (productTables.length > 0) {
        content += '\n## Product Details\n\n';
        productTables.forEach((table, index) => {
          content += convertTableToMarkdown(table);
          if (index < productTables.length - 1) {
            content += '\n';
          }
        });
      }

      // Fallback: extract from bullet/detail sections - clean
      const detailsTable = document.querySelector('#detailBullets_feature_div, #prodDetails');
      if (detailsTable) {
        const details = {};
        const rows = detailsTable.querySelectorAll('li, tr');
        rows.forEach(row => {
          const label = row.querySelector('.a-text-bold, th');
          const value = row.querySelector('span:not(.a-text-bold), td');
          if (label && value) {
            const labelText = cleanText(label.textContent);
            const valueText = cleanText(value.textContent);
            if (labelText && valueText && !labelText.includes('var') && !valueText.includes('var')) {
              details[labelText.replace(':', '')] = valueText;
            }
          }
        });

        if (Object.keys(details).length > 0) {
          content += '\n## Product Details\n\n';
          for (const [key, value] of Object.entries(details)) {
            content += `**${key}:** ${value}\n`;
          }
        }
      }

      // Get ASIN
      const asinElement = document.querySelector('[data-asin]');
      const asin = asinElement ? asinElement.getAttribute('data-asin') : null;

      result.content = content;
      result.metadata = {
        price: result.content.includes('**Price:**') ? result.content.match(/\*\*Price:\*\s*\$(.*?)\n/)?.[1] : null,
        asin,
        type: 'amazon-product'
      };

      return result;
    }
  },

  // Amazon international sites
  'amazon.co.uk': {
    name: 'Amazon UK',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.ca': {
    name: 'Amazon Canada',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.de': {
    name: 'Amazon Germany',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.fr': {
    name: 'Amazon France',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.es': {
    name: 'Amazon Spain',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.it': {
    name: 'Amazon Italy',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.co.jp': {
    name: 'Amazon Japan',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.cn': {
    name: 'Amazon China',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.in': {
    name: 'Amazon India',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.com.mx': {
    name: 'Amazon Mexico',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.com.br': {
    name: 'Amazon Brazil',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.com.au': {
    name: 'Amazon Australia',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.nl': {
    name: 'Amazon Netherlands',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.se': {
    name: 'Amazon Sweden',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.pl': {
    name: 'Amazon Poland',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.tr': {
    name: 'Amazon Turkey',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.ae': {
    name: 'Amazon UAE',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.sa': {
    name: 'Amazon Saudi Arabia',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.eg': {
    name: 'Amazon Egypt',
    extract: () => extractors['amazon.com'].extract()
  },
  'amazon.sg': {
    name: 'Amazon Singapore',
    extract: () => extractors['amazon.com'].extract()
  },

  // Reddit extractor - Reddit has specific post structure that needs special handling
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

      // Helper function to convert Reddit HTML to Markdown
      const convertRedditContent = (element) => {
        if (!element) return '';

        const clone = element.cloneNode(true);

        // Convert Reddit-specific formatting to Markdown
        clone.querySelectorAll('strong, b').forEach(el => {
          el.innerHTML = `**${el.textContent}**`;
        });

        clone.querySelectorAll('em, i').forEach(el => {
          el.innerHTML = `*${el.textContent}*`;
        });

        clone.querySelectorAll('a').forEach(el => {
          const href = el.href;
          const text = el.textContent;
          if (href && text && !href.includes('javascript:') && !href.includes('#')) {
            el.innerHTML = `[${text}](${href})`;
          }
        });

        clone.querySelectorAll('code').forEach(el => {
          el.innerHTML = `\`${el.textContent}\``;
        });

        clone.querySelectorAll('pre code').forEach(el => {
          el.parentElement.innerHTML = `\`\`\`\n${el.textContent}\n\`\`\``;
        });

        // Convert blockquotes
        clone.querySelectorAll('blockquote').forEach(el => {
          el.innerHTML = `> ${el.textContent.trim()}`;
        });

        // Convert line breaks
        clone.querySelectorAll('br').forEach(el => {
          el.outerHTML = '\n';
        });

        // Process paragraphs
        clone.querySelectorAll('p').forEach(el => {
          el.innerHTML = `${el.innerHTML}\n\n`;
        });

        // Process lists
        clone.querySelectorAll('ul, ol').forEach(list => {
          const items = list.querySelectorAll('li');
          const isOrdered = list.tagName === 'OL';
          let listContent = '\n';
          items.forEach((item, idx) => {
            const prefix = isOrdered ? `${idx + 1}. ` : '- ';
            listContent += `${prefix}${item.textContent.trim()}\n`;
          });
          list.outerHTML = listContent + '\n';
        });

        // Get the text content and clean it up
        let markdown = clone.textContent || clone.innerText || '';

        // Clean up excessive whitespace while preserving structure
        markdown = markdown
          .replace(/\n{3,}/g, '\n\n') // Reduce multiple consecutive newlines to max 2
          .replace(/[ \t]+/g, ' ') // Collapse multiple spaces/tabs to single space
          .replace(/^\n+|\n+$/g, '') // Trim leading/trailing newlines
          .trim();

        return markdown;
      };

      // Modern Reddit (shreddit) - the post content is in different places depending on post type
      // Try text post content
      const textPost = document.querySelector('div[slot="text-body"], shreddit-post div[slot="text-body"]');
      if (textPost) {
        const formattedContent = convertRedditContent(textPost).trim();
        if (formattedContent) {
          content += `## Post Content\n\n${formattedContent}\n\n`;
        }
      }

      // Try to get post content from the main post container
      const postContent = document.querySelector('[data-test-id="post-content"], shreddit-post [data-test-id="post-content"]');
      if (postContent) {
        const formattedContent = convertRedditContent(postContent).trim();
        if (formattedContent) {
          content += `## Post Content\n\n${formattedContent}\n\n`;
        }
      }

      // Fallback: try old Reddit layout
      const oldRedditContent = document.querySelector('.usertext-body .md');
      if (oldRedditContent && !content.includes('## Post Content')) {
        const formattedContent = convertRedditContent(oldRedditContent).trim();
        if (formattedContent) {
          content += `## Post Content\n\n${formattedContent}\n\n`;
        }
      }

      // Get images from the post - be very selective to avoid sidebar/recommended content
      const postContainer = document.querySelector('shreddit-post, .thing, div[data-testid="post-container"]');
      if (postContainer) {
        const images = postContainer.querySelectorAll('img[src*="redd.it"], img[src*="imgur"], img[src*="preview.redd.it"], img[src*="i.redd.it"]');
        const seenImages = new Set();
        images.forEach((img) => {
          if (img.src &&
              !img.src.includes('icon') &&
              !img.src.includes('avatar') &&
              !img.src.includes('emoji') &&
              !img.src.includes('thumbnail') &&
              !img.closest('.thumbnail') &&
              !img.closest('.side') &&
              !img.closest('[data-testid="sidebar"]') &&
              !img.closest('.recommendation') &&
              !img.closest('.expando') ||
              img.closest('[slot="text-body"], .usertext-body, [data-test-id="post-content"]')) {
            // Only include images that are actually part of the post content
            if (!seenImages.has(img.src)) {
              seenImages.add(img.src);
              content += `![Image](${img.src})\n\n`;
            }
          }
        });
      }

      // Get video if present - be selective to avoid sidebar content
      const postContainerForVideo = document.querySelector('shreddit-post, .thing, div[data-testid="post-container"]');
      if (postContainerForVideo) {
        const videoElement = postContainerForVideo.querySelector('shreddit-player video source, video[src*="redd.it"]');
        if (videoElement) {
          const videoSrc = videoElement.src || videoElement.getAttribute('src');
          if (videoSrc) {
            content += `\n## Reddit Video\n\n`;

            // Add a video placeholder with link (GFM-compatible)
            content += `🎥 **[Reddit Video - Click to Watch](${videoSrc})**\n\n`;

            // Add direct download/watch links
            content += `**🔗 Links:**\n`;
            content += `- [▶️ Play Video](${videoSrc})\n`;

            // Try to get audio-only version if available
            const audioSrc = videoSrc.replace(/\.mp4/, '_audio.mp4');
            content += `- [🎵 Audio Only](${audioSrc})\n`;

            content += `- [⬇️ Download Video](${videoSrc}?source=fallback)\n\n`;
          }
        }
      }

      // Check for link posts and external links
      let externalLink = null;
      const linkSelectors = [
        'a[slot="full-post-link"]',
        'shreddit-post a[data-click-id="timestamp"]',
        'a[data-event-action="thumbnail"]',
        '.outboundLink',
        'a[data-outbound-url]',
        '.title a[href*="youtu.be"]',
        '.title a[href*="youtube.com"]',
        '.title a[href*="twitch.tv"]',
        '.title a[href*="twitter.com"]',
        '.title a[href*="x.com"]'
      ];

      for (const selector of linkSelectors) {
        const linkElement = document.querySelector(selector);
        if (linkElement && linkElement.href && !linkElement.href.includes('reddit.com')) {
          externalLink = {
            url: linkElement.href,
            text: linkElement.textContent.trim() || linkElement.title || 'External Link'
          };
          break;
        }
      }

      // Enhanced link post handling
      if (externalLink) {
        content += `\n## External Link\n\n`;
        content += `**🔗 [${externalLink.text}](${externalLink.url})**\n\n`;

        // Add platform-specific handling
        const url = externalLink.url.toLowerCase();

        // YouTube links
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
          let videoId = '';
          if (url.includes('youtu.be/')) {
            videoId = url.split('youtu.be/')[1]?.split('?')[0];
          } else if (url.includes('youtube.com/watch?v=')) {
            videoId = url.split('v=')[1]?.split('&')[0];
          }

          if (videoId) {
            const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            content += `[![YouTube Video Thumbnail](${thumbnailUrl})](${externalLink.url})\n\n`;
            content += `**📺 Platform:** YouTube\n`;
          }
        }

        // Twitch links
        else if (url.includes('twitch.tv')) {
          content += `**📺 Platform:** Twitch\n`;
          if (url.includes('/video/')) {
            const videoId = url.split('/video/')[1]?.split('?')[0];
            if (videoId) {
              content += `**🎥 Video ID:** ${videoId}\n`;
            }
          }
        }

        // Twitter/X links
        else if (url.includes('twitter.com') || url.includes('x.com')) {
          const username = url.split('/').pop()?.split('?')[0];
          content += `**🐦 Platform:** X (Twitter)\n`;
          if (username && username.length > 0) {
            content += `**👤 User:** @${username}\n`;
          }
        }

        // General website links
        else {
          try {
            const hostname = new URL(externalLink.url).hostname;
            content += `**🌐 Website:** ${hostname}\n`;
          } catch (e) {
            content += `**🌐 Type:** External Website\n`;
          }
        }

        content += `**⏰ Link posted:** ${new Date().toLocaleString()}\n\n`;
      }

      // Get metadata
      const author = document.querySelector('shreddit-post [slot="authorName"] a, a[author]');
      const subreddit = document.querySelector('shreddit-post [slot="subreddit"] a, a[slot="subreddit-name"]');
      const timestamp = document.querySelector('shreddit-post time, time');

      result.metadata = {
        author: author ? author.textContent.trim().replace('u/', '') : null,
        subreddit: subreddit ? subreddit.textContent.trim().replace('r/', '') : null,
        timestamp: timestamp ? timestamp.getAttribute('datetime') : null,
        externalLink: externalLink ? {
          url: externalLink.url,
          text: externalLink.text,
          platform: getPlatformFromUrl(externalLink.url)
        } : null,
        type: 'reddit-post'
      };

      result.content = content.trim() || 'Could not extract post content';
      return result;
    }
  }
};

// Convert HTML table to Markdown table format
function convertTableToMarkdown(table) {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  let markdown = '\n';
  let headerAdded = false;

  rows.forEach((row, rowIndex) => {
    const cells = Array.from(row.querySelectorAll('th, td'));
    const cellTexts = cells.map(cell => {
      let text = cell.textContent.trim();
      text = text.replace(/\|/g, '\\|'); // Escape pipe characters
      text = text.replace(/\s+/g, ' '); // Handle multi-line content
      return text;
    });

    // Create the markdown row
    markdown += '| ' + cellTexts.join(' | ') + ' |\n';

    // Add separator row after headers (first row with th elements)
    if (!headerAdded && (row.querySelector('th') || rowIndex === 0)) {
      const separators = cellTexts.map(text => '-'.repeat(Math.max(text.length, 3)));
      markdown += '| ' + separators.join(' | ') + ' |\n';
      headerAdded = true;
    }
  });

  return markdown + '\n';
}

// Main content extraction using Readability.js
function extractWithReadability() {
  const result = {
    title: '',
    content: '',
    metadata: {
      type: 'readability-article'
    }
  };

  try {
    // Create a document clone for Readability to work with
    const documentClone = document.cloneNode(true);

    // Initialize Readability
    const reader = new Readability(documentClone, {
      // Options for better extraction
      charThreshold: 100, // Minimum characters to consider content
      maxElemsToParse: 0, // Parse all elements (no limit)
      nbTopCandidates: 5, // Consider top 5 candidates for main content
      classesToPreserve: [] // Don't preserve any specific classes
    });

    // Extract the article
    const article = reader.parse();

    if (article) {
      result.title = article.title || document.title;
      result.content = article.content;
      result.metadata = {
        excerpt: article.excerpt,
        byline: article.byline,
        siteName: article.siteName || new URL(window.location.href).hostname,
        length: article.length,
        type: 'readability-article'
      };

      // Convert HTML content to clean Markdown
      result.content = convertHTMLToMarkdown(result.content);
    } else {
      // Fallback to basic extraction if Readability fails
      result.title = document.title;
      result.content = getFallbackContent();
      result.metadata.type = 'fallback-extraction';
    }
  } catch (error) {
    console.error('Readability extraction failed:', error);
    // Fallback extraction
    result.title = document.title;
    result.content = getFallbackContent();
    result.metadata.type = 'fallback-extraction';
  }

  return result;
}

// Fallback extraction method when Readability fails
function getFallbackContent() {
  // Try to find main content areas
  const contentSelectors = [
    'article',
    'main',
    '[role="main"]',
    '.post',
    '.content',
    '.entry-content',
    '.article-content'
  ];

  for (const selector of contentSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      return convertHTMLToMarkdown(element.innerHTML);
    }
  }

  // Last resort: get paragraphs with substantial content
  const paragraphs = Array.from(document.querySelectorAll('p'))
    .filter(p => p.textContent.trim().length > 50)
    .slice(0, 20);

  if (paragraphs.length > 0) {
    return paragraphs.map(p => p.textContent.trim()).join('\n\n');
  }

  return 'Could not extract readable content from this page.';
}

// Convert HTML content to Markdown
function convertHTMLToMarkdown(htmlContent) {
  // Create a temporary element to work with
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;

  // Convert tables to Markdown
  tempDiv.querySelectorAll('table').forEach(table => {
    const tableMarkdown = convertTableToMarkdown(table);
    table.outerHTML = tableMarkdown;
  });

  // Convert headings
  tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
    const level = parseInt(heading.tagName[1]);
    const prefix = '#'.repeat(level);
    heading.innerHTML = `\n${prefix} ${heading.textContent.trim()}\n\n`;
  });

  // Convert paragraphs
  tempDiv.querySelectorAll('p').forEach(p => {
    p.innerHTML = `${p.innerHTML.trim()}\n\n`;
  });

  // Convert line breaks
  tempDiv.querySelectorAll('br').forEach(br => {
    br.outerHTML = '\n';
  });

  // Convert lists
  tempDiv.querySelectorAll('ul').forEach(ul => {
    const items = Array.from(ul.querySelectorAll('li'));
    const listContent = items.map(li => `- ${li.textContent.trim()}`).join('\n');
    ul.outerHTML = `\n${listContent}\n\n`;
  });

  tempDiv.querySelectorAll('ol').forEach(ol => {
    const items = Array.from(ol.querySelectorAll('li'));
    const listContent = items.map((li, idx) => `${idx + 1}. ${li.textContent.trim()}`).join('\n');
    ol.outerHTML = `\n${listContent}\n\n`;
  });

  // Convert links
  tempDiv.querySelectorAll('a').forEach(a => {
    const text = a.textContent.trim();
    const href = a.href;
    if (text && href) {
      a.textContent = `[${text}](${href})`;
    }
  });

  // Convert images
  tempDiv.querySelectorAll('img').forEach(img => {
    const alt = img.alt || 'Image';
    const src = img.src;
    if (src) {
      img.outerHTML = `![${alt}](${src})`;
    }
  });

  // Convert bold/strong
  tempDiv.querySelectorAll('strong, b').forEach(el => {
    el.innerHTML = `**${el.textContent}**`;
  });

  // Convert italic/em
  tempDiv.querySelectorAll('em, i').forEach(el => {
    el.innerHTML = `*${el.textContent}*`;
  });

  // Convert code blocks
  tempDiv.querySelectorAll('pre').forEach(pre => {
    const code = pre.querySelector('code');
    if (code) {
      pre.innerHTML = `\n\`\`\`\n${code.textContent}\n\`\`\`\n\n`;
    }
  });

  // Convert inline code
  tempDiv.querySelectorAll('code:not(pre code)').forEach(code => {
    code.innerHTML = `\`${code.textContent}\``;
  });

  // Get the text content and clean it up
  let markdown = tempDiv.textContent || tempDiv.innerText || '';

  // Clean up excessive whitespace while preserving structure
  markdown = markdown
    .replace(/\n{3,}/g, '\n\n') // Reduce multiple consecutive newlines to max 2
    .replace(/[ \t]+/g, ' ') // Collapse multiple spaces/tabs to single space
    .replace(/^\n+|\n+$/g, '') // Trim leading/trailing newlines
    + '\n'; // Ensure trailing newline

  return markdown;
}

// Handle text selection
function getSelectionContent() {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const container = document.createElement('div');
    container.appendChild(range.cloneContents());
    return {
      title: selection.toString().substring(0, 100) + (selection.toString().length > 100 ? '...' : ''),
      content: convertHTMLToMarkdown(container.innerHTML),
      metadata: {
        type: 'selection'
      }
    };
  }
  return {
    title: 'No text selected',
    content: 'No text selected',
    metadata: { type: 'selection-empty' }
  };
}

// Find extractor for current site (for specialized sites)
function findExtractor(hostname) {
  // Check for exact domain matches first, then partial matches
  for (const domain in extractors) {
    if (hostname === domain || hostname.includes(domain)) {
      return extractors[domain];
    }
  }
  return null;
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

    (async () => {
      try {
        if (extractor) {
          const info = await extractor.extract();
          sendResponse({ title: info.title });
        } else {
          // Use Readability for page title
          const result = extractWithReadability();
          sendResponse({ title: result.title });
        }
      } catch (error) {
        console.error('Error getting page info:', error);
        sendResponse({ title: document.title });
      }
    })();
    return true;
  }

  if (request.action === 'extractContent') {
    const hostname = new URL(window.location.href).hostname;
    const extractor = findExtractor(hostname);

    (async () => {
      try {
        let result;

        if (request.clipType === 'selection') {
          result = getSelectionContent();
        } else if (extractor && (request.clipType === 'auto' || request.clipType === 'full')) {
          // Use specialized extractor for auto and full mode on Amazon/YouTube/Reddit
          result = await extractor.extract();
        } else {
          // Use Readability for all other cases
          result = extractWithReadability();
          if (request.clipType === 'full' && result.metadata.type === 'readability-article') {
            // For full page, try to get more comprehensive content
            const fullResult = extractWithReadability();
            result = fullResult;
          }
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
    return true;
  }
});