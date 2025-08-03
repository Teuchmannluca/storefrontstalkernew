/**
 * Utility functions for categorizing profit levels
 */

export type ProfitCategory = 'profitable' | 'breakeven' | 'loss';

/**
 * Categorizes a profit amount into profitable, break-even, or loss
 * @param profit The profit amount in GBP
 * @returns The profit category
 */
export function categorizeProfitLevel(profit: number): ProfitCategory {
  if (profit > 0.50) {
    return 'profitable';
  } else if (profit >= -0.50 && profit <= 0.50) {
    return 'breakeven';
  } else {
    return 'loss';
  }
}

/**
 * Gets the display color for a profit category
 * @param category The profit category
 * @returns CSS color class
 */
export function getProfitCategoryColor(category: ProfitCategory): string {
  switch (category) {
    case 'profitable':
      return 'text-green-600';
    case 'breakeven':
      return 'text-amber-600';
    case 'loss':
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
}

/**
 * Gets the background color for a profit category
 * @param category The profit category
 * @returns CSS background color class
 */
export function getProfitCategoryBgColor(category: ProfitCategory): string {
  switch (category) {
    case 'profitable':
      return 'bg-green-50 border-green-200';
    case 'breakeven':
      return 'bg-amber-50 border-amber-200';
    case 'loss':
      return 'bg-red-50 border-red-200';
    default:
      return 'bg-gray-50 border-gray-200';
  }
}

/**
 * Gets the badge color for a profit category
 * @param category The profit category
 * @returns CSS badge color classes
 */
export function getProfitCategoryBadgeColor(category: ProfitCategory): string {
  switch (category) {
    case 'profitable':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'breakeven':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'loss':
      return 'bg-red-100 text-red-700 border-red-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

/**
 * Gets the display label for a profit category
 * @param category The profit category
 * @returns Human-readable label
 */
export function getProfitCategoryLabel(category: ProfitCategory): string {
  switch (category) {
    case 'profitable':
      return 'Profitable';
    case 'breakeven':
      return 'Break-Even';
    case 'loss':
      return 'Loss';
    default:
      return 'Unknown';
  }
}

/**
 * Gets an icon for the profit category
 * @param category The profit category
 * @returns Icon representation
 */
export function getProfitCategoryIcon(category: ProfitCategory): string {
  switch (category) {
    case 'profitable':
      return '✅';
    case 'breakeven':
      return '⚖️';
    case 'loss':
      return '❌';
    default:
      return '❓';
  }
}