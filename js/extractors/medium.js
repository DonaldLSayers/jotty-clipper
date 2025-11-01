// Medium extractor - Clean article extraction
(function() {
  'use strict';

  if (typeof window.JottyExtractors === 'undefined') {
    window.JottyExtractors = {};
  }

  window.JottyExtractors.medium = {
    name: 'Medium',
    domains: ['medium.com'],
    extract: () => {
      console.log('📝 Medium extractor starting...');

      const result = {
        title: '',
        content: '',
        metadata: {}
      };

      // Helper to clean text
      const cleanText = (text) => {
        if (!text) return '';
        return text.replace(/\s+/g, ' ').trim();
      };

      // 1. GET ARTICLE TITLE
      const titleElement = document.querySelector('h1[class*="title"], article h1, h1');
      if (titleElement) {
        result.title = cleanText(titleElement.textContent);
        console.log('✓ Found title:', result.title);
      } else {
        result.title = document.title.replace(' | Medium', '').replace(' - Medium', '');
      }

      let content = `# ${result.title}\n\n`;

      // 2. GET AUTHOR AND METADATA
      let author = '';
      const authorElement = document.querySelector('a[rel="author"], [data-testid="authorName"], a[href*="/@"]');
      if (authorElement) {
        author = cleanText(authorElement.textContent);
      }

      let publishDate = '';
      const dateElement = document.querySelector('time, [data-testid="storyPublishDate"]');
      if (dateElement) {
        publishDate = dateElement.getAttribute('datetime') || cleanText(dateElement.textContent);
      }

      let readTime = '';
      const readTimeElement = document.querySelector('[data-testid="storyReadTime"], span[class*="readingTime"]');
      if (readTimeElement) {
        readTime = cleanText(readTimeElement.textContent);
      }

      // Add metadata to content
      if (author) {
        content += `**Author:** ${author}\n`;
      }
      if (publishDate) {
        content += `**Published:** ${publishDate}\n`;
      }
      if (readTime) {
        content += `**Read Time:** ${readTime}\n`;
      }
      if (author || publishDate || readTime) {
        content += '\n';
      }

      // 3. GET ARTICLE CONTENT
      // Medium uses various selectors, try them in order
      // We want to be more specific to avoid grabbing UI elements
      const articleSelectors = [
        'article section > div', // More specific - the actual content div inside section
        '[data-testid="article-content"]',
        '.postArticle-content',
        'article div[class*="postArticle"]',
        'article section',
        'article'
      ];

      let articleContent = null;
      for (const selector of articleSelectors) {
        const candidate = document.querySelector(selector);
        // Make sure we have substantial content, not just UI
        if (candidate && candidate.textContent.length > 200) {
          articleContent = candidate;
          console.log('✓ Found article content with selector:', selector);
          break;
        }
      }

      if (!articleContent) {
        console.log('✗ No article content found');
        result.content = content + 'Could not extract article content.';
        return result;
      }

      // Process inline elements (links, bold, italic, etc.)
      const processInlineElements = (element) => {
        let text = '';

        element.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent;
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toLowerCase();

            if (tag === 'a') {
              const href = node.getAttribute('href');
              const linkText = cleanText(node.textContent);

              if (href && linkText) {
                // Convert relative URLs to absolute
                let fullHref = href;
                if (href.startsWith('/')) {
                  fullHref = 'https://medium.com' + href;
                } else if (href.startsWith('http')) {
                  fullHref = href;
                }
                text += `[${linkText}](${fullHref})`;
              } else {
                text += linkText;
              }
            } else if (tag === 'code') {
              text += `\`${node.textContent}\``;
            } else if (tag === 'strong' || tag === 'b') {
              text += `**${cleanText(node.textContent)}**`;
            } else if (tag === 'em' || tag === 'i') {
              text += `*${cleanText(node.textContent)}*`;
            } else if (tag === 'mark') {
              text += `**${cleanText(node.textContent)}**`;
            } else if (tag === 'br') {
              text += '\n';
            } else {
              // Recursively process nested elements
              text += processInlineElements(node);
            }
          }
        });

        return text;
      };

      // Process content elements
      const processContent = (container) => {
        let text = '';

        // Get all direct children paragraphs, headings, lists, etc.
        const elements = container.querySelectorAll('p, h2, h3, h4, pre, blockquote, figure, ul, ol, hr');

        elements.forEach(element => {
          const tag = element.tagName.toLowerCase();

          // Skip elements that are likely UI junk
          const elementText = cleanText(element.textContent);

          // Skip if it's just a number (like "1", "26", "1K") or very short UI text
          if (elementText.match(/^[\d\s]+$/) ||
              elementText.match(/^[\d.]+[KM]?$/) ||
              elementText === 'Follow' ||
              elementText === 'Top highlight' ||
              elementText.match(/^\d+\s+(min|hour|day)s?\s+read$/) ||
              elementText.length < 3 ||  // Skip very short text
              elementText.match(/^[·•\-\s]+$/)) {  // Skip just punctuation
            return;
          }

          // Skip if element has certain classes that indicate UI
          const classList = element.className || '';
          if (classList.includes('clap') ||
              classList.includes('share') ||
              classList.includes('follow') ||
              classList.includes('button') ||
              classList.includes('highlight')) {
            return;
          }

          if (tag === 'h2') {
            const heading = cleanText(element.textContent);
            if (heading && heading.length > 10) { // Longer headings are real content
              text += `\n## ${heading}\n\n`;
            }
          } else if (tag === 'h3') {
            const heading = cleanText(element.textContent);
            if (heading && heading.length > 0) {
              text += `\n### ${heading}\n\n`;
            }
          } else if (tag === 'h4') {
            const heading = cleanText(element.textContent);
            if (heading && heading.length > 0) {
              text += `\n#### ${heading}\n\n`;
            }
          } else if (tag === 'p') {
            const paraText = processInlineElements(element);
            // Skip very short paragraphs that are likely UI elements
            if (paraText && paraText.trim().length > 15) {
              text += paraText.trim() + '\n\n';
            }
          } else if (tag === 'pre') {
            // Code blocks
            const code = element.querySelector('code');
            if (code) {
              const codeText = code.textContent;
              text += '```\n' + codeText + '\n```\n\n';
            } else {
              text += '```\n' + element.textContent + '\n```\n\n';
            }
          } else if (tag === 'blockquote') {
            const quoteText = cleanText(element.textContent);
            if (quoteText) {
              const lines = quoteText.split('\n');
              lines.forEach(line => {
                if (line.trim()) {
                  text += `> ${line.trim()}\n`;
                }
              });
              text += '\n';
            }
          } else if (tag === 'figure') {
            // Images
            const img = element.querySelector('img');
            if (img) {
              const imgSrc = img.src || img.getAttribute('data-src');
              const figcaption = element.querySelector('figcaption');
              const caption = figcaption ? cleanText(figcaption.textContent) : 'Image';

              if (imgSrc) {
                text += `![${caption}](${imgSrc})\n`;
                if (figcaption) {
                  text += `*${caption}*\n`;
                }
                text += '\n';
              }
            }
          } else if (tag === 'ul') {
            const items = element.querySelectorAll('li');
            items.forEach(item => {
              const itemText = processInlineElements(item);
              if (itemText && itemText.trim().length > 0) {
                text += `- ${itemText.trim()}\n`;
              }
            });
            text += '\n';
          } else if (tag === 'ol') {
            const items = element.querySelectorAll('li');
            items.forEach((item, idx) => {
              const itemText = processInlineElements(item);
              if (itemText && itemText.trim().length > 0) {
                text += `${idx + 1}. ${itemText.trim()}\n`;
              }
            });
            text += '\n';
          } else if (tag === 'hr') {
            text += '---\n\n';
          }
        });

        return text;
      };

      content += processContent(articleContent);

      // Add source URL
      content += `\n---\n\n**Source:** ${window.location.href}\n`;

      result.content = content;
      result.metadata = {
        type: 'medium-article',
        author: author,
        publishDate: publishDate,
        readTime: readTime,
        url: window.location.href
      };

      console.log('✅ Medium extraction complete!');
      console.log('Content length:', content.length);

      return result;
    }
  };
})();
