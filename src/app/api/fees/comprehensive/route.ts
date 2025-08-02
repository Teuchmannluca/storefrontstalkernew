import { NextRequest, NextResponse } from 'next/server';
import { SPAPIProductFeesClient } from '@/lib/sp-api-product-fees';

// UK VAT rates and constants
const UK_VAT_RATE = 0.20; // 20% VAT
const DIGITAL_SERVICES_FEE_RATE = 0.02; // 2% digital services fee on item price + shipping
const FBA_FULFILLMENT_BASE_FEE = 2.25; // Base FBA fulfillment fee for standard items

// Fee type constants from SP-API
const AMAZON_FEE_TYPES = {
  REFERRAL_FEE: 'ReferralFee',
  FBA_FULFILLMENT_FEE: 'FBAFulfillmentFee',
  FBA_PICK_PACK_FEE: 'FBAPickAndPackFee',
  FBA_WEIGHT_HANDLING_FEE: 'FBAWeightHandlingFee',
  VARIABLE_CLOSING_FEE: 'VariableClosingFee',
  PER_ITEM_FEE: 'PerItemFee',
  CLOSING_FEE: 'ClosingFee',
  HIGH_VOLUME_LISTING_FEE: 'HighVolumeListingFee'
} as const;

interface ComprehensiveFeesRequest {
  asin: string;
  sellPrice: number;
  costPrice: number;
  weight?: number; // in grams
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
  category?: string;
  fulfillmentMethod?: 'FBA' | 'FBM';
  isVatRegistered?: boolean;
  pricesIncludeVat?: boolean; // New field to specify VAT treatment
}

interface ComprehensiveFeesResponse {
  success: boolean;
  asin: string;
  pricing: {
    sellPrice: number;
    costPrice: number;
    currency: string;
  };
  fees: {
    referralFee: number;
    fbaFees?: {
      fulfillmentFee: number;
      storageFee: number;
      total: number;
    };
    variableClosingFee: number;
    fixedClosingFee: number;
    digitalServicesFee: number;
    otherFees: number;
    totalAmazonFees: number;
    breakdown: {
      type: string;
      amount: number;
      feeAmount: number;
      promotion: number;
      tax: number;
    }[];
  };
  vat: {
    vatOnSale: number;
    vatOnFees: number;
    totalVat: number;
  };
  profitability: {
    grossRevenue: number;
    netRevenue: number; // After Amazon fees
    netRevenueAfterVat: number; // After all VAT
    totalCosts: number;
    grossProfit: number;
    netProfit: number;
    totalProfit?: number; // Same as netProfit, kept for compatibility
    profitMargin: number;
    roi: number;
  };
  breakdown: {
    step: string;
    description: string;
    amount: number;
    runningTotal: number;
  }[];
}

export async function POST(request: NextRequest) {
  try {
    const body: ComprehensiveFeesRequest = await request.json();
    
    const {
      asin,
      sellPrice,
      costPrice,
      fulfillmentMethod = 'FBA',
      isVatRegistered = true,
      pricesIncludeVat = true // Default to VAT-inclusive prices
    } = body;

    if (!asin || !sellPrice || !costPrice) {
      return NextResponse.json(
        { error: 'ASIN, sellPrice, and costPrice are required' },
        { status: 400 }
      );
    }

    // Initialize SP-API client
    const credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      region: process.env.AWS_REGION || 'eu-west-1',
    };
    
    const config = {
      clientId: process.env.AMAZON_ACCESS_KEY_ID!,
      clientSecret: process.env.AMAZON_SECRET_ACCESS_KEY!,
      refreshToken: process.env.AMAZON_REFRESH_TOKEN!,
      marketplaceId: process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P',
      region: 'eu' as const,
    };

    const feesClient = new SPAPIProductFeesClient(credentials, config);

    // Get Amazon fees from SP-API
    const priceToEstimateFees = {
      listingPrice: {
        currencyCode: 'GBP',
        amount: sellPrice
      }
    };

    // Get Amazon fees from SP-API with IsAmazonFulfilled flag
    const isAmazonFulfilled = fulfillmentMethod === 'FBA';
    console.log(`Getting fees for ASIN ${asin}, price: ${sellPrice}, FBA: ${isAmazonFulfilled}`);
    
    const feesEstimate = await feesClient.getMyFeesEstimateForASIN(
      asin,
      priceToEstimateFees,
      config.marketplaceId,
      undefined,
      isAmazonFulfilled
    );

    if (feesEstimate.status !== 'Success' || !feesEstimate.feesEstimate) {
      console.error('Fee estimate failed:', JSON.stringify(feesEstimate, null, 2));
      return NextResponse.json(
        { 
          error: 'Failed to get fees estimate from Amazon SP-API',
          details: feesEstimate.error || 'No fee estimate returned',
          status: feesEstimate.status
        },
        { status: 500 }
      );
    }

// Extract EXACT fees from SP-API response
    let referralFee = 0;
    let fbaFulfillmentFee = 0;
    let variableClosingFee = 0;
    let fixedClosingFee = 0;
    let digitalServicesFee = 0;
    let otherFees = 0;

    const feeDetails = feesEstimate.feesEstimate.feeDetailList || [];
    
    console.log('Raw fee details from SP-API:', JSON.stringify(feeDetails, null, 2));
    
    // Parse all fee types returned by SP-API
    for (const fee of feeDetails) {
      const feeAmount = fee.finalFee.amount;
      console.log(`Processing fee: ${fee.feeType} = ${feeAmount} ${fee.finalFee.currencyCode}`);
      
      switch (fee.feeType) {
        case 'ReferralFee':
          referralFee = feeAmount;
          break;
        case 'FBAFees':
        case 'FulfillmentFees':
        case 'FBAPerUnitFulfillmentFee':
        case 'FBAPerOrderFulfillmentFee':
          fbaFulfillmentFee += feeAmount;
          break;
        case 'VariableClosingFee':
          variableClosingFee = feeAmount;
          break;
        case 'PerItemFee':
        case 'FixedClosingFee':
          fixedClosingFee += feeAmount;
          break;
        default:
          // Capture any other fees including potential digital services fee
          if (fee.feeType.toLowerCase().includes('digital')) {
            digitalServicesFee = feeAmount;
          } else {
            console.log(`Other fee type: ${fee.feeType} = ${feeAmount}`);
            otherFees += feeAmount;
          }
      }
    }

    // Digital Services Tax is 2% of the item price (UK specific)
    // Only calculate if not returned by SP-API
    if (digitalServicesFee === 0) {
      digitalServicesFee = sellPrice * DIGITAL_SERVICES_FEE_RATE;
    }

    // Total Amazon fees (excluding DST which is paid separately)
    const totalAmazonFees = referralFee + fbaFulfillmentFee + variableClosingFee + fixedClosingFee + otherFees;

// VAT Calculations
    let vatOnFees = 0;
    let vatOnSale = 0;
    
    if (isVatRegistered) {
      // VAT on Amazon fees (reclaimable input VAT - this IS a business expense)
      vatOnFees = totalAmazonFees * UK_VAT_RATE;
      
      // VAT on sale (output VAT - NOT a business expense, just collected for HMRC)
      if (pricesIncludeVat) {
        vatOnSale = sellPrice * (UK_VAT_RATE / (1 + UK_VAT_RATE));
      } else {
        vatOnSale = sellPrice * UK_VAT_RATE;
      }
    }

    // Profit calculation - VAT on sale does NOT affect profit
    // PROFIT = SALE PRICE - AMAZON FEES - DIGITAL SERVICES TAX - COST OF GOODS - VAT ON FEES
    const netProfit = sellPrice - totalAmazonFees - digitalServicesFee - costPrice - vatOnFees;
    
    // Alternative calculations for reporting
    const grossRevenue = sellPrice;
    const netRevenue = grossRevenue - totalAmazonFees - digitalServicesFee;
    const profitMargin = (netProfit / sellPrice) * 100;
    const roi = (netProfit / costPrice) * 100;

    // Step-by-step breakdown
    let runningTotal = sellPrice;
    const breakdown = [
      { step: '1', description: 'Sale Price (inc. VAT)', amount: sellPrice, runningTotal },
    ];
    
    runningTotal -= referralFee;
    breakdown.push({ step: '2', description: 'Less: Referral Fee', amount: -referralFee, runningTotal });
    
    if (fbaFulfillmentFee > 0) {
      runningTotal -= fbaFulfillmentFee;
      breakdown.push({ step: String(breakdown.length + 1), description: 'Less: FBA Fulfillment Fee', amount: -fbaFulfillmentFee, runningTotal });
    }
    
    if (variableClosingFee > 0) {
      runningTotal -= variableClosingFee;
      breakdown.push({ step: String(breakdown.length + 1), description: 'Less: Variable Closing Fee', amount: -variableClosingFee, runningTotal });
    }
    
    if (fixedClosingFee > 0) {
      runningTotal -= fixedClosingFee;
      breakdown.push({ step: String(breakdown.length + 1), description: 'Less: Fixed Closing Fee', amount: -fixedClosingFee, runningTotal });
    }
    
    if (otherFees > 0) {
      runningTotal -= otherFees;
      breakdown.push({ step: String(breakdown.length + 1), description: 'Less: Other Amazon Fees', amount: -otherFees, runningTotal });
    }
    
    runningTotal -= digitalServicesFee;
    breakdown.push({ step: String(breakdown.length + 1), description: 'Less: Digital Services Tax (2%)', amount: -digitalServicesFee, runningTotal });
    
    runningTotal -= costPrice;
    breakdown.push({ step: String(breakdown.length + 1), description: 'Less: Cost of Goods', amount: -costPrice, runningTotal });
    
    runningTotal -= vatOnFees;
    breakdown.push({ step: String(breakdown.length + 1), description: 'Less: VAT on Amazon Fees (reclaimable)', amount: -vatOnFees, runningTotal });
    
    breakdown.push({ step: String(breakdown.length + 1), description: 'NET PROFIT', amount: netProfit, runningTotal: netProfit });

    const response: ComprehensiveFeesResponse = {
      success: true,
      asin,
      pricing: {
        sellPrice,
        costPrice,
        currency: 'GBP'
      },
      fees: {
        referralFee,
        fbaFees: fbaFulfillmentFee > 0 ? {
          fulfillmentFee: fbaFulfillmentFee,
          storageFee: 0, // Storage fees are billed separately, not in fee estimates
          total: fbaFulfillmentFee
        } : undefined,
        variableClosingFee,
        fixedClosingFee,
        digitalServicesFee,
        otherFees,
        totalAmazonFees,
        breakdown: feeDetails.map(fee => ({
          type: fee.feeType,
          amount: fee.finalFee.amount,
          feeAmount: fee.feeAmount.amount,
          promotion: fee.feePromotion?.amount || 0,
          tax: fee.taxAmount?.amount || 0
        }))
      },
      vat: {
        vatOnSale,
        vatOnFees,
        totalVat: vatOnSale + vatOnFees
      },
      profitability: {
        grossRevenue,
        netRevenue,
        netRevenueAfterVat: netRevenue - vatOnSale, // For information only
        totalCosts: costPrice + totalAmazonFees + digitalServicesFee + vatOnFees,
        grossProfit: sellPrice - costPrice,
        netProfit,
        totalProfit: netProfit,
        profitMargin: Math.round(profitMargin * 100) / 100,
        roi: Math.round(roi * 100) / 100
      },
      breakdown
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Comprehensive fees calculation error:', error);
    console.error('Error details:', error.message);
    if (error.response) {
      console.error('API response error:', error.response.data);
    }
    return NextResponse.json(
      { 
        error: 'Failed to calculate comprehensive fees',
        message: error.message,
        details: error.response?.data || error.toString()
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Test endpoint with default values
  const testData: ComprehensiveFeesRequest = {
    asin: 'B0006NZ3Y4',
    sellPrice: 15.00,
    costPrice: 3.00,
    weight: 500,
    fulfillmentMethod: 'FBA',
    isVatRegistered: true
  };

  const postRequest = new NextRequest(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testData)
  });

  return POST(postRequest);
}