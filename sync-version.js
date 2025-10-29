#!/usr/bin/env node

/**
 * Sync version from manifest.json to HTML files
 * This script ensures the version number stays consistent across the extension
 */

const fs = require('fs');
const path = require('path');

// Read manifest version
function getManifestVersion() {
  try {
    const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
    return manifest.version;
  } catch (error) {
    console.error('Error reading manifest.json:', error.message);
    process.exit(1);
  }
}

// Update version in HTML files
function updateVersionInHTMLFiles(version) {
  const htmlFiles = ['options.html', 'popup.html'];
  const versionRegex = /Jotty Clipper v\d+\.\d+\.\d+/g;
  const newVersionText = `Jotty Clipper v${version}`;

  htmlFiles.forEach(file => {
    if (fs.existsSync(file)) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const updated = content.replace(versionRegex, newVersionText);

        if (content !== updated) {
          fs.writeFileSync(file, updated, 'utf8');
          console.log(`✅ Updated ${file}: ${newVersionText}`);
        } else {
          console.log(`ℹ️  ${file} already has correct version: ${newVersionText}`);
        }
      } catch (error) {
        console.error(`Error updating ${file}:`, error.message);
      }
    } else {
      console.log(`⚠️  ${file} not found, skipping`);
    }
  });
}

// Main execution
function main() {
  console.log('🔄 Syncing version from manifest.json to HTML files...');

  const version = getManifestVersion();
  console.log(`📦 Manifest version: ${version}`);

  updateVersionInHTMLFiles(version);

  console.log('✅ Version sync complete!');
}

if (require.main === module) {
  main();
}

module.exports = { getManifestVersion, updateVersionInHTMLFiles };