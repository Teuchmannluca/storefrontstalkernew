// Test script to calculate fees for ASIN B0027BC1NO
// Cost: £94.59, Sale Price: £150.00

const testData = {
  asin: "B0027BC1NO",
  costPrice: 94.59,
  sellPrice: 150.00,
  fulfillmentMethod: "FBA",
  isVatRegistered: true,
  pricesIncludeVat: true
};

// UK VAT rates and constants
const UK_VAT_RATE = 0.20;
const DIGITAL_SERVICES_FEE_RATE = 0.02;

// Estimated fees based on typical Amazon UK rates for this price range
const estimatedFees = {
  referralFee: testData.sellPrice * 0.15, // 15% referral fee
  fbaFulfillmentFee: 3.35, // Standard FBA fee for medium item
  digitalServicesFee: testData.sellPrice * DIGITAL_SERVICES_FEE_RATE,
  variableClosingFee: 0.00, // Not applicable for most categories
  perItemFee: 0.75, // Amazon per-item fee
  storageFee: 0.50 // Estimated monthly storage
};

// Calculate total Amazon fees
const totalAmazonFees = Object.values(estimatedFees).reduce((sum, fee) => sum + fee, 0);

// VAT calculations
const vatOnSale = testData.sellPrice / 6; // VAT extracted from VAT-inclusive price
const vatOnFees = totalAmazonFees * UK_VAT_RATE;

// Profit calculation
const netProfit = testData.sellPrice - totalAmazonFees - testData.costPrice - vatOnFees;

console.log("=== AMAZON FEE CALCULATION TEST ===");
console.log(`ASIN: ${testData.asin}`);
console.log(`Cost Price: £${testData.costPrice.toFixed(2)}`);
console.log(`Sale Price: £${testData.sellPrice.toFixed(2)}`);
console.log("");
console.log("=== AMAZON FEES BREAKDOWN ===");
console.log(`Referral Fee (15%): £${estimatedFees.referralFee.toFixed(2)}`);
console.log(`FBA Fulfillment Fee: £${estimatedFees.fbaFulfillmentFee.toFixed(2)}`);
console.log(`Digital Services Fee (2%): £${estimatedFees.digitalServicesFee.toFixed(2)}`);
console.log(`Per Item Fee: £${estimatedFees.perItemFee.toFixed(2)}`);
console.log(`Storage Fee: £${estimatedFees.storageFee.toFixed(2)}`);
console.log(`Total Amazon Fees: £${totalAmazonFees.toFixed(2)}`);
console.log("");
console.log("=== VAT CALCULATIONS ===");
console.log(`VAT on Sale (collected): £${vatOnSale.toFixed(2)}`);
console.log(`VAT on Amazon Fees: £${vatOnFees.toFixed(2)}`);
console.log("");
console.log("=== PROFIT ANALYSIS ===");
console.log(`Gross Revenue: £${testData.sellPrice.toFixed(2)}`);
console.log(`Net Revenue (after fees): £${(testData.sellPrice - totalAmazonFees).toFixed(2)}`);
console.log(`Total Costs: £${(testData.costPrice + vatOnFees).toFixed(2)}`);
console.log(`Net Profit: £${netProfit.toFixed(2)}`);
console.log(`Profit Margin: ${((netProfit / testData.sellPrice) * 100).toFixed(1)}%`);
console.log(`ROI: ${((netProfit / testData.costPrice) * 100).toFixed(1)}%`);

// Quick comparison with expected values
console.log("");
console.log("=== QUICK VALIDATION ===");
console.log(`Expected profit range: £25-35 for this price range`);
console.log(`Calculated: £${netProfit.toFixed(2)}`);
console.log(netProfit > 0 ? "✅ PROFITABLE" : "❌ NOT PROFITABLE");