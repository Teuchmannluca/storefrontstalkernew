// Direct test of SP-API integration
require('dotenv').config({ path: '.env.local' });
const { SPAPIProductFeesClient } = require('./src/lib/sp-api-product-fees');

async function testDirectAPI() {
  console.log('Testing direct SP-API connection...');
  
  const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'eu-west-1',
  };
  
  const config = {
    clientId: process.env.AMAZON_ACCESS_KEY_ID,
    clientSecret: process.env.AMAZON_SECRET_ACCESS_KEY,
    refreshToken: process.env.AMAZON_REFRESH_TOKEN,
    marketplaceId: process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P',
    region: 'eu',
  };

  console.log('Config loaded, marketplace:', config.marketplaceId);

  const feesClient = new SPAPIProductFeesClient(credentials, config);

  try {
    const priceToEstimateFees = {
      listingPrice: {
        currencyCode: 'GBP',
        amount: 15.00
      }
    };

    // Test with a real ASIN
    const asin = 'B0D3WHQYFQ';
    console.log(`\nGetting fees for ASIN ${asin} with FBA fulfillment...`);
    
    const feesEstimate = await feesClient.getMyFeesEstimateForASIN(
      asin,
      priceToEstimateFees,
      config.marketplaceId,
      undefined,
      true // IsAmazonFulfilled = true for FBA
    );

    console.log('\nFull response:', JSON.stringify(feesEstimate, null, 2));

    if (feesEstimate.status === 'Success' && feesEstimate.feesEstimate) {
      console.log('\n=== FEE DETAILS ===');
      const feeDetails = feesEstimate.feesEstimate.feeDetailList || [];
      feeDetails.forEach(fee => {
        console.log(`${fee.feeType}: £${fee.finalFee.amount.toFixed(2)}`);
      });
      
      if (feesEstimate.feesEstimate.totalFeesEstimate) {
        console.log(`\nTotal Fees: £${feesEstimate.feesEstimate.totalFeesEstimate.amount.toFixed(2)}`);
      }
    } else {
      console.log('Error:', feesEstimate.error);
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testDirectAPI();