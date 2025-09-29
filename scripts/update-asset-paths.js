#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const OUTPUT_DIR = path.join(__dirname, '../.output/public');
const OLD_PATH = '/assets/';
const NEW_PATH = '/temporary2/assets/';

// File extensions to process
const PROCESSABLE_EXTENSIONS = ['.html', '.css', '.js', '.json', '.xml', '.txt'];

/**
 * Recursively get all files in a directory
 */
async function getAllFiles(dir, files = []) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });

  for (const dirent of dirents) {
    const fullPath = path.join(dir, dirent.name);

    if (dirent.isDirectory()) {
      await getAllFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Check if file should be processed based on extension
 */
function shouldProcessFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return PROCESSABLE_EXTENSIONS.includes(ext);
}

/**
 * Update asset paths in file content
 */
function updateAssetPaths(content) {
  // Replace all occurrences of /assets/ with /temporary2/assets/
  // This handles various patterns:
  // - "/assets/file.js"
  // - '/assets/file.css'
  // - href="/assets/style.css"
  // - src="/assets/script.js"
  // - import('/assets/module.js')

  const patterns = [
    // Direct string replacements
    new RegExp(`"${OLD_PATH.replace(/\//g, '\\/')}`, 'g'),
    new RegExp(`'${OLD_PATH.replace(/\//g, '\\/')}`, 'g'),
    // URL patterns in CSS
    new RegExp(`url\\(${OLD_PATH.replace(/\//g, '\\/')}`, 'g'),
    new RegExp(`url\\("${OLD_PATH.replace(/\//g, '\\/').slice(0, -1)}"\\)`, 'g'),
    new RegExp(`url\\('${OLD_PATH.replace(/\//g, '\\/').slice(0, -1)}'\\)`, 'g'),
  ];

  let updatedContent = content;

  // Simple string replacement - most reliable approach
  updatedContent = updatedContent.replace(new RegExp(OLD_PATH.replace(/\//g, '\\/'), 'g'), NEW_PATH);

  return updatedContent;
}

/**
 * Process a single file
 */
async function processFile(filePath) {
  try {
    if (!shouldProcessFile(filePath)) {
      return { processed: false, reason: 'Extension not supported' };
    }

    const content = await fs.readFile(filePath, 'utf8');
    const originalContent = content;
    const updatedContent = updateAssetPaths(content);

    if (originalContent !== updatedContent) {
      await fs.writeFile(filePath, updatedContent, 'utf8');

      // Count replacements
      const matches = (originalContent.match(new RegExp(OLD_PATH.replace(/\//g, '\\/'), 'g')) || []).length;

      return {
        processed: true,
        replacements: matches,
        size: updatedContent.length
      };
    }

    return { processed: false, reason: 'No changes needed' };
  } catch (error) {
    return {
      processed: false,
      reason: `Error: ${error.message}`,
      error: true
    };
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting asset path update...');
  console.log(`📁 Processing directory: ${OUTPUT_DIR}`);
  console.log(`🔄 Replacing: "${OLD_PATH}" → "${NEW_PATH}"`);
  console.log('');

  try {
    // Check if output directory exists
    await fs.access(OUTPUT_DIR);
  } catch (error) {
    console.error(`❌ Error: Output directory not found: ${OUTPUT_DIR}`);
    console.error('Make sure you have built the project first with: npm run build');
    process.exit(1);
  }

  try {
    // Get all files
    console.log('📋 Scanning files...');
    const allFiles = await getAllFiles(OUTPUT_DIR);

    console.log(`📊 Found ${allFiles.length} total files`);

    // Process files
    const results = {
      processed: 0,
      skipped: 0,
      errors: 0,
      totalReplacements: 0
    };

    for (const filePath of allFiles) {
      const relativePath = path.relative(OUTPUT_DIR, filePath);
      const result = await processFile(filePath);

      if (result.processed) {
        results.processed++;
        results.totalReplacements += result.replacements;
        console.log(`✅ ${relativePath} (${result.replacements} replacements)`);
      } else if (result.error) {
        results.errors++;
        console.log(`❌ ${relativePath} - ${result.reason}`);
      } else {
        results.skipped++;
        // Only log skipped files if verbose mode or important
        if (process.argv.includes('--verbose')) {
          console.log(`⏭️  ${relativePath} - ${result.reason}`);
        }
      }
    }

    // Summary
    console.log('');
    console.log('📈 Summary:');
    console.log(`   ✅ Processed: ${results.processed} files`);
    console.log(`   ⏭️  Skipped: ${results.skipped} files`);
    console.log(`   ❌ Errors: ${results.errors} files`);
    console.log(`   🔄 Total replacements: ${results.totalReplacements}`);

    if (results.processed > 0) {
      console.log('');
      console.log('🎉 Asset paths updated successfully!');
      console.log('');
      console.log('📝 Next steps:');
      console.log('   1. Review the changes in your files');
      console.log('   2. Test your application to ensure everything works');
      console.log('   3. Make sure your server serves files from /temporary2/assets/');
    } else {
      console.log('');
      console.log('ℹ️  No files needed updating.');
    }

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Asset Path Updater Script

Usage:
  node scripts/update-asset-paths.js [options]

Options:
  --verbose    Show detailed output including skipped files
  --help, -h   Show this help message

Description:
  This script updates asset paths in your built application from '/assets/'
  to '/temporary2/assets/'. It processes HTML, CSS, JS, JSON, XML, and TXT files
  in the .output/public directory.

Examples:
  node scripts/update-asset-paths.js
  node scripts/update-asset-paths.js --verbose
`);
  process.exit(0);
}

// Run the script
main().catch(console.error);
