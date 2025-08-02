import { ArbitrageOpportunity } from '../models/ArbitrageOpportunity';

export interface FeeStructure {
  referralFee: number;
  fbaFee: number;
  variableClosingFee?: number;
  monthlyStorageFee?: number;
}

export interface ArbitrageParameters {
  sourcePrice: number;
  targetPrice: number;
  sourceCurrency: string;
  targetCurrency: string;
  exchangeRate: number;
  fees: FeeStructure;
  digitalServicesTaxRate: number;
  minimumProfitThreshold: number;
}

export class ArbitrageCalculator {
  private static readonly DEFAULT_DST_RATE = 0.02; // 2% Digital Services Tax
  private static readonly DEFAULT_MIN_PROFIT = 0;
  
  static calculate(params: ArbitrageParameters): {
    profitable: boolean;
    profitGBP: number;
    roi: number;
    totalFees: number;
    breakEvenPrice: number;
  } {
    // Convert source price to target currency
    const sourcePriceInTargetCurrency = params.sourceCurrency === params.targetCurrency
      ? params.sourcePrice
      : params.sourcePrice * params.exchangeRate;

    // Calculate total fees
    const baseFees = params.fees.referralFee + params.fees.fbaFee + 
                    (params.fees.variableClosingFee || 0) + 
                    (params.fees.monthlyStorageFee || 0);
    
    const digitalServicesFee = baseFees * params.digitalServicesTaxRate;
    const totalFees = baseFees + digitalServicesFee;

    // Calculate profit
    const profitGBP = params.targetPrice - sourcePriceInTargetCurrency - totalFees;
    const roi = sourcePriceInTargetCurrency > 0 
      ? (profitGBP / sourcePriceInTargetCurrency) * 100 
      : 0;

    // Calculate break-even price
    const breakEvenPrice = sourcePriceInTargetCurrency + totalFees;

    return {
      profitable: profitGBP > params.minimumProfitThreshold,
      profitGBP,
      roi,
      totalFees,
      breakEvenPrice
    };
  }

  static calculateBulkDiscount(
    quantity: number,
    unitPrice: number,
    discountTiers: Array<{ minQuantity: number; discountPercent: number }>
  ): number {
    const applicableTier = discountTiers
      .filter(tier => quantity >= tier.minQuantity)
      .sort((a, b) => b.discountPercent - a.discountPercent)[0];

    if (!applicableTier) return unitPrice;

    return unitPrice * (1 - applicableTier.discountPercent / 100);
  }

  static calculateShippingCost(
    weight: number,
    dimensions: { length: number; width: number; height: number },
    shippingMethod: 'standard' | 'express' | 'priority'
  ): number {
    // Simplified shipping calculation
    const volumetricWeight = (dimensions.length * dimensions.width * dimensions.height) / 5000;
    const chargeableWeight = Math.max(weight, volumetricWeight);

    const rates = {
      standard: 0.5,
      express: 1.2,
      priority: 2.0
    };

    return chargeableWeight * rates[shippingMethod];
  }

  static assessRisk(
    opportunity: ArbitrageOpportunity
  ): 'low' | 'medium' | 'high' {
    const riskFactors = [
      opportunity.roi < 10,
      (opportunity.salesPerMonth || 0) < 10,
      opportunity.ukCompetitors > 50,
      opportunity.profitGBP < 5
    ];

    const riskScore = riskFactors.filter(factor => factor).length;

    if (riskScore >= 3) return 'high';
    if (riskScore >= 1) return 'medium';
    return 'low';
  }

  static calculateOptimalQuantity(
    monthlyDemand: number,
    leadTimeDays: number,
    safetyStockDays: number = 7
  ): number {
    const dailyDemand = monthlyDemand / 30;
    const leadTimeStock = dailyDemand * leadTimeDays;
    const safetyStock = dailyDemand * safetyStockDays;
    
    return Math.ceil(leadTimeStock + safetyStock);
  }

  static projectMonthlyProfit(
    opportunity: ArbitrageOpportunity,
    inventoryTurnover: number = 1
  ): number {
    return opportunity.profitGBP * (opportunity.salesPerMonth || 0) * inventoryTurnover;
  }
}