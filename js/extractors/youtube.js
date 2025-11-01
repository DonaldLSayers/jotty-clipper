// YouTube extractor - keep this as Readability doesn't handle video metadata well
(function() {
  'use strict';

  if (typeof window.JottyExtractors === 'undefined') {
    window.JottyExtractors = {};
  }

  window.JottyExtractors.youtube = {
    name: 'YouTube',
    domains: ['youtube.com', 'youtu.be'],
    extract: async () => {
    const result = {
      title: '',
      content: '',
      metadata: {}
    };

    // Get video title - modern YouTube layout
    const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1 yt-formatted-string.ytd-watch-metadata');
    if (titleEl) {
      result.title = titleEl.textContent.trim();
    } else {
      // Fallback: clean up document title - remove notification counts and YouTube suffix
      result.title = document.title
        .replace(/^\(\d+\)\s*/, '')  // Remove notification count like (483)
        .replace(/\s*-\s*YouTube\s*$/, '')  // Remove " - YouTube"
        .trim();
    }

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

    // Get video thumbnail and links (GFM-compatible) - add to top
    if (videoId) {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const embedUrl = `https://www.youtube.com/embed/${videoId}`;
      const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      const thumbnailHtmlUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

      result.content += `## Video Thumbnail\n\n`;
      result.content += `[![Video Thumbnail - Click to Watch](${thumbnailHtmlUrl})](${videoUrl})\n\n`;

      // Add direct links for different ways to watch
      result.content += `**🔗 Links:**\n`;
      result.content += `- [▶️ Watch on YouTube](${videoUrl})\n`;
      result.content += `- [📺 Direct Embed](${embedUrl})\n`;
      result.content += `- [🖼️ High Quality Thumbnail](${thumbnailUrl})\n\n`;
    }

    if (description && description.length > 0) {
      result.content += `## Description\n\n${description}\n`;
    } else {
      result.content += `## Description\n\n*No description available*\n`;
    }

    // Transcript functionality removed to avoid issues
    // YouTube extraction focuses on title, description, and metadata

    result.metadata = {
      channel,
      videoId,
      type: 'youtube-video'
    };

    return result;
    }
  };
})();
