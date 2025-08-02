// Exchange rate service
// You can replace this with a real API like exchangerate-api.com or fixer.io

interface ExchangeRates {
  EUR_TO_GBP: number;
  lastUpdated: Date;
}

class ExchangeRateService {
  private rates: ExchangeRates = {
    EUR_TO_GBP: 0.86, // Default fallback rate
    lastUpdated: new Date()
  };
  
  private cacheTimeout = 3600000; // 1 hour in milliseconds
  
  async getEURtoGBP(): Promise<number> {
    // Check if cache is still valid
    const now = new Date();
    const cacheAge = now.getTime() - this.rates.lastUpdated.getTime();
    
    if (cacheAge < this.cacheTimeout) {
      return this.rates.EUR_TO_GBP;
    }
    
    try {
      // You can implement a real API call here
      // Example with exchangerate-api.com (requires API key):
      /*
      const response = await fetch('https://v6.exchangerate-api.com/v6/YOUR_API_KEY/pair/EUR/GBP');
      const data = await response.json();
      
      if (data.result === 'success') {
        this.rates = {
          EUR_TO_GBP: data.conversion_rate,
          lastUpdated: new Date()
        };
        return data.conversion_rate;
      }
      */
      
      // For now, return a realistic rate
      // You should update this periodically or use a real API
      const currentRates: { [key: string]: number } = {
        '2024-01': 0.86,
        '2024-02': 0.85,
        '2024-03': 0.86,
        // Add more as needed
      };
      
      const month = now.toISOString().substring(0, 7);
      this.rates.EUR_TO_GBP = currentRates[month] || 0.86;
      this.rates.lastUpdated = now;
      
      return this.rates.EUR_TO_GBP;
    } catch (error) {
      console.error('Failed to fetch exchange rate:', error);
      return this.rates.EUR_TO_GBP; // Return cached/default rate on error
    }
  }
  
  convertEURtoGBP(amountEUR: number): number {
    return amountEUR * this.rates.EUR_TO_GBP;
  }
}

export const exchangeRateService = new ExchangeRateService();

// Export helper function for backward compatibility
export function convertToGBP(amount: number, fromCurrency: string): number {
  if (fromCurrency === 'GBP') {
    return amount;
  }
  if (fromCurrency === 'EUR') {
    return exchangeRateService.convertEURtoGBP(amount);
  }
  // Add more currencies as needed
  throw new Error(`Unsupported currency: ${fromCurrency}`);
}