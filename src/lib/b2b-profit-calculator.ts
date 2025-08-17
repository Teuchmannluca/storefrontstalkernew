/**
 * B2B to B2C Profit Calculator
 * Calculates profit from buying at B2B prices and selling at B2C prices
 */

export interface B2BProfitCalculation {
  ukB2bPrice: number;
  ukB2cPrice: number;
  priceDifference: number;
  discountPercentage: number;
  amazonFees: number;
  referralFee: number;
  fbaFee: number;
  vatAmount: number;
  netRevenue: number;
  netProfit: number;
  roiPercentage: number;
  profitMargin: number;
  profitCategory: 'profitable' | 'breakeven' | 'loss';
}

export interface B2BPriceData {
  b2bPrice: number;
  b2cPrice: number;
  referralFee?: number;
  fbaFee?: number;
  isVatRegistered?: boolean;
}

/**
 * Calculate B2B to B2C arbitrage profit
 * @param data Price data including B2B and B2C prices
 * @returns Detailed profit calculation
 */
export function calculateB2BProfit(data: B2BPriceData): B2BProfitCalculation {
  const { b2bPrice, b2cPrice, referralFee = 0, fbaFee = 0, isVatRegistered = false } = data;

  // IMPORTANT: B2B prices from SP-API are VAT-inclusive
  // We need to extract the VAT-exclusive price for proper calculations
  const b2bPriceExVat = b2bPrice / 1.20; // Remove 20% VAT from B2B price
  const b2bVat = b2bPrice - b2bPriceExVat;

  // For VAT-registered businesses:
  // - They pay the ex-VAT B2B price (can reclaim input VAT)
  // - They collect VAT on B2C sale but pay it to HMRC
  // For non-VAT registered:
  // - They pay the full B2B price (including VAT)
  // - They cannot charge VAT on B2C sale
  
  const effectiveB2bCost = isVatRegistered ? b2bPriceExVat : b2bPrice;

  // Calculate price difference and discount based on ex-VAT prices
  const priceDifference = b2cPrice - effectiveB2bCost;
  const discountPercentage = b2cPrice > 0 ? ((b2cPrice - b2bPrice) / b2cPrice * 100) : 0;

  // Calculate Amazon fees (if not provided, use standard 15% referral + £3 FBA)
  const calculatedReferralFee = referralFee || (b2cPrice * 0.15);
  const calculatedFbaFee = fbaFee || 3.00;
  const totalAmazonFees = calculatedReferralFee + calculatedFbaFee;

  // VAT handling:
  // - VAT registered: No net VAT cost (collect and pay to HMRC)
  // - Non-VAT registered: Cannot charge VAT, so effective selling price is reduced
  const vatOnSale = isVatRegistered ? 0 : (b2cPrice / 1.20 * 0.20); // Extract VAT component from B2C price
  const effectiveSellingPrice = isVatRegistered ? b2cPrice : (b2cPrice / 1.20); // Non-VAT can only keep ex-VAT amount

  // Calculate net revenue and profit
  const netRevenue = effectiveSellingPrice - totalAmazonFees;
  const netProfit = netRevenue - effectiveB2bCost;

  // Calculate ROI and profit margin based on effective cost
  const roiPercentage = effectiveB2bCost > 0 ? ((netProfit / effectiveB2bCost) * 100) : 0;
  const profitMargin = effectiveSellingPrice > 0 ? ((netProfit / effectiveSellingPrice) * 100) : 0;

  // Categorize profit level
  let profitCategory: 'profitable' | 'breakeven' | 'loss';
  if (netProfit > 0.50) {
    profitCategory = 'profitable';
  } else if (netProfit >= -0.50) {
    profitCategory = 'breakeven';
  } else {
    profitCategory = 'loss';
  }

  return {
    ukB2bPrice: b2bPrice, // Keep original VAT-inclusive price for display
    ukB2cPrice: b2cPrice,
    priceDifference,
    discountPercentage,
    amazonFees: totalAmazonFees,
    referralFee: calculatedReferralFee,
    fbaFee: calculatedFbaFee,
    vatAmount: vatOnSale,
    netRevenue,
    netProfit,
    roiPercentage,
    profitMargin,
    profitCategory
  };
}

/**
 * Calculate B2B quantity tier pricing
 * @param basePrice Base B2B price
 * @param tiers Array of quantity tiers with discounts
 * @returns Calculated prices for each tier
 */
export function calculateQuantityTiers(
  basePrice: number,
  tiers: Array<{ quantity: number; discount: number }>
): Array<{ quantity: number; price: number; totalSaving: number }> {
  return tiers.map(tier => {
    const price = basePrice * (1 - tier.discount / 100);
    const totalSaving = (basePrice - price) * tier.quantity;
    return {
      quantity: tier.quantity,
      price: Number(price.toFixed(2)),
      totalSaving: Number(totalSaving.toFixed(2))
    };
  });
}

/**
 * Get profit category color for UI display
 */
export function getB2BProfitCategoryColor(category: string): string {
  switch (category) {
    case 'profitable':
      return 'text-green-600';
    case 'breakeven':
      return 'text-yellow-600';
    case 'loss':
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
}

/**
 * Get profit category background color for UI display
 */
export function getB2BProfitCategoryBgColor(category: string): string {
  switch (category) {
    case 'profitable':
      return 'bg-green-50';
    case 'breakeven':
      return 'bg-yellow-50';
    case 'loss':
      return 'bg-red-50';
    default:
      return 'bg-gray-50';
  }
}

/**
 * Get profit category icon for UI display
 */
export function getB2BProfitCategoryIcon(category: string): string {
  switch (category) {
    case 'profitable':
      return '✓';
    case 'breakeven':
      return '—';
    case 'loss':
      return '✗';
    default:
      return '?';
  }
}

/**
 * Get profit category label for UI display
 */
export function getB2BProfitCategoryLabel(category: string): string {
  switch (category) {
    case 'profitable':
      return 'Profitable';
    case 'breakeven':
      return 'Break-even';
    case 'loss':
      return 'Loss';
    default:
      return 'Unknown';
  }
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency: string = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Extract VAT components from prices
 */
export function extractVATComponents(priceIncVAT: number) {
  const vatRate = 0.20; // UK VAT rate
  const priceExVAT = priceIncVAT / (1 + vatRate);
  const vatAmount = priceIncVAT - priceExVAT;
  
  return {
    priceIncVAT: Number(priceIncVAT.toFixed(2)),
    priceExVAT: Number(priceExVAT.toFixed(2)),
    vatAmount: Number(vatAmount.toFixed(2)),
    vatPercentage: vatRate * 100
  };
}

/**
 * Calculate the actual B2B discount percentage
 * Compares B2B ex-VAT price with B2C price
 */
export function calculateB2BDiscount(b2bPriceIncVAT: number, b2cPrice: number): number {
  const b2bExVAT = b2bPriceIncVAT / 1.20;
  const b2cExVAT = b2cPrice / 1.20;
  const discount = ((b2cExVAT - b2bExVAT) / b2cExVAT) * 100;
  return Number(discount.toFixed(1));
}

/**
 * Calculate break-even B2B price for a given B2C price
 * @param b2cPrice The B2C selling price
 * @param fees Total Amazon fees
 * @param isVatRegistered Whether seller is VAT registered
 * @returns Maximum B2B price to break even
 */
export function calculateBreakEvenB2BPrice(
  b2cPrice: number,
  fees: number,
  isVatRegistered: boolean = false
): number {
  const vatAmount = isVatRegistered ? 0 : (b2cPrice * 0.20);
  const breakEvenPrice = b2cPrice - fees - vatAmount;
  return Number(breakEvenPrice.toFixed(2));
}

/**
 * Calculate minimum B2C price needed for profit
 * @param b2bPrice The B2B purchase price
 * @param targetProfit Desired profit amount
 * @param fees Total Amazon fees
 * @param isVatRegistered Whether seller is VAT registered
 * @returns Minimum B2C price needed
 */
export function calculateMinimumB2CPrice(
  b2bPrice: number,
  targetProfit: number,
  fees: number,
  isVatRegistered: boolean = false
): number {
  // For VAT registered: B2C = B2B + Profit + Fees
  // For non-VAT: B2C = (B2B + Profit + Fees) / 0.8 (to account for 20% VAT)
  const basePrice = b2bPrice + targetProfit + fees;
  const minimumPrice = isVatRegistered ? basePrice : (basePrice / 0.8);
  return Number(minimumPrice.toFixed(2));
}