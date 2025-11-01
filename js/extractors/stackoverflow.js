// Stack Overflow extractor - Extract questions and answers
(function() {
  'use strict';

  if (typeof window.JottyExtractors === 'undefined') {
    window.JottyExtractors = {};
  }

  window.JottyExtractors.stackoverflow = {
    name: 'Stack Overflow',
    domains: ['stackoverflow.com', 'stackexchange.com', 'superuser.com', 'serverfault.com', 'askubuntu.com', 'mathoverflow.net'],
    extract: () => {
      console.log('💻 Stack Overflow extractor starting...');

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

      // Helper to process code blocks
      const processCodeBlock = (pre) => {
        const code = pre.querySelector('code');
        if (!code) return '';

        const codeText = code.textContent;
        // Get language from class if available
        const classList = code.className;
        let language = '';
        if (classList) {
          const match = classList.match(/language-(\w+)|lang-(\w+)/);
          if (match) {
            language = match[1] || match[2];
          }
        }

        return '\n```' + language + '\n' + codeText + '\n```\n';
      };

      // Helper to process post content (question or answer body)
      const processPostContent = (contentElement) => {
        if (!contentElement) return '';

        let text = '';
        const children = Array.from(contentElement.children);

        children.forEach(child => {
          const tagName = child.tagName.toLowerCase();

          if (tagName === 'p') {
            // Process paragraphs with inline elements
            text += processInlineElements(child) + '\n\n';
          } else if (tagName === 'pre') {
            // Code blocks
            text += processCodeBlock(child) + '\n';
          } else if (tagName === 'h1') {
            text += `# ${cleanText(child.textContent)}\n\n`;
          } else if (tagName === 'h2') {
            text += `## ${cleanText(child.textContent)}\n\n`;
          } else if (tagName === 'h3') {
            text += `### ${cleanText(child.textContent)}\n\n`;
          } else if (tagName === 'ul') {
            const items = child.querySelectorAll('li');
            items.forEach(item => {
              text += `- ${processInlineElements(item)}\n`;
            });
            text += '\n';
          } else if (tagName === 'ol') {
            const items = child.querySelectorAll('li');
            items.forEach((item, idx) => {
              text += `${idx + 1}. ${processInlineElements(item)}\n`;
            });
            text += '\n';
          } else if (tagName === 'blockquote') {
            const lines = child.textContent.split('\n');
            lines.forEach(line => {
              if (line.trim()) {
                text += `> ${line.trim()}\n`;
              }
            });
            text += '\n';
          }
        });

        return text;
      };

      // Process inline elements (links, bold, italic, code, etc.)
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
                let fullHref = href;
                // Convert relative URLs to absolute
                if (href.startsWith('/')) {
                  fullHref = 'https://stackoverflow.com' + href;
                }
                text += `[${linkText}](${fullHref})`;
              } else {
                text += linkText;
              }
            } else if (tag === 'code') {
              text += `\`${node.textContent}\``;
            } else if (tag === 'b' || tag === 'strong') {
              text += `**${cleanText(node.textContent)}**`;
            } else if (tag === 'i' || tag === 'em') {
              text += `*${cleanText(node.textContent)}*`;
            } else if (tag === 'br') {
              text += '\n';
            } else {
              // Recursively process nested elements
              text += processInlineElements(node);
            }
          }
        });

        return cleanText(text);
      };

      // 1. GET QUESTION TITLE
      const titleEl = document.querySelector('#question-header h1, .question-hyperlink');
      if (titleEl) {
        result.title = cleanText(titleEl.textContent);
        console.log('✓ Found title:', result.title);
      } else {
        result.title = document.title.replace(' - Stack Overflow', '').replace(' - Stack Exchange', '');
      }

      let content = `# ${result.title}\n\n`;

      // 2. GET QUESTION TAGS
      const tags = [];
      document.querySelectorAll('.post-tag, .post-taglist .s-tag').forEach(tag => {
        tags.push(tag.textContent.trim());
      });
      if (tags.length > 0) {
        content += `**Tags:** ${tags.map(t => `\`${t}\``).join(', ')}\n\n`;
        console.log('✓ Found tags:', tags.join(', '));
      }

      // 3. GET QUESTION BODY
      const questionBody = document.querySelector('#question .s-prose, #question .post-text');
      if (questionBody) {
        content += '## Question\n\n';
        content += processPostContent(questionBody);
        console.log('✓ Processed question body');
      }

      // 4. GET ANSWERS
      const answers = document.querySelectorAll('.answer');
      if (answers.length > 0) {
        content += `---\n\n## Answers (${answers.length})\n\n`;
        console.log(`✓ Found ${answers.length} answers`);

        answers.forEach((answer, idx) => {
          // Check if it's the accepted answer
          const isAccepted = answer.classList.contains('accepted-answer') ||
                           answer.querySelector('.js-accepted-answer-indicator');

          // Get vote count
          const voteElement = answer.querySelector('.js-vote-count, [itemprop="upvoteCount"]');
          const votes = voteElement ? cleanText(voteElement.textContent) : '0';

          // Answer header
          if (isAccepted) {
            content += `### ✓ Answer (${votes} votes) - Accepted\n\n`;
          } else {
            content += `### Answer ${idx + 1} (${votes} votes)\n\n`;
          }

          // Answer body
          const answerBody = answer.querySelector('.s-prose, .post-text');
          if (answerBody) {
            content += processPostContent(answerBody);
          }

          content += '\n';
        });
      }

      result.content = content;
      result.metadata = {
        type: 'stackoverflow-question',
        url: window.location.href,
        tags: tags
      };

      console.log('✅ Stack Overflow extraction complete!');
      console.log('Content length:', content.length);

      return result;
    }
  };
})();
