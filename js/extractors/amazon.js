// Amazon extractor - Amazon has specific product data structure that needs special handling
(function() {
  'use strict';

  if (typeof window.JottyExtractors === 'undefined') {
    window.JottyExtractors = {};
  }

  // Amazon international domain mappings
  const AMAZON_DOMAINS = {
    'amazon.com': 'Amazon',
    'amazon.co.uk': 'Amazon UK',
    'amazon.ca': 'Amazon Canada',
    'amazon.de': 'Amazon Germany',
    'amazon.fr': 'Amazon France',
    'amazon.es': 'Amazon Spain',
    'amazon.it': 'Amazon Italy',
    'amazon.co.jp': 'Amazon Japan',
    'amazon.cn': 'Amazon China',
    'amazon.in': 'Amazon India',
    'amazon.com.mx': 'Amazon Mexico',
    'amazon.com.br': 'Amazon Brazil',
    'amazon.com.au': 'Amazon Australia',
    'amazon.nl': 'Amazon Netherlands',
    'amazon.se': 'Amazon Sweden',
    'amazon.pl': 'Amazon Poland',
    'amazon.tr': 'Amazon Turkey',
    'amazon.ae': 'Amazon UAE',
    'amazon.sa': 'Amazon Saudi Arabia',
    'amazon.eg': 'Amazon Egypt',
    'amazon.sg': 'Amazon Singapore'
  };

  window.JottyExtractors.amazon = {
    name: 'Amazon',
    domains: Object.keys(AMAZON_DOMAINS),
    extract: () => {
      console.log('🛒 Amazon extractor starting...');

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

      let content = '';

      // 1. PRODUCT NAME
      const titleEl = document.querySelector('#productTitle');
      if (titleEl) {
        result.title = cleanText(titleEl.textContent);
        console.log('✓ Found title:', result.title);
      } else {
        console.log('✗ No title found, using document title');
        // Clean up document title - remove Amazon.com suffixes
        result.title = document.title
          .replace(/\s*[-:]\s*Amazon\.com.*$/i, '')
          .replace(/\s*[-:]\s*Amazon\.co\.uk.*$/i, '')
          .replace(/\s*[-:]\s*Amazon\.de.*$/i, '')
          .replace(/\s*[-:]\s*Amazon\.fr.*$/i, '')
          .replace(/\s*[-:]\s*Amazon.*$/i, '')
          .trim();
      }

      content += `# ${result.title}\n\n`;

      // 2. MAIN IMAGE
      let imageUrl = null;

      // Try method 1: landingImage with data-old-hires
      const landingImage = document.querySelector('#landingImage');
      if (landingImage) {
        imageUrl = landingImage.getAttribute('data-old-hires');

        // If no data-old-hires, try data-a-dynamic-image (it's JSON)
        if (!imageUrl) {
          const dynamicImage = landingImage.getAttribute('data-a-dynamic-image');
          if (dynamicImage) {
            try {
              const imageObj = JSON.parse(dynamicImage);
              const urls = Object.keys(imageObj);
              if (urls.length > 0) {
                imageUrl = urls[0]; // First URL is usually highest quality
              }
            } catch (e) {
              console.log('Could not parse dynamic image');
            }
          }
        }

        // Fallback to src
        if (!imageUrl) {
          imageUrl = landingImage.src;
        }
      }

      // Try method 2: imgBlkFront
      if (!imageUrl) {
        const imgBlock = document.querySelector('#imgBlkFront');
        if (imgBlock && imgBlock.src) {
          imageUrl = imgBlock.src;
        }
      }

      if (imageUrl && !imageUrl.includes('javascript:')) {
        content += `![${result.title}](${imageUrl})\n\n`;
        console.log('✓ Found image:', imageUrl.substring(0, 50) + '...');
      } else {
        console.log('✗ No image found');
      }

      // 3. PRICE
      let priceEl = document.querySelector('.a-price[data-a-color="price"] .a-offscreen');
      if (!priceEl) priceEl = document.querySelector('.a-price .a-offscreen');
      if (!priceEl) priceEl = document.querySelector('#priceblock_ourprice');
      if (!priceEl) priceEl = document.querySelector('#priceblock_dealprice');
      if (!priceEl) priceEl = document.querySelector('.priceToPay .a-offscreen');

      if (priceEl) {
        const price = cleanText(priceEl.textContent);
        content += `**💰 Price:** ${price}\n`;
        result.metadata.price = price;
        console.log('✓ Found price:', price);
      } else {
        console.log('✗ No price found');
      }

      // 4. REVIEW STAR SCORE
      const ratingEl = document.querySelector('span[data-hook="rating-out-of-text"]');
      if (ratingEl) {
        const rating = cleanText(ratingEl.textContent);
        content += `**⭐ Rating:** ${rating}\n`;
        console.log('✓ Found rating:', rating);
      } else {
        console.log('✗ No rating found');
      }

      // Review count
      const reviewCountEl = document.querySelector('#acrCustomerReviewText');
      if (reviewCountEl) {
        const reviewCount = cleanText(reviewCountEl.textContent);
        content += `**📝 Reviews:** ${reviewCount}\n`;
        console.log('✓ Found review count:', reviewCount);
      }

      content += '\n---\n\n';

      // 5. ABOUT THIS ITEM (bullet points)
      const featureBulletsDiv = document.querySelector('#feature-bullets');
      if (featureBulletsDiv) {
        const bullets = [];
        const listItems = featureBulletsDiv.querySelectorAll('li span.a-list-item');

        listItems.forEach(item => {
          const text = cleanText(item.textContent);
          // Filter out navigation elements and empty items
          if (text &&
              text.length > 10 &&
              !text.toLowerCase().includes('see more') &&
              !text.toLowerCase().includes('make sure')) {
            bullets.push(text);
          }
        });

        if (bullets.length > 0) {
          content += `## About this item\n\n`;
          bullets.forEach(bullet => {
            content += `- ${bullet}\n`;
          });
          content += '\n';
          console.log('✓ Found', bullets.length, 'feature bullets');
        }
      } else {
        console.log('✗ No feature bullets found');
      }

      // 6. PRODUCT INFORMATION (as table)
      let detailsFound = false;
      const details = [];

      // Try method 1: #prodDetails table
      const prodDetailsTable = document.querySelector('#prodDetails table');
      if (prodDetailsTable) {
        console.log('✓ Found #prodDetails table');
        const rows = prodDetailsTable.querySelectorAll('tr');

        rows.forEach(row => {
          const th = row.querySelector('th');
          const td = row.querySelector('td');

          if (th && td) {
            const key = cleanText(th.textContent);
            const value = cleanText(td.textContent);

            if (key && value && key.length > 0 && value.length > 0) {
              details.push({ key, value });
            }
          }
        });

        if (details.length > 0) {
          detailsFound = true;
        }
      }

      // Try method 2: #detailBullets_feature_div (fallback)
      if (!detailsFound) {
        const detailBulletsDiv = document.querySelector('#detailBullets_feature_div');
        if (detailBulletsDiv) {
          console.log('✓ Found #detailBullets_feature_div');
          const listItems = detailBulletsDiv.querySelectorAll('li');

          listItems.forEach(item => {
            const text = cleanText(item.textContent);
            if (text.includes(':')) {
              const parts = text.split(':');
              if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join(':').trim();

                // Skip certain entries
                if (!key.includes('Customer Reviews') &&
                    !key.includes('Best Sellers Rank') &&
                    key.length > 0 &&
                    value.length > 0) {
                  details.push({ key, value });
                }
              }
            }
          });

          if (details.length > 0) {
            detailsFound = true;
          }
        }
      }

      // Try method 3: Technical details section
      if (!detailsFound) {
        const techDetailsTable = document.querySelector('#productDetails_techSpec_section_1 table');
        if (techDetailsTable) {
          console.log('✓ Found technical details table');
          const rows = techDetailsTable.querySelectorAll('tr');

          rows.forEach(row => {
            const cells = row.querySelectorAll('th, td');
            if (cells.length >= 2) {
              const key = cleanText(cells[0].textContent);
              const value = cleanText(cells[1].textContent);

              if (key && value && key.length > 0 && value.length > 0) {
                details.push({ key, value });
              }
            }
          });

          if (details.length > 0) {
            detailsFound = true;
          }
        }
      }

      // Output the details if we found any
      if (details.length > 0) {
        content += `## Product Information\n\n`;
        content += `| Detail | Information |\n`;
        content += `|--------|-------------|\n`;
        details.forEach(detail => {
          // Escape pipe characters in content
          const key = detail.key.replace(/\|/g, '\\|');
          const value = detail.value.replace(/\|/g, '\\|');
          content += `| ${key} | ${value} |\n`;
        });
        content += '\n';
        console.log('✓ Found', details.length, 'product details');
      } else {
        console.log('✗ No product details found');
      }

      // Get ASIN from URL
      const urlMatch = window.location.href.match(/\/dp\/([A-Z0-9]{10})/);
      if (urlMatch) {
        result.metadata.asin = urlMatch[1];
      }

      result.content = content;
      result.metadata.type = 'amazon-product';

      console.log('✅ Amazon extraction complete!');
      console.log('Content preview:', content.substring(0, 200));

      return result;
    }
  };
})();
