import { NextRequest, NextResponse } from 'next/server';
import { SPAPIProductFeesClient } from '@/lib/sp-api-product-fees';

// UK VAT rates and constants
const UK_VAT_RATE = 0.20; // 20% VAT
const DIGITAL_SERVICES_FEE_RATE = 0.02; // 2% digital services fee
const FBA_FULFILLMENT_BASE_FEE = 2.25; // Base FBA fulfillment fee for standard items

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
    digitalServicesFee: number;
    totalAmazonFees: number;
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
      weight = 500, // Default 500g
      fulfillmentMethod = 'FBA',
      isVatRegistered = true
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

    // First try without FBA parameter to get basic fees
    let feesEstimate = await feesClient.getMyFeesEstimateForASIN(
      asin,
      priceToEstimateFees,
      config.marketplaceId
    );

    // If that fails, or if we specifically want FBA fees, try with FBA parameter
    if (fulfillmentMethod === 'FBA' && feesEstimate.status === 'Success') {
      try {
        const fbaFeesEstimate = await feesClient.getMyFeesEstimateForASIN(
          asin,
          priceToEstimateFees,
          config.marketplaceId,
          undefined,
          'FBA_CORE'
        );
        if (fbaFeesEstimate.status === 'Success') {
          feesEstimate = fbaFeesEstimate;
        }
      } catch (fbaError) {
        console.log('FBA fees not available for this ASIN, using standard fees');
      }
    }

    if (feesEstimate.status !== 'Success' || !feesEstimate.feesEstimate) {
      return NextResponse.json(
        { error: 'Failed to get fees estimate from Amazon SP-API' },
        { status: 500 }
      );
    }

    // Extract fees from SP-API response
    let referralFee = 0;
    let fbaFulfillmentFee = 0;
    let variableClosingFee = 0;
    let perItemFee = 0;

    const feeDetails = feesEstimate.feesEstimate.feeDetailList || [];
    
    for (const fee of feeDetails) {
      switch (fee.feeType) {
        case 'ReferralFee':
          referralFee = fee.finalFee.amount;
          break;
        case 'FBAFulfillmentFee':
        case 'FBAPickAndPackFee':
        case 'FBAWeightHandlingFee':
          fbaFulfillmentFee += fee.finalFee.amount;
          break;
        case 'VariableClosingFee':
          variableClosingFee = fee.finalFee.amount;
          break;
        case 'PerItemFee':
          perItemFee = fee.finalFee.amount;
          break;
      }
    }

    // Calculate additional fees not always included in SP-API
    const digitalServicesFee = sellPrice * DIGITAL_SERVICES_FEE_RATE;
    
    // Calculate FBA storage fee (estimated monthly based on item size/weight)
    const estimatedMonthlyStorageFee = fulfillmentMethod === 'FBA' ? 
      Math.max(0.1, (weight / 1000) * 0.75) : 0; // £0.75 per kg per month

    // Total Amazon fees
    const totalAmazonFees = referralFee + fbaFulfillmentFee + variableClosingFee + 
                           perItemFee + digitalServicesFee + estimatedMonthlyStorageFee;

    // VAT Calculations
    let vatOnSale = 0;
    let vatOnFees = 0;
    
    if (isVatRegistered) {
      // VAT on the sale (seller collects this, but it reduces net revenue)
      vatOnSale = sellPrice * UK_VAT_RATE;
      
      // VAT on Amazon fees (seller pays this on top of fees)
      vatOnFees = totalAmazonFees * UK_VAT_RATE;
    }

    const totalVat = vatOnSale + vatOnFees;

    // Profitability calculations
    const grossRevenue = sellPrice;
    const netRevenue = grossRevenue - totalAmazonFees;
    const netRevenueAfterVat = netRevenue - vatOnSale;
    const totalCosts = costPrice + vatOnFees;
    const grossProfit = netRevenue - costPrice;
    const netProfit = netRevenueAfterVat - totalCosts;
    const profitMargin = (netProfit / grossRevenue) * 100;
    const roi = (netProfit / (costPrice + vatOnFees)) * 100;

    // Step-by-step breakdown
    const breakdown = [
      { step: '1', description: 'Gross Sale Price', amount: sellPrice, runningTotal: sellPrice },
      { step: '2', description: 'Less: Referral Fee', amount: -referralFee, runningTotal: sellPrice - referralFee },
      { step: '3', description: 'Less: FBA Fulfillment Fee', amount: -fbaFulfillmentFee, runningTotal: sellPrice - referralFee - fbaFulfillmentFee },
      { step: '4', description: 'Less: Variable Closing Fee', amount: -variableClosingFee, runningTotal: sellPrice - referralFee - fbaFulfillmentFee - variableClosingFee },
      { step: '5', description: 'Less: Digital Services Fee (2%)', amount: -digitalServicesFee, runningTotal: sellPrice - referralFee - fbaFulfillmentFee - variableClosingFee - digitalServicesFee },
      { step: '6', description: 'Less: FBA Storage Fee (est.)', amount: -estimatedMonthlyStorageFee, runningTotal: netRevenue },
      { step: '7', description: 'Less: VAT on Sale (20%)', amount: -vatOnSale, runningTotal: netRevenueAfterVat },
      { step: '8', description: 'Less: Cost of Goods', amount: -costPrice, runningTotal: netRevenueAfterVat - costPrice },
      { step: '9', description: 'Less: VAT on Fees (20%)', amount: -vatOnFees, runningTotal: netProfit },
    ];

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
        fbaFees: fulfillmentMethod === 'FBA' ? {
          fulfillmentFee: fbaFulfillmentFee,
          storageFee: estimatedMonthlyStorageFee,
          total: fbaFulfillmentFee + estimatedMonthlyStorageFee
        } : undefined,
        digitalServicesFee,
        totalAmazonFees
      },
      vat: {
        vatOnSale,
        vatOnFees,
        totalVat
      },
      profitability: {
        grossRevenue,
        netRevenue,
        netRevenueAfterVat,
        totalCosts,
        grossProfit,
        netProfit,
        profitMargin: Math.round(profitMargin * 100) / 100,
        roi: Math.round(roi * 100) / 100
      },
      breakdown
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Comprehensive fees calculation error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate comprehensive fees' },
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