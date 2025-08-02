const axios = require('axios');

async function testASINChecker() {
  try {
    console.log('Testing ASIN Checker with B001M9IUH8...');
    
    // First, get a session token (you might need to update this)
    // For testing, we'll simulate the request structure
    
    const testData = {
      asins: ['B001M9IUH8'] // The ASIN you want to test
    };

    console.log('Request data:', JSON.stringify(testData, null, 2));
    
    // Note: This endpoint requires authentication
    // You would need to include a valid Bearer token
    const response = await axios.post('http://localhost:3000/api/arbitrage/analyze-asins', testData, {
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': 'Bearer YOUR_TOKEN_HERE'
      },
      responseType: 'stream'
    });

    console.log('\nStreaming response:');
    
    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const message = JSON.parse(line.slice(6));
            console.log(`[${message.type}]`, message.data);
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    });

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// Test directly with comprehensive fees endpoint instead
async function testComprehensiveFees() {
  try {
    console.log('\nTesting comprehensive fees for B001M9IUH8...');
    
    const response = await axios.post('http://localhost:3000/api/fees/comprehensive', {
      asin: 'B001M9IUH8',
      sellPrice: 40.00,
      costPrice: 21.05,
      fulfillmentMethod: 'FBA',
      isVatRegistered: true,
      pricesIncludeVat: true
    });

    console.log('\nFee calculation result:');
    console.log('Net Profit:', `£${response.data.profitability.netProfit.toFixed(2)}`);
    console.log('Amazon Fees:', `£${response.data.fees.totalAmazonFees.toFixed(2)}`);
    console.log('VAT on Fees:', `£${response.data.vat.vatOnFees.toFixed(2)}`);
    console.log('ROI:', `${response.data.profitability.roi}%`);

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// Run the comprehensive fees test
testComprehensiveFees();