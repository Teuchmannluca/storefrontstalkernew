// Test script using the existing API route
const https = require('https');

async function testLiveAPI() {
  console.log("=== LIVE SP-API TEST FOR B0027BC1NO ===");
  
  // Test data
  const testData = {
    asin: "B0027BC1NO",
    sellPrice: 150.00,
    costPrice: 94.59,
    fulfillmentMethod: "FBA",
    isVatRegistered: true,
    pricesIncludeVat: true
  };

  // Check if dev server is running
  const isDevServerRunning = await checkDevServer();
  
  if (isDevServerRunning) {
    console.log("Development server detected, using localhost:3000");
    await testLocalAPI(testData);
  } else {
    console.log("Development server not running, showing what the API would return:");
    await showExpectedResponse(testData);
  }
}

function checkDevServer() {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/health',
      method: 'GET',
      timeout: 2000
    }, (res) => {
      resolve(res.statusCode === 200);
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => resolve(false));
    req.end();
  });
}

async function testLocalAPI(testData) {
  try {
    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch('http://localhost:3000/api/fees/comprehensive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token' // Mock token for testing
      },
      body: JSON.stringify(testData)
    });

    if (response.ok) {
      const data = await response.json();
      console.log("\n=== LIVE API RESPONSE ===");
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.error("API Error:", response.status, response.statusText);
    }
  } catch (error) {
    console.error("Network Error:", error.message);
  }
}

function showExpectedResponse(testData) {
  console.log("\n=== EXPECTED LIVE SP-API RESPONSE ===");
  console.log("To test with live SP-API, ensure:");
  console.log("1. Development server is running: npm run dev");
  console.log("2. All environment variables are set in .env.local");
  console.log("3. SP-API credentials are valid");
  console.log("");
  console.log("Then run: curl -X POST http://localhost:3000/api/fees/comprehensive \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer your-token' \\\n  -d '{"asin": "B0027BC1NO", "sellPrice": 150.00, "costPrice": 94.59, "fulfillmentMethod": "FBA"}'");
  
  console.log("\n=== TYPICAL RESPONSE STRUCTURE ===");
  const mockResponse = {
    success: true,
    asin: testData.asin,
    pricing: {
      sellPrice: 150.00,
      costPrice: 94.59,
      currency: "GBP"
    },
    fees: {
      referralFee: 22.50,
      fbaFees: {
        fulfillmentFee: 3.35,
        storageFee: 0.50,
        total: 3.85
      },
      digitalServicesFee: 3.00,
      totalAmazonFees: 30.10
    },
    vat: {
      vatOnSale: 25.00,
      vatOnFees: 6.02,
      totalVat: 31.02
    },
    profitability: {
      grossRevenue: 150.00,
      netRevenue: 119.90,
      netRevenueAfterVat: 94.90,
      totalCosts: 100.61,
      grossProfit: 25.31,
      netProfit: 19.29,
      profitMargin: 12.9,
      roi: 20.4
    },
    breakdown: [
      { step: "1", description: "Sale Price", amount: 150.00, runningTotal: 150.00 },
      { step: "2", description: "Less: All Amazon Fees", amount: -30.10, runningTotal: 119.90 },
      { step: "3", description: "Less: Cost of Goods", amount: -94.59, runningTotal: 25.31 },
      { step: "4", description: "Less: VAT on Amazon Fees", amount: -6.02, runningTotal: 19.29 },
      { step: "5", description: "Final Net Profit", amount: 19.29, runningTotal: 19.29 }
    ]
  };
  
  console.log(JSON.stringify(mockResponse, null, 2));
}

// Run the test
testLiveAPI();