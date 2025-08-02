// Test script for FBM (Fulfilled by Merchant) fees
// Same ASIN and prices but FBM instead of FBA

const testData = {
  asin: "B0027BC1NO",
  costPrice: 94.59,
  sellPrice: 150.00,
  fulfillmentMethod: "FBM",
  isVatRegistered: true,
  pricesIncludeVat: true
};

// UK VAT rates and constants
const UK_VAT_RATE = 0.20;
const DIGITAL_SERVICES_FEE_RATE = 0.02;

// FBM has lower Amazon fees but you handle fulfillment
const estimatedFees = {
  referralFee: testData.sellPrice * 0.15, // 15% referral fee (same)
  digitalServicesFee: testData.sellPrice * DIGITAL_SERVICES_FEE_RATE, // 2% digital fee
  perItemFee: 0.75, // Amazon per-item fee
  variableClosingFee: 0.00, // Usually lower for FBM
  fulfillmentCost: 4.50, // Your shipping cost to customer
  packagingCost: 1.00 // Your packaging materials
};

const totalAmazonFees = estimatedFees.referralFee + estimatedFees.digitalServicesFee + estimatedFees.perItemFee;
const totalBusinessCosts = totalAmazonFees + estimatedFees.fulfillmentCost + estimatedFees.packagingCost;

// VAT calculations
const vatOnSale = testData.sellPrice / 6;
const vatOnFees = totalBusinessCosts * UK_VAT_RATE;

// Profit calculation
const netProfit = testData.sellPrice - totalBusinessCosts - testData.costPrice - vatOnFees;

console.log("=== FBM (FULFILLED BY MERCHANT) CALCULATION ===");
console.log(`ASIN: ${testData.asin}`);
console.log(`Cost Price: £${testData.costPrice.toFixed(2)}`);
console.log(`Sale Price: £${testData.sellPrice.toFixed(2)}`);
console.log("");
console.log("=== AMAZON FEES (FBM) ===");
console.log(`Referral Fee (15%): £${estimatedFees.referralFee.toFixed(2)}`);
console.log(`Digital Services Fee (2%): £${estimatedFees.digitalServicesFee.toFixed(2)}`);
console.log(`Per Item Fee: £${estimatedFees.perItemFee.toFixed(2)}`);
console.log(`Total Amazon Fees: £${totalAmazonFees.toFixed(2)}`);
console.log("");
console.log("=== ADDITIONAL FBM COSTS ===");
console.log(`Fulfillment Cost: £${estimatedFees.fulfillmentCost.toFixed(2)}`);
console.log(`Packaging Cost: £${estimatedFees.packagingCost.toFixed(2)}`);
console.log(`Total Business Costs: £${totalBusinessCosts.toFixed(2)}`);
console.log("");
console.log("=== PROFIT COMPARISON ===");
console.log(`FBM Net Profit: £${netProfit.toFixed(2)}`);
console.log(`FBM Profit Margin: ${((netProfit / testData.sellPrice) * 100).toFixed(1)}%`);
console.log(`FBM ROI: ${((netProfit / testData.costPrice) * 100).toFixed(1)}%`);
console.log("");

// Comparison
const fbaProfit = 19.29; // From previous calculation
console.log(`FBA vs FBM Profit Difference: £${(netProfit - fbaProfit).toFixed(2)}`);
console.log(netProfit > fbaProfit ? "FBM is more profitable" : "FBA is more profitable");