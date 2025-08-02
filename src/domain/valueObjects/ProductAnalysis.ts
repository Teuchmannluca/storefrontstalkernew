export class ProductAnalysis {
  constructor(
    public readonly asin: string,
    public readonly title: string,
    public readonly currentPrice: number,
    public readonly salesRank: number,
    public readonly category: string,
    public readonly competitorCount: number
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.asin || this.asin.length !== 10) {
      throw new Error('Invalid ASIN format');
    }
    if (this.currentPrice < 0) {
      throw new Error('Price cannot be negative');
    }
    if (this.salesRank < 0) {
      throw new Error('Sales rank cannot be negative');
    }
    if (this.competitorCount < 0) {
      throw new Error('Competitor count cannot be negative');
    }
  }

  isHighDemand(): boolean {
    return this.salesRank > 0 && this.salesRank < 10000;
  }

  isMediumDemand(): boolean {
    return this.salesRank >= 10000 && this.salesRank < 50000;
  }

  isLowDemand(): boolean {
    return this.salesRank >= 50000 || this.salesRank === 0;
  }

  hasHealthyCompetition(): boolean {
    return this.competitorCount >= 3 && this.competitorCount <= 20;
  }

  isMonopolized(): boolean {
    return this.competitorCount < 3;
  }

  isOversaturated(): boolean {
    return this.competitorCount > 20;
  }

  calculatePriceCompetitiveness(averageMarketPrice: number): 'competitive' | 'overpriced' | 'underpriced' {
    const threshold = 0.1; // 10% threshold
    const priceDifference = (this.currentPrice - averageMarketPrice) / averageMarketPrice;

    if (Math.abs(priceDifference) <= threshold) {
      return 'competitive';
    }
    return priceDifference > 0 ? 'overpriced' : 'underpriced';
  }

  estimateMonthlyRevenue(salesPerMonth: number): number {
    return this.currentPrice * salesPerMonth;
  }

  calculateInventoryTurnover(salesPerMonth: number, inventoryLevel: number): number {
    if (inventoryLevel === 0) return 0;
    return (salesPerMonth * 12) / inventoryLevel;
  }

  isEligibleForArbitrage(minPrice: number = 10, maxPrice: number = 500): boolean {
    return this.currentPrice >= minPrice && 
           this.currentPrice <= maxPrice && 
           this.hasHealthyCompetition() && 
           !this.isLowDemand();
  }
}