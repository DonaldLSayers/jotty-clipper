#!/usr/bin/env node

/**
 * Sync version from package.json to all manifest files and HTML files
 * This script ensures the version number stays consistent across the extension
 * Source of truth: package.json
 */

const fs = require('fs');
const path = require('path');

// Read version from package.json (single source of truth)
function getPackageVersion() {
  try {
    const package = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    return package.version;
  } catch (error) {
    console.error('Error reading package.json:', error.message);
    process.exit(1);
  }
}

// Update version in manifest files
function updateManifestFiles(version) {
  const manifestFiles = ['manifest.json', 'manifest-chrome.json', 'manifest-firefox.json'];

  manifestFiles.forEach(file => {
    if (fs.existsSync(file)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));

        if (manifest.version !== version) {
          manifest.version = version;
          fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
          console.log(`✅ Updated ${file}: ${version}`);
        } else {
          console.log(`ℹ️  ${file} already has correct version: ${version}`);
        }
      } catch (error) {
        console.error(`Error updating ${file}:`, error.message);
      }
    } else {
      console.log(`⚠️  ${file} not found, skipping`);
    }
  });
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
  console.log('🔄 Syncing version from package.json to all files...');

  const version = getPackageVersion();
  console.log(`📦 Package.json version: ${version}`);

  updateManifestFiles(version);
  updateVersionInHTMLFiles(version);

  console.log('✅ Version sync complete!');
}

if (require.main === module) {
  main();
}

module.exports = { getPackageVersion, updateManifestFiles, updateVersionInHTMLFiles };
