// Wikipedia extractor - Clean article extraction
(function() {
  'use strict';

  if (typeof window.JottyExtractors === 'undefined') {
    window.JottyExtractors = {};
  }

  window.JottyExtractors.wikipedia = {
    name: 'Wikipedia',
    domains: ['wikipedia.org'],
    extract: () => {
      console.log('📚 Wikipedia extractor starting...');

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

      // 1. GET TITLE
      const titleEl = document.querySelector('#firstHeading');
      if (titleEl) {
        result.title = cleanText(titleEl.textContent);
        console.log('✓ Found title:', result.title);
      } else {
        result.title = document.title.replace(' - Wikipedia', '');
      }

      let content = `# ${result.title}\n\n`;

      // 2. GET MAIN ARTICLE CONTENT
      const articleContent = document.querySelector('#mw-content-text .mw-parser-output');

      if (!articleContent) {
        console.log('✗ No article content found');
        result.content = content;
        return result;
      }

      // Clone the content so we can modify it without affecting the page
      const contentClone = articleContent.cloneNode(true);

      // 3. REMOVE UNWANTED SECTIONS
      // Remove reference sections, navigation boxes, etc.
      const sectionsToRemove = [
        '.reflist',           // References
        '.reference',         // Individual references
        '#References',        // References heading
        '.navbox',            // Navigation boxes
        '.sistersitebox',     // Sister project boxes
        '.ambox',             // Article message boxes
        '.mw-editsection',    // Edit section links
        '.noprint',           // Print-hidden elements
        '.hatnote',           // Hatnotes (disambiguation, etc.)
        'sup.reference',      // Citation superscripts [1], [2], etc.
        '.sidebar',           // Sidebar boxes
        '.infobox-navbar',    // Infobox navigation
        'style',              // Style tags
        'script'              // Script tags
      ];

      sectionsToRemove.forEach(selector => {
        contentClone.querySelectorAll(selector).forEach(el => el.remove());
      });

      // Remove the "References" section and everything after it
      const referencesHeading = contentClone.querySelector('#References, .references, #Notes, #Citations');
      if (referencesHeading) {
        let current = referencesHeading.parentElement;
        while (current && current.nextElementSibling) {
          const next = current.nextElementSibling;
          next.remove();
        }
        current.remove();
        console.log('✓ Removed References section');
      }

      // 4. EXTRACT INFOBOX IMAGE (if exists)
      const infobox = articleContent.querySelector('.infobox');
      if (infobox) {
        const infoboxImage = infobox.querySelector('img');
        if (infoboxImage && infoboxImage.src) {
          let imgSrc = infoboxImage.src;
          // Convert to full URL if needed
          if (imgSrc.startsWith('//')) {
            imgSrc = 'https:' + imgSrc;
          }
          content += `![${result.title}](${imgSrc})\n\n`;
          console.log('✓ Found infobox image');
        }
      }

      // Helper function to process genealogical charts (family trees)
      const processGenealogyChart = (table) => {
        let text = '\n**Family Tree:**\n\n';

        // Extract all cells that contain actual person names (with borders)
        const allCells = table.querySelectorAll('td');
        const people = [];

        allCells.forEach(cell => {
          const style = cell.getAttribute('style') || '';
          // Cells with borders contain the actual people
          if (style.includes('border:') || style.includes('border-')) {
            const link = cell.querySelector('a[href*="/wiki/"]');
            if (link) {
              const name = cleanText(link.textContent);
              if (name && name.length > 0 && !people.includes(name)) {
                people.push(name);
              }
            } else {
              // Check for bold text (current subject)
              const boldText = cell.querySelector('b, strong');
              if (boldText) {
                const name = cleanText(boldText.textContent);
                if (name && name.length > 0 && !people.includes(name)) {
                  people.push(name);
                }
              }
            }
          }
        });

        // Output the people found in the genealogy chart
        if (people.length > 0) {
          text += people.map(person => `- ${person}`).join('\n');
          text += '\n\n';
          console.log('✓ Processed genealogy chart with', people.length, 'people');
        }

        return text;
      };

      // Helper function to process cladograms
      const processCladogram = (cladeTable) => {
        let text = '\n```\n';
        text += 'Cladogram:\n\n';

        // Recursive function to extract clade structure
        const extractCladeStructure = (table, depth = 0) => {
          let result = '';
          const indent = '  '.repeat(depth);

          // Get the first row which contains the structure
          const rows = Array.from(table.querySelectorAll(':scope > tbody > tr'));

          for (const row of rows) {
            // Check for clade-label (contains group names like "Ictonychinae")
            const labelCell = row.querySelector('.clade-label');
            if (labelCell) {
              const labelText = cleanText(labelCell.textContent);
              if (labelText && labelText.length > 0) {
                const branch = depth > 0 ? '├─ ' : '';
                result += indent + branch + labelText + '\n';
              }
            }

            // Check for clade-leaf (contains either species names or nested tables)
            const leafCell = row.querySelector('.clade-leaf');
            if (leafCell) {
              // First check if there's a nested clade table
              const nestedTable = leafCell.querySelector(':scope > div > table.clade');
              if (nestedTable) {
                // Recursively process nested clade
                result += extractCladeStructure(nestedTable, depth + 1);
              } else {
                // Extract species name from the paragraph
                const speciesP = leafCell.querySelector('p');
                if (speciesP) {
                  const speciesText = cleanText(speciesP.textContent);
                  if (speciesText && speciesText.length > 0) {
                    const branch = depth > 0 ? '├─ ' : '';
                    result += indent + branch + speciesText + '\n';
                  }
                }
              }
            }
          }

          return result;
        };

        text += extractCladeStructure(cladeTable, 0);
        text += '```\n\n';
        console.log('✓ Processed cladogram');
        return text;
      };

      // 5. PROCESS CONTENT - HEADINGS, PARAGRAPHS, IMAGES, LISTS
      const processNode = (node) => {
        let text = '';

        // Skip if it's a removed section
        if (!node || !node.tagName) return text;

        const tagName = node.tagName.toLowerCase();

        // Headings (h2, h3, h4)
        if (tagName === 'h2') {
          const headingText = cleanText(node.textContent);
          if (headingText && headingText !== 'Contents') {
            text += `\n## ${headingText}\n\n`;
          }
        } else if (tagName === 'h3') {
          const headingText = cleanText(node.textContent);
          if (headingText) {
            text += `\n### ${headingText}\n\n`;
          }
        } else if (tagName === 'h4') {
          const headingText = cleanText(node.textContent);
          if (headingText) {
            text += `\n#### ${headingText}\n\n`;
          }
        }
        // Paragraphs
        else if (tagName === 'p') {
          const paraText = processInlineElements(node);
          if (paraText && paraText.length > 0) {
            text += paraText + '\n\n';
          }
        }
        // Images (not in infobox, we already got that)
        else if (tagName === 'figure' || (tagName === 'div' && node.classList.contains('thumb'))) {
          const img = node.querySelector('img');
          const caption = node.querySelector('figcaption, .thumbcaption');

          if (img && img.src) {
            let imgSrc = img.src;
            if (imgSrc.startsWith('//')) {
              imgSrc = 'https:' + imgSrc;
            }
            const captionText = caption ? cleanText(caption.textContent) : 'Image';
            text += `![${captionText}](${imgSrc})\n`;
            if (caption) {
              text += `*${captionText}*\n`;
            }
            text += '\n';
          }
        }
        // Lists
        else if (tagName === 'ul') {
          const items = node.querySelectorAll(':scope > li');
          items.forEach(item => {
            const itemText = processInlineElements(item);
            if (itemText) {
              text += `- ${itemText}\n`;
            }
          });
          text += '\n';
        }
        else if (tagName === 'ol') {
          const items = node.querySelectorAll(':scope > li');
          items.forEach((item, idx) => {
            const itemText = processInlineElements(item);
            if (itemText) {
              text += `${idx + 1}. ${itemText}\n`;
            }
          });
          text += '\n';
        }
        // Tables
        else if (tagName === 'table') {
          // Handle cladograms specially
          if (node.classList.contains('clade')) {
            text += processCladogram(node);
            return text;
          }

          // Handle genealogical charts (family trees)
          // These are tables with border-collapse: separate and lots of colspan/rowspan
          const style = node.getAttribute('style') || '';
          if (style.includes('border-collapse: separate') || style.includes('border-spacing')) {
            // Check if it contains links to people (genealogical chart indicator)
            const hasPersonLinks = node.querySelector('a[href*="/wiki/"]');
            if (hasPersonLinks) {
              text += processGenealogyChart(node);
              return text;
            }
          }

          // Skip infobox tables and navbox tables
          if (node.classList.contains('infobox') ||
              node.classList.contains('navbox') ||
              node.classList.contains('ambox') ||
              node.classList.contains('sidebar')) {
            return text;
          }

          const rows = node.querySelectorAll('tr');
          if (rows.length === 0) return text;

          // Find header row
          const headerRow = node.querySelector('tr:has(th)');
          const headers = [];

          if (headerRow) {
            headerRow.querySelectorAll('th').forEach(th => {
              headers.push(cleanText(th.textContent));
            });
          }

          // Build markdown table
          if (headers.length > 0) {
            // Header row
            text += '| ' + headers.join(' | ') + ' |\n';
            // Separator row
            text += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
          }

          // Data rows
          rows.forEach(row => {
            // Skip if this is the header row
            if (row === headerRow) return;

            const cells = row.querySelectorAll('td');
            if (cells.length === 0) return;

            const cellData = [];
            cells.forEach(cell => {
              cellData.push(cleanText(processInlineElements(cell)));
            });

            // Only add row if we have data
            if (cellData.some(cell => cell.length > 0)) {
              text += '| ' + cellData.join(' | ') + ' |\n';
            }
          });

          text += '\n';
        }

        return text;
      };

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

              // Convert Wikipedia links to full URLs
              if (href && linkText && !href.startsWith('#')) {
                let fullHref = href;
                if (href.startsWith('/wiki/')) {
                  fullHref = 'https://en.wikipedia.org' + href;
                } else if (href.startsWith('//')) {
                  fullHref = 'https:' + href;
                }
                text += `[${linkText}](${fullHref})`;
              } else {
                text += linkText;
              }
            } else if (tag === 'b' || tag === 'strong') {
              text += `**${cleanText(node.textContent)}**`;
            } else if (tag === 'i' || tag === 'em') {
              text += `*${cleanText(node.textContent)}*`;
            } else if (tag === 'code') {
              text += `\`${node.textContent}\``;
            } else {
              // Recursively process nested elements
              text += processInlineElements(node);
            }
          }
        });

        return cleanText(text);
      };

      // 6. ITERATE THROUGH CONTENT
      // Wikipedia has a flat structure where h2/h3/h4 are direct children
      // We need to process all child elements, including nested ones
      const processAllNodes = (element) => {
        let text = '';
        const children = Array.from(element.children);

        for (const child of children) {
          const tagName = child.tagName.toLowerCase();

          // Check if it's a heading
          if (tagName === 'h2' || tagName === 'h3' || tagName === 'h4') {
            text += processNode(child);
          }
          // Check if it's a direct content element
          else if (tagName === 'p' || tagName === 'figure' || tagName === 'ul' ||
                   tagName === 'ol' || tagName === 'table') {
            text += processNode(child);
          }
          // Check for div containers with thumbs (images)
          else if (tagName === 'div' && child.classList.contains('thumb')) {
            text += processNode(child);
          }
          // Recursively process section containers
          else if (tagName === 'div' || tagName === 'section') {
            text += processAllNodes(child);
          }
        }

        return text;
      };

      content += processAllNodes(contentClone);

      result.content = content;
      result.metadata = {
        type: 'wikipedia-article',
        url: window.location.href
      };

      console.log('✅ Wikipedia extraction complete!');
      console.log('Content length:', content.length);

      return result;
    }
  };
})();
