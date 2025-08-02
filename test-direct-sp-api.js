// Direct SP-API test for specific ASIN
import { SPAPIClient } from './src/lib/sp-api-client.js';
import { MARKETPLACES } from './src/lib/marketplaces.js';

async function testDirectSPAPI() {
  const asin = 'B006ZIYYYE';
  const sellingPrice = 26.00;
  const costPrice = 12.43;
  
  console.log('Testing ASIN:', asin);
  console.log('Selling Price:', `£${sellingPrice.toFixed(2)}`);
  console.log('Cost Price:', `£${costPrice.toFixed(2)}`);
  console.log('-------------------');
  
  try {
    const client = new SPAPIClient();
    
    // Get fees estimate
    const feesEstimate = await client.getMyFeesEstimateForASIN(
      asin,
      {
        marketplaceId: MARKETPLACES.UK.id,
        isAmazonFulfilled: true,
        identifier: `test-${asin}-${Date.now()}`,
        priceToEstimateFees: {
          listingPrice: {
            currencyCode: 'GBP',
            amount: sellingPrice
          }
        }
      },
      MARKETPLACES.UK.id
    );
    
    console.log('\nFees Response:', JSON.stringify(feesEstimate, null, 2));
    
    if (feesEstimate.status === 'Success' && feesEstimate.feesEstimate) {
      const fees = feesEstimate.feesEstimate;
      const feeDetails = fees.feeDetailList || [];
      
      console.log('\n=== DETAILED FEE BREAKDOWN ===');
      let referralFee = 0;
      let fbaFee = 0;
      let digitalServicesFee = 0;
      let variableClosingFee = 0;
      let fixedClosingFee = 0;
      let otherFees = 0;
      
      feeDetails.forEach(fee => {
        const amount = fee.finalFee.amount;
        console.log(`${fee.feeType}: £${amount.toFixed(2)}`);
        
        switch (fee.feeType) {
          case 'ReferralFee':
            referralFee = amount;
            break;
          case 'FBAFees':
          case 'FulfillmentFees':
          case 'FBAPerUnitFulfillmentFee':
          case 'FBAPerOrderFulfillmentFee':
            fbaFee += amount;
            break;
          case 'VariableClosingFee':
            variableClosingFee = amount;
            break;
          case 'FixedClosingFee':
            fixedClosingFee = amount;
            break;
          case 'DigitalServicesFee':
          case 'DigitalServiceTax':
          case 'DST':
            digitalServicesFee = amount;
            break;
          default:
            otherFees += amount;
        }
      });
      
      const totalAmazonFees = fees.totalFeesEstimate?.amount || 0;
      console.log('-------------------');
      console.log(`Total Amazon Fees (from API): £${totalAmazonFees.toFixed(2)}`);
      console.log(`Sum of individual fees: £${(referralFee + fbaFee + variableClosingFee + fixedClosingFee + digitalServicesFee + otherFees).toFixed(2)}`);
      
      // VAT calculations
      const vatRate = 0.20;
      const vatOnSale = sellingPrice / (1 + vatRate) * vatRate;
      const netRevenue = sellingPrice - vatOnSale;
      
      console.log('\n=== VAT CALCULATION ===');
      console.log(`Sale Price (inc VAT): £${sellingPrice.toFixed(2)}`);
      console.log(`VAT (20%): £${vatOnSale.toFixed(2)}`);
      console.log(`Net Revenue (ex VAT): £${netRevenue.toFixed(2)}`);
      
      // Profit calculation using the correct formula
      console.log('\n=== PROFIT CALCULATION ===');
      console.log('Formula: Net Profit = Net Revenue - (Cost of Goods + Amazon Fees)');
      console.log(`Net Revenue: £${netRevenue.toFixed(2)}`);
      console.log(`Less Cost of Goods: -£${costPrice.toFixed(2)}`);
      console.log(`Less Amazon Fees: -£${totalAmazonFees.toFixed(2)}`);
      
      const netProfit = netRevenue - costPrice - totalAmazonFees;
      console.log('-------------------');
      console.log(`NET PROFIT (EX-VAT): £${netProfit.toFixed(2)}`);
      
      // ROI and margin calculations
      const roi = (netProfit / costPrice) * 100;
      const profitMargin = (netProfit / netRevenue) * 100;
      
      console.log(`\nROI: ${roi.toFixed(1)}%`);
      console.log(`Profit Margin: ${profitMargin.toFixed(1)}%`);
      
      // Check if profitable
      console.log(`\nProfitable: ${netProfit > 0 ? '✓ YES' : '✗ NO'}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response);
    }
  }
}

// Run the test
testDirectSPAPI();