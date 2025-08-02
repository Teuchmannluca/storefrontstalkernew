// Sales estimation from Amazon UK BSR (Best Sellers Rank)
// These are rough estimates based on industry data

export function estimateMonthlySalesFromRank(rank: number, category: string = 'default'): number {
  if (!rank || rank <= 0) return 0;
  
  // Rough estimates for Amazon UK main category
  // These formulas are approximations and vary by category
  if (rank <= 100) {
    return Math.floor(10000 / rank);
  } else if (rank <= 1000) {
    return Math.floor(5000 / (rank / 10));
  } else if (rank <= 10000) {
    return Math.floor(2000 / (rank / 100));
  } else if (rank <= 50000) {
    return Math.floor(500 / (rank / 1000));
  } else if (rank <= 100000) {
    return Math.floor(100 / (rank / 5000));
  } else if (rank <= 500000) {
    return Math.floor(50 / (rank / 10000));
  } else {
    return Math.max(1, Math.floor(10 / (rank / 50000)));
  }
}

// Alias for backward compatibility
export const estimateMonthlySales = estimateMonthlySalesFromRank;

export function formatSalesEstimate(sales: number): string {
  if (sales >= 1000) {
    return `${(sales / 1000).toFixed(1)}k`;
  }
  return sales.toString();
}