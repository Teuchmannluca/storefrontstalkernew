// Test the simple Amazon SP-API without STS role assumption
require('dotenv').config({ path: '.env.local' });

const { AmazonSPAPISimple } = require('./src/lib/amazon-sp-api-simple.ts');

async function testSPAPISimple() {
  console.log('🧪 Testing AmazonSPAPISimple (no STS role assumption)...');
  
  try {
    const spApi = new AmazonSPAPISimple({
      clientId: process.env.AMAZON_ACCESS_KEY_ID,
      clientSecret: process.env.AMAZON_SECRET_ACCESS_KEY,
      refreshToken: process.env.AMAZON_REFRESH_TOKEN,
      region: 'eu',
      marketplaceId: process.env.AMAZON_MARKETPLACE_ID
    });

    console.log('📋 Testing with ASIN: B073JYC4XM'); // Echo Dot
    const result = await spApi.getCatalogItem('B073JYC4XM');
    
    if (result) {
      console.log('✅ SP-API call successful!');
      console.log('Product Name:', AmazonSPAPISimple.extractProductName(result));
      console.log('Brand:', AmazonSPAPISimple.extractBrand(result));
      console.log('Image URL:', AmazonSPAPISimple.extractMainImage(result));
    } else {
      console.log('ℹ️ No product found for this ASIN');
    }

  } catch (error) {
    console.error('❌ Error testing SP-API:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testSPAPISimple();