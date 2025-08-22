#!/usr/bin/env npx ts-node

import { SellerAmpScraper, SellerAmpRequest } from '../services/selleramp-scraper';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

interface TestOptions {
  asin: string;
  username: string;
  password: string;
  costPrice?: number;
  salePrice?: number;
}

async function testSellerAmpScraper(options: TestOptions) {
  const scraper = new SellerAmpScraper();

  try {
    console.log('🚀 Starting SellerAmp SPM Test');
    console.log('================================');
    console.log(`ASIN: ${options.asin}`);
    console.log(`Username: ${options.username}`);
    console.log(`Cost Price: £${options.costPrice || 120.39}`);
    console.log(`Sale Price: £${options.salePrice || 399.99}`);
    console.log('');

    const request: SellerAmpRequest = {
      asin: options.asin,
      costPrice: options.costPrice || 120.39,
      salePrice: options.salePrice || 399.99,
      credentials: {
        username: options.username,
        password: options.password
      }
    };

    console.log('🔍 Fetching SPM data from SellerAmp...');
    const startTime = Date.now();
    
    const result = await scraper.fetchSPM(request);
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('');
    console.log('📊 Results:');
    console.log('===========');
    console.log(`Success: ${result.success}`);
    console.log(`Duration: ${duration}s`);
    
    if (result.success) {
      console.log(`✅ SPM: ${result.spm}`);
      console.log(`Source: ${result.source}`);
    } else {
      console.log(`❌ Error: ${result.error}`);
    }

  } catch (error) {
    console.error('💥 Test failed with error:', error);
  } finally {
    console.log('');
    console.log('🧹 Cleaning up...');
    await scraper.close();
    console.log('✨ Test completed!');
  }
}

// Parse command line arguments
function parseArgs(): TestOptions | null {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log('Usage: npm run test:selleramp -- --asin <ASIN> --user <USERNAME> --pass <PASSWORD> [--cost <COST_PRICE>] [--sale <SALE_PRICE>]');
    console.log('');
    console.log('Example:');
    console.log('  npm run test:selleramp -- --asin B0DTB7GSNW --user your@email.com --pass yourpassword --cost 120.39 --sale 399.99');
    console.log('');
    console.log('Or use environment variables:');
    console.log('  SELLERAMP_USERNAME=your@email.com SELLERAMP_PASSWORD=yourpassword npm run test:selleramp -- --asin B0DTB7GSNW');
    return null;
  }

  const options: Partial<TestOptions> = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--asin':
        options.asin = args[++i];
        break;
      case '--user':
        options.username = args[++i];
        break;
      case '--pass':
        options.password = args[++i];
        break;
      case '--cost':
        options.costPrice = parseFloat(args[++i]);
        break;
      case '--sale':
        options.salePrice = parseFloat(args[++i]);
        break;
    }
  }

  // Use environment variables as fallback
  if (!options.username) {
    options.username = process.env.SELLERAMP_USERNAME;
  }
  if (!options.password) {
    options.password = process.env.SELLERAMP_PASSWORD;
  }

  if (!options.asin || !options.username || !options.password) {
    console.error('❌ Missing required parameters: asin, username, password');
    return null;
  }

  // Validate ASIN format
  if (!/^[A-Z0-9]{10}$/.test(options.asin)) {
    console.error('❌ Invalid ASIN format. Must be 10 alphanumeric characters.');
    return null;
  }

  return options as TestOptions;
}

// Main execution
async function main() {
  const options = parseArgs();
  if (!options) {
    process.exit(1);
  }

  try {
    await testSellerAmpScraper(options);
    process.exit(0);
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}