// Reddit extractor - Reddit has specific post structure that needs special handling
(function() {
  'use strict';

  if (typeof window.JottyExtractors === 'undefined') {
    window.JottyExtractors = {};
  }

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

  window.JottyExtractors.reddit = {
    name: 'Reddit',
    domains: ['reddit.com'],
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

    // Get post thumbnail first - add to top
    const postContainer = document.querySelector('shreddit-post, .thing, div[data-testid="post-container"]');
    const redditPostUrl = window.location.href;
    let postThumbnail = null;
    let thumbnailLink = redditPostUrl;
    let thumbnailText = 'Reddit Post Thumbnail';

    // Try to get post thumbnail - look for actual post thumbnail image
    if (postContainer) {
      // Try multiple selectors for post thumbnail
      const thumbnailSelectors = [
        'img[alt="Post thumbnail"]',
        'img[src*="thumbnail"]',
        '.post-thumbnail img',
        '.thumbnail img',
        'img[src*="preview.redd.it"]',
        'img[src*="i.redd.it"]'
      ];

      for (const selector of thumbnailSelectors) {
        const thumbnail = postContainer.querySelector(selector);
        if (thumbnail && thumbnail.src && !thumbnail.src.includes('javascript:')) {
          postThumbnail = thumbnail.src;

          // Try to find the link that the thumbnail points to
          const thumbnailLinkEl = thumbnail.closest('a');
          if (thumbnailLinkEl && thumbnailLinkEl.href) {
            thumbnailLink = thumbnailLinkEl.href;
          }
          thumbnailText = thumbnail.alt || 'Reddit Post Thumbnail';
          break;
        }
      }

      // Process thumbnail if found
      if (postThumbnail) {
        // Check if thumbnail is a GIF or converted to static PNG
        const isGif = postThumbnail.toLowerCase().includes('.gif') ||
                      (postThumbnail.toLowerCase().includes('.png') &&
                       (postThumbnail.toLowerCase().includes('format=png') ||
                        postThumbnail.toLowerCase().includes('v0-')));

        if (isGif) {
          content += `## Post Thumbnail (Animated GIF)\n\n`;

          // Try to find the original animated GIF URL if Reddit converted it to PNG
          let animatedGifUrl = postThumbnail;

          // If Reddit converted the GIF to PNG, try to construct the original MP4/GIF URL
          if (postThumbnail.toLowerCase().includes('.png') && postThumbnail.includes('preview.redd.it')) {
            // Extract the base filename without extension
            const baseUrl = postThumbnail.replace(/\?.*$/, '').replace('.png', '');

            // Try to construct the MP4 URL (Reddit usually stores animations as MP4)
            const mp4Url = `${baseUrl}.gif?width=640&format=mp4&auto=webp&s=auto`;
            const gifUrl = `${baseUrl}.gif?width=640&format=gif&auto=webp&s=auto`;

            // For GitHub Flavored Markdown, MP4 videos need HTML embed
            content += `<video controls autoplay muted loop style="max-width: 100%; height: auto;">\n`;
            content += `  <source src="${mp4Url}" type="video/mp4">\n`;
            content += `  <source src="${gifUrl}" type="image/gif">\n`;
            content += `  <img src="${postThumbnail}" alt="${thumbnailText} - Static preview">\n`;
            content += `  Your browser does not support the video tag.\n`;
            content += `</video>\n\n`;
          } else {
            // Regular GIF from other sources
            content += `![${thumbnailText} - Animated GIF](${postThumbnail})\n\n`;
          }

          content += `**🔗 [Direct Link to Post](${thumbnailLink})**\n\n`;
        } else {
          content += `## Post Thumbnail\n\n`;
          content += `[![${thumbnailText} - Click to View](${postThumbnail})](${thumbnailLink})\n\n`;
        }
      }
    }

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

    // Get post content images (exclude the thumbnail we already used)
    const images = postContainer.querySelectorAll('img[src*="redd.it"], img[src*="imgur"], img[src*="preview.redd.it"], img[src*="i.redd.it"]');
    const seenImages = new Set();
    if (postThumbnail) seenImages.add(postThumbnail); // Don't duplicate thumbnail

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


    // Smart detection of all links and embedded videos in the Reddit post
    const detectLinksAndVideos = () => {
      const postContainer = document.querySelector('shreddit-post, .thing, div[data-testid="post-container"]');
      if (!postContainer) return [];

      const links = [];
      const seenUrls = new Set();

      // Find all links in the post
      const allLinks = postContainer.querySelectorAll('a[href]');
      allLinks.forEach(linkElement => {
        const url = linkElement.href;
        const text = linkElement.textContent.trim() || linkElement.title || 'Link';

        // Skip Reddit internal links and duplicates
        if (url && !url.includes('reddit.com') && !seenUrls.has(url) && url !== window.location.href) {
          seenUrls.add(url);
          links.push({
            url: url,
            text: text,
            element: linkElement
          });
        }
      });

      // Look for embedded videos in Reddit's video players
      const videoElements = postContainer.querySelectorAll('video source, shreddit-player video source, .media-element-embedded-video source');
      videoElements.forEach(videoSource => {
        const videoUrl = videoSource.src || videoSource.getAttribute('src');
        if (videoUrl && !seenUrls.has(videoUrl)) {
          seenUrls.add(videoUrl);
          links.push({
            url: videoUrl,
            text: 'Embedded Video',
            element: videoSource,
            isVideo: true
          });
        }
      });

      // Look for video embed containers (Twitch, YouTube, etc.)
      const videoContainers = postContainer.querySelectorAll('iframe[src*="youtube"], iframe[src*="twitch"], .reddit-embed, .video-player');
      videoContainers.forEach(container => {
        const src = container.src || container.getAttribute('src');
        if (src && !seenUrls.has(src)) {
          seenUrls.add(src);
          links.push({
            url: src,
            text: 'Embedded Content',
            element: container,
            isEmbed: true
          });
        }
      });

      // Look for data attributes that might contain video URLs
      const dataElements = postContainer.querySelectorAll('[data-video-url], [data-source], [data-href-url]');
      dataElements.forEach(element => {
        const url = element.getAttribute('data-video-url') ||
                   element.getAttribute('data-source') ||
                   element.getAttribute('data-href-url');
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          links.push({
            url: url,
            text: 'Media Link',
            element: element,
            isDataLink: true
          });
        }
      });

      return links;
    };

    // Get all detected links and videos
    const detectedLinks = detectLinksAndVideos();

    // Enhanced link post handling with all detected links and videos
    if (detectedLinks.length > 0) {
      content += `\n## Links & Media\n\n`;

      detectedLinks.forEach((link, index) => {
        const url = link.url.toLowerCase();
        const linkType = link.isVideo ? '🎥' : link.isEmbed ? '📺' : link.isDataLink ? '🎬' : '🔗';

        content += `${linkType} **[${link.text}](${link.url})**\n\n`;

        // Add platform-specific handling and thumbnails
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
          let videoId = '';
          if (url.includes('youtu.be/')) {
            videoId = url.split('youtu.be/')[1]?.split('?')[0];
          } else if (url.includes('youtube.com/watch?v=')) {
            videoId = url.split('v=')[1]?.split('&')[0];
          } else if (url.includes('youtube.com/embed/')) {
            videoId = url.split('youtube.com/embed/')[1]?.split('?')[0];
          }

          if (videoId) {
            const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            content += `[![YouTube Video Thumbnail](${thumbnailUrl})](${link.url})\n\n`;
            content += `**📺 Platform:** YouTube\n`;
            content += `**🎬 Video ID:** ${videoId}\n`;
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
          } else {
            const username = url.split('/')?.[1]?.split('?')[0];
            if (username) {
              content += `**👤 Channel:** ${username}\n`;
            }
          }
        }

        // Twitter/X links
        else if (url.includes('twitter.com') || url.includes('x.com')) {
          const username = url.split('/').pop()?.split('?')[0];
          content += `**🐦 Platform:** X (Twitter)\n`;
          if (username && username.length > 0 && !username.includes('status')) {
            content += `**👤 User:** @${username}\n`;
          } else if (url.includes('/status/')) {
            content += `**📝 Tweet Post\n**`;
          }
        }

        // Instagram links
        else if (url.includes('instagram.com')) {
          content += `**📷 Platform:** Instagram\n`;
          if (url.includes('/p/')) {
            content += `**📸 Instagram Post\n**`;
          } else if (url.includes('/reel/')) {
            content += `**🎬 Instagram Reel\n**`;
          }
        }

        // TikTok links
        else if (url.includes('tiktok.com')) {
          content += `**🎵 Platform:** TikTok\n`;
          if (url.includes('/video/')) {
            content += `**🎵 TikTok Video\n**`;
          }
        }

        // Reddit video links (v.redd.it)
        else if (url.includes('v.redd.it') || url.includes('redd.it')) {
          content += `**🎥 Platform:** Reddit Video\n`;
          content += `**⬇️ Direct Video Link\n**`;
        }

        // GitHub links
        else if (url.includes('github.com')) {
          content += `**💻 Platform:** GitHub\n`;
          if (url.includes('/issues/')) {
            content += `**🐛 GitHub Issue\n**`;
          } else if (url.includes('/pull/')) {
            content += `**🔄 Pull Request\n**`;
          } else if (url.includes('/blob/')) {
            content += `**📄 File/Code\n**`;
          }
        }

        // General website links
        else {
          try {
            const hostname = new URL(link.url).hostname;
            content += `**🌐 Website:** ${hostname}\n`;
          } catch (e) {
            content += `**🌐 Type:** External Link\n`;
          }
        }

        content += `**⏰ Extracted:** ${new Date().toLocaleString()}\n\n`;

        // Add separator between multiple links (except last one)
        if (index < detectedLinks.length - 1) {
          content += `---\n\n`;
        }
      });
    }

    // Get metadata
    const author = document.querySelector('shreddit-post [slot="authorName"] a, a[author]');
    const subreddit = document.querySelector('shreddit-post [slot="subreddit"] a, a[slot="subreddit-name"]');
    const timestamp = document.querySelector('shreddit-post time, time');

    result.metadata = {
      author: author ? author.textContent.trim().replace('u/', '') : null,
      subreddit: subreddit ? subreddit.textContent.trim().replace('r/', '') : null,
      timestamp: timestamp ? timestamp.getAttribute('datetime') : null,
      postThumbnail: postThumbnail ? {
        url: postThumbnail,
        alt: 'Reddit Post Thumbnail'
      } : null,
      detectedLinks: detectedLinks.length > 0 ? detectedLinks.map(link => ({
        url: link.url,
        text: link.text,
        platform: getPlatformFromUrl(link.url),
        type: link.isVideo ? 'video' : link.isEmbed ? 'embed' : link.isDataLink ? 'data' : 'link'
      })) : null,
      type: 'reddit-post'
    };

    result.content = content.trim() || 'Could not extract post content';

    // Debug logging
    if (detectedLinks.length > 0) {
      console.log('Reddit post detected links:', detectedLinks.map(l => l.url));
    }
    if (postThumbnail) {
      console.log('Reddit post thumbnail found:', postThumbnail);
    }

    return result;
    }
  };
})();
