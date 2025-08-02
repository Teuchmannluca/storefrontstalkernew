// Test script to call live SP-API for ASIN B0027BC1NO
const { SPAPIProductFeesClient } = require('./src/lib/sp-api-product-fees.ts');

async function testLiveAPI() {
  console.log("=== LIVE SP-API TEST FOR B0027BC1NO ===");
  
  // Test data
  const asin = "B0027BC1NO";
  const sellPrice = 150.00;
  const costPrice = 94.59;

  try {
    // Initialize SP-API client with environment variables
    const credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'eu-west-1',
    };
    
    const config = {
      clientId: process.env.AMAZON_ACCESS_KEY_ID,
      clientSecret: process.env.AMAZON_SECRET_ACCESS_KEY,
      refreshToken: process.env.AMAZON_REFRESH_TOKEN,
      marketplaceId: process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P', // UK
      region: 'eu',
    };

    // Validate environment variables
    const missingVars = [];
    if (!credentials.accessKeyId) missingVars.push('AWS_ACCESS_KEY_ID');
    if (!credentials.secretAccessKey) missingVars.push('AWS_SECRET_ACCESS_KEY');
    if (!config.clientId) missingVars.push('AMAZON_ACCESS_KEY_ID');
    if (!config.clientSecret) missingVars.push('AMAZON_SECRET_ACCESS_KEY');
    if (!config.refreshToken) missingVars.push('AMAZON_REFRESH_TOKEN');

    if (missingVars.length > 0) {
      console.error("Missing environment variables:", missingVars);
      console.error("Please set all required environment variables in .env.local");
      process.exit(1);
    }

    console.log("Initializing SP-API client...");
    const feesClient = new SPAPIProductFeesClient(credentials, config);

    // Prepare price data
    const priceToEstimateFees = {
      listingPrice: {
        currencyCode: 'GBP',
        amount: sellPrice
      }
    };

    console.log(`Getting fees estimate for ASIN: ${asin} at £${sellPrice}`);
    
    // Get fees estimate from live SP-API
    const feesEstimate = await feesClient.getMyFeesEstimateForASIN(
      asin,
      priceToEstimateFees,
      config.marketplaceId,
      undefined,
      true // FBA
    );

    if (feesEstimate.status === 'Success' && feesEstimate.feesEstimate) {
      const fees = feesEstimate.feesEstimate;
      const feeDetails = fees.feeDetailList || [];

      console.log("\n=== LIVE SP-API RESPONSE ===");
      console.log("Status:", feesEstimate.status);
      console.log("Estimated at:", fees.timeOfFeesEstimation);

      console.log("\n=== DETAILED FEE BREAKDOWN ===");
      let totalFees = 0;
      feeDetails.forEach(fee => {
        console.log(`${fee.feeType}: £${fee.finalFee.amount.toFixed(2)}`);
        totalFees += fee.finalFee.amount;
      });

      console.log(`Total Amazon Fees: £${totalFees.toFixed(2)}`);

      // Calculate profit
      const digitalServicesFee = sellPrice * 0.02; // 2% of item price
      const totalWithDigital = totalFees + digitalServicesFee;
      const vatOnFees = totalWithDigital * 0.20;
      const netProfit = sellPrice - totalWithDigital - costPrice - vatOnFees;

      console.log("\n=== PROFIT CALCULATION ===");
      console.log(`Cost Price: £${costPrice.toFixed(2)}`);
      console.log(`Sale Price: £${sellPrice.toFixed(2)}`);
      console.log(`Total Amazon Fees: £${totalWithDigital.toFixed(2)}`);
      console.log(`VAT on Fees: £${vatOnFees.toFixed(2)}`);
      console.log(`Net Profit: £${netProfit.toFixed(2)}`);
      console.log(`Profit Margin: ${((netProfit / sellPrice) * 100).toFixed(1)}%`);
      console.log(`ROI: ${((netProfit / costPrice) * 100).toFixed(1)}%`);

      // Additional analysis
      console.log("\n=== ANALYSIS ===");
      if (netProfit > 0) {
        console.log("✅ PROFITABLE OPPORTUNITY");
        if (netProfit > 15) {
          console.log("💰 HIGH PROFIT - Consider purchasing");
        } else if (netProfit > 5) {
          console.log("🔍 MODERATE PROFIT - Evaluate further");
        } else {
          console.log("⚠️  LOW PROFIT - Consider risks");
        }
      } else {
        console.log("❌ NOT PROFITABLE - Skip this opportunity");
      }

    } else {
      console.error("Failed to get fees estimate:", feesEstimate.error);
    }

  } catch (error) {
    console.error("Error calling SP-API:", error.message);
    console.error("Stack trace:", error.stack);
  }
}

// Run the test
console.log("Starting live SP-API test...");
testLiveAPI();