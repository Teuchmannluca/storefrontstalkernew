// Test SP-API fees for specific ASIN

async function testFeesForASIN() {
  const asin = 'B006ZIYYYE';
  const sellingPrice = 26.00;
  const costPrice = 12.43;
  
  console.log('Testing ASIN:', asin);
  console.log('Selling Price:', `£${sellingPrice.toFixed(2)}`);
  console.log('Cost Price:', `£${costPrice.toFixed(2)}`);
  console.log('-------------------');
  
  try {
    // Call the fees API
    const response = await fetch('http://localhost:3000/api/fees/comprehensive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asin: asin,
        price: sellingPrice
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('\nFees Response:', JSON.stringify(data, null, 2));
    
    if (data.success && data.feesEstimate) {
      const fees = data.feesEstimate;
      const feeDetails = fees.feeDetailList || [];
      
      console.log('\n=== FEE BREAKDOWN ===');
      let totalFees = 0;
      
      feeDetails.forEach(fee => {
        console.log(`${fee.feeType}: £${fee.finalFee.amount.toFixed(2)}`);
        totalFees += fee.finalFee.amount;
      });
      
      console.log('-------------------');
      console.log(`Total Amazon Fees: £${totalFees.toFixed(2)}`);
      
      // Calculate VAT
      const vatRate = 0.20;
      const vatOnSale = sellingPrice / (1 + vatRate) * vatRate;
      const netRevenue = sellingPrice - vatOnSale;
      
      console.log('\n=== VAT CALCULATION ===');
      console.log(`Sale Price (inc VAT): £${sellingPrice.toFixed(2)}`);
      console.log(`VAT (20%): £${vatOnSale.toFixed(2)}`);
      console.log(`Net Revenue (ex VAT): £${netRevenue.toFixed(2)}`);
      
      // Calculate profit
      console.log('\n=== PROFIT CALCULATION ===');
      console.log(`Net Revenue: £${netRevenue.toFixed(2)}`);
      console.log(`Less Cost of Goods: -£${costPrice.toFixed(2)}`);
      console.log(`Less Amazon Fees: -£${totalFees.toFixed(2)}`);
      
      const netProfit = netRevenue - costPrice - totalFees;
      console.log('-------------------');
      console.log(`NET PROFIT: £${netProfit.toFixed(2)}`);
      
      // ROI calculation
      const roi = (netProfit / costPrice) * 100;
      console.log(`ROI: ${roi.toFixed(1)}%`);
      
      // Profit margin
      const profitMargin = (netProfit / netRevenue) * 100;
      console.log(`Profit Margin: ${profitMargin.toFixed(1)}%`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the test
testFeesForASIN();