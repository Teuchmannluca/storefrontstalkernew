const axios = require('axios');

async function testComprehensiveFees() {
  try {
    // Test with a real ASIN
    const testData = {
      asin: 'B0027BC1NO', // Test ASIN
      sellPrice: 150.00,
      costPrice: 94.59,
      fulfillmentMethod: 'FBA',
      isVatRegistered: true,
      pricesIncludeVat: true
    };

    console.log('Testing comprehensive fees calculation...');
    console.log('Test data:', JSON.stringify(testData, null, 2));

    const response = await axios.post('http://localhost:3001/api/fees/comprehensive', testData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('\nResponse status:', response.status);
    console.log('\nFull response:', JSON.stringify(response.data, null, 2));

    if (response.data.success) {
      console.log('\n=== FEE BREAKDOWN ===');
      console.log('Referral Fee: £' + response.data.fees.referralFee.toFixed(2));
      if (response.data.fees.fbaFees) {
        console.log('FBA Fulfillment Fee: £' + response.data.fees.fbaFees.fulfillmentFee.toFixed(2));
      }
      console.log('Variable Closing Fee: £' + response.data.fees.variableClosingFee.toFixed(2));
      console.log('Fixed Closing Fee: £' + response.data.fees.fixedClosingFee.toFixed(2));
      console.log('Digital Services Tax: £' + response.data.fees.digitalServicesFee.toFixed(2));
      console.log('Other Fees: £' + response.data.fees.otherFees.toFixed(2));
      console.log('Total Amazon Fees: £' + response.data.fees.totalAmazonFees.toFixed(2));
      
      console.log('\n=== VAT BREAKDOWN ===');
      console.log('VAT on Sale: £' + response.data.vat.vatOnSale.toFixed(2));
      console.log('VAT on Fees: £' + response.data.vat.vatOnFees.toFixed(2));
      
      console.log('\n=== PROFITABILITY ===');
      console.log('Net Profit: £' + response.data.profitability.netProfit.toFixed(2));
      console.log('Profit Margin: ' + response.data.profitability.profitMargin.toFixed(2) + '%');
      console.log('ROI: ' + response.data.profitability.roi.toFixed(2) + '%');
      
      console.log('\n=== DETAILED FEE BREAKDOWN ===');
      if (response.data.fees.breakdown) {
        response.data.fees.breakdown.forEach(fee => {
          console.log(`${fee.type}: £${fee.amount.toFixed(2)} (Fee: £${fee.feeAmount.toFixed(2)}, Promo: £${fee.promotion.toFixed(2)}, Tax: £${fee.tax.toFixed(2)})`);
        });
      }
    }

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Full error response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the test
testComprehensiveFees();