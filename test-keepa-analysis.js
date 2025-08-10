require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
};

class KeepaAnalyzer {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.keepa.com';
    this.domain = 2; // UK marketplace
  }

  async analyzeProduct(asin) {
    console.log(`\n${colors.bright}${colors.blue}=== Keepa Product Analysis ===${colors.reset}`);
    console.log(`${colors.cyan}ASIN: ${asin}${colors.reset}`);
    console.log(`${colors.cyan}Marketplace: UK (domain: ${this.domain})${colors.reset}\n`);

    try {
      // Fetch comprehensive product data
      const productData = await this.fetchProductData(asin);
      
      if (!productData || !productData.products || productData.products.length === 0) {
        throw new Error('No product data found for this ASIN');
      }

      const product = productData.products[0];
      console.log(`${colors.bright}${colors.green}✓ Product Found:${colors.reset} ${product.title || 'No title available'}\n`);

      // Analyze different aspects
      this.analyzeBasicInfo(product);
      this.analyzeSalesData(product);
      this.analyzeBuyBoxData(product);
      this.analyzePriceHistory(product);
      this.analyzeOffers(product);
      this.analyzeCompetitiveLandscape(product);

      // Token usage
      if (productData.tokensLeft !== undefined) {
        console.log(`\n${colors.yellow}Keepa Tokens Remaining: ${productData.tokensLeft}${colors.reset}`);
      }

    } catch (error) {
      console.error(`${colors.red}Error analyzing product: ${error.message}${colors.reset}`);
      if (error.response) {
        console.error(`API Response: ${JSON.stringify(error.response.data)}`);
      }
    }
  }

  async fetchProductData(asin) {
    const params = {
      key: this.apiKey,
      domain: this.domain,
      asin: asin,
      stats: 180,        // Get statistics for last 180 days
      offers: 100,       // Get up to 100 offers (includes Buy Box data)
      history: 1,        // Include price and sales history
      buybox: 1,         // Get Buy Box seller history
      rating: 1,         // Include rating history
      fbafees: 1,        // Include FBA fees
      rental: 0          // Don't need rental data
    };

    console.log(`${colors.cyan}Fetching data with parameters:${colors.reset}`);
    console.log(`  - Stats period: ${params.stats} days`);
    console.log(`  - Max offers: ${params.offers}`);
    console.log(`  - Include history: Yes`);
    console.log(`  - Include Buy Box: Yes\n`);

    const response = await axios.get(`${this.baseUrl}/product`, { params });
    return response.data;
  }

  analyzeBasicInfo(product) {
    console.log(`${colors.bright}${colors.magenta}=== Basic Product Information ===${colors.reset}`);
    
    console.log(`Brand: ${product.brand || 'Not specified'}`);
    console.log(`Manufacturer: ${product.manufacturer || 'Not specified'}`);
    console.log(`Product Group: ${product.productGroup || 'Not specified'}`);
    console.log(`Part Number: ${product.partNumber || 'Not specified'}`);
    
    if (product.packageDimensions) {
      const dims = product.packageDimensions;
      console.log(`Package Dimensions: ${dims.length}x${dims.width}x${dims.height} cm, ${dims.weight}g`);
    }
    
    if (product.features && product.features.length > 0) {
      console.log(`Features: ${product.features.length} listed`);
    }
    
    console.log();
  }

  analyzeSalesData(product) {
    console.log(`${colors.bright}${colors.green}=== Sales Analysis (180 Days) ===${colors.reset}`);
    
    // Current sales rank
    if (product.salesRanks) {
      const mainRank = Object.values(product.salesRanks)[0];
      const categoryId = Object.keys(product.salesRanks)[0];
      console.log(`Current Sales Rank: #${mainRank} in category ${categoryId}`);
    }

    // Sales rank drops (indicates sales)
    if (product.stats) {
      const stats = product.stats;
      
      // Different time periods for sales rank drops
      const salesDrops = {
        '30 days': stats.salesRankDrops30 || 0,
        '90 days': stats.salesRankDrops90 || 0,
        '180 days': stats.salesRankDrops180 || 0
      };

      console.log('\nSales Rank Drops (Estimated Sales):');
      for (const [period, drops] of Object.entries(salesDrops)) {
        const monthlyAvg = Math.round(drops / (parseInt(period) / 30));
        console.log(`  ${period}: ${drops} drops (~${monthlyAvg} sales/month avg)`);
      }

      // Calculate estimated monthly sales from 90-day average
      const estimatedMonthlySales = Math.round((stats.salesRankDrops90 || 0) / 3);
      console.log(`\n${colors.bright}Estimated Monthly Sales: ${estimatedMonthlySales}${colors.reset}`);

      // Average sales rank
      if (stats.avg30 && stats.avg30[3] !== -1) {
        console.log(`Average Sales Rank (30 days): #${Math.round(stats.avg30[3] / 100)}`);
      }
      if (stats.avg90 && stats.avg90[3] !== -1) {
        console.log(`Average Sales Rank (90 days): #${Math.round(stats.avg90[3] / 100)}`);
      }
      if (stats.avg180 && stats.avg180[3] !== -1) {
        console.log(`Average Sales Rank (180 days): #${Math.round(stats.avg180[3] / 100)}`);
      }
    }
    
    console.log();
  }

  analyzeBuyBoxData(product) {
    console.log(`${colors.bright}${colors.yellow}=== Buy Box Analysis (180 Days) ===${colors.reset}`);
    
    // Current Buy Box owner
    if (product.stats && product.stats.buyBoxSellerId) {
      console.log(`Current Buy Box Seller ID: ${product.stats.buyBoxSellerId}`);
      console.log(`Is FBA: ${product.stats.buyBoxIsFBA ? 'Yes' : 'No'}`);
      
      if (product.stats.buyBoxPrice !== -1) {
        const price = product.stats.buyBoxPrice / 100;
        console.log(`Current Buy Box Price: £${price.toFixed(2)}`);
      }
    }

    // Buy Box statistics over time
    if (product.stats && product.stats.buyBoxStats) {
      console.log('\nBuy Box Win Rates (180 days):');
      
      const buyBoxStats = product.stats.buyBoxStats;
      const sortedSellers = Object.entries(buyBoxStats)
        .sort((a, b) => b[1].percentageWon - a[1].percentageWon);
      
      sortedSellers.forEach(([sellerId, stats]) => {
        const winRate = (stats.percentageWon || 0).toFixed(1);
        const avgPrice = stats.avgPrice !== -1 ? (stats.avgPrice / 100).toFixed(2) : 'N/A';
        const isFBA = stats.isFBA ? 'FBA' : 'FBM';
        
        console.log(`  Seller ${sellerId}: ${winRate}% win rate | Avg Price: £${avgPrice} | ${isFBA}`);
      });
      
      // Calculate Buy Box competition level
      const numCompetitors = Object.keys(buyBoxStats).length;
      const topSellerWinRate = sortedSellers[0] ? sortedSellers[0][1].percentageWon : 0;
      
      console.log(`\nBuy Box Competition:`);
      console.log(`  Total Competitors: ${numCompetitors}`);
      console.log(`  Dominant Seller Win Rate: ${topSellerWinRate.toFixed(1)}%`);
      
      if (topSellerWinRate > 80) {
        console.log(`  ${colors.red}Competition Level: LOW (Dominated by one seller)${colors.reset}`);
      } else if (topSellerWinRate > 50) {
        console.log(`  ${colors.yellow}Competition Level: MEDIUM (One strong competitor)${colors.reset}`);
      } else {
        console.log(`  ${colors.green}Competition Level: HIGH (Multiple active competitors)${colors.reset}`);
      }
    }

    // Buy Box history
    if (product.buyBoxSellerIdHistory && product.buyBoxSellerIdHistory.length > 0) {
      console.log('\nRecent Buy Box Changes:');
      const recentChanges = product.buyBoxSellerIdHistory.slice(-10); // Last 10 changes
      console.log(`  Last ${recentChanges.length} Buy Box ownership changes tracked`);
    }
    
    console.log();
  }

  analyzePriceHistory(product) {
    console.log(`${colors.bright}${colors.cyan}=== Price History Analysis ===${colors.reset}`);
    
    if (product.stats) {
      const stats = product.stats;
      
      // Amazon price statistics
      if (stats.current && stats.current[0] !== -1) {
        console.log(`\nAmazon Pricing:`);
        console.log(`  Current: £${(stats.current[0] / 100).toFixed(2)}`);
        
        if (stats.avg30 && stats.avg30[0] !== -1) {
          console.log(`  30-day Avg: £${(stats.avg30[0] / 100).toFixed(2)}`);
        }
        if (stats.min30 && stats.min30[0] !== -1 && stats.max30 && stats.max30[0] !== -1) {
          console.log(`  30-day Range: £${(stats.min30[0] / 100).toFixed(2)} - £${(stats.max30[0] / 100).toFixed(2)}`);
        }
      }
      
      // Marketplace New price statistics
      if (stats.current && stats.current[1] !== -1) {
        console.log(`\nMarketplace New Pricing:`);
        console.log(`  Current: £${(stats.current[1] / 100).toFixed(2)}`);
        
        if (stats.avg90 && stats.avg90[1] !== -1) {
          console.log(`  90-day Avg: £${(stats.avg90[1] / 100).toFixed(2)}`);
        }
        if (stats.min90 && stats.min90[1] !== -1 && stats.max90 && stats.max90[1] !== -1) {
          console.log(`  90-day Range: £${(stats.min90[1] / 100).toFixed(2)} - £${(stats.max90[1] / 100).toFixed(2)}`);
        }
      }
      
      // Calculate price volatility
      if (stats.min180 && stats.max180 && stats.avg180) {
        const minPrice = stats.min180[1] !== -1 ? stats.min180[1] / 100 : null;
        const maxPrice = stats.max180[1] !== -1 ? stats.max180[1] / 100 : null;
        const avgPrice = stats.avg180[1] !== -1 ? stats.avg180[1] / 100 : null;
        
        if (minPrice && maxPrice && avgPrice) {
          const volatility = ((maxPrice - minPrice) / avgPrice * 100).toFixed(1);
          console.log(`\nPrice Volatility (180 days): ${volatility}%`);
          
          if (volatility < 10) {
            console.log(`  ${colors.green}Stability: HIGH (Very stable pricing)${colors.reset}`);
          } else if (volatility < 25) {
            console.log(`  ${colors.yellow}Stability: MEDIUM (Some price fluctuation)${colors.reset}`);
          } else {
            console.log(`  ${colors.red}Stability: LOW (High price volatility)${colors.reset}`);
          }
        }
      }
    }
    
    console.log();
  }

  analyzeOffers(product) {
    console.log(`${colors.bright}${colors.magenta}=== Current Offers Analysis ===${colors.reset}`);
    
    if (product.offers && product.offers.length > 0) {
      const offers = product.offers;
      
      // Group offers by condition
      const offersByCondition = {};
      offers.forEach(offer => {
        const condition = this.getConditionName(offer.condition);
        if (!offersByCondition[condition]) {
          offersByCondition[condition] = [];
        }
        offersByCondition[condition].push(offer);
      });
      
      console.log(`Total Active Offers: ${offers.length}`);
      
      for (const [condition, conditionOffers] of Object.entries(offersByCondition)) {
        console.log(`\n${condition} Condition (${conditionOffers.length} offers):`);
        
        // Separate FBA and FBM
        const fbaOffers = conditionOffers.filter(o => o.isFBA);
        const fbmOffers = conditionOffers.filter(o => !o.isFBA);
        
        if (fbaOffers.length > 0) {
          const minFBA = Math.min(...fbaOffers.map(o => o.offerPrice || Infinity));
          const maxFBA = Math.max(...fbaOffers.map(o => o.offerPrice || 0));
          console.log(`  FBA: ${fbaOffers.length} offers | Price range: £${(minFBA/100).toFixed(2)} - £${(maxFBA/100).toFixed(2)}`);
        }
        
        if (fbmOffers.length > 0) {
          const minFBM = Math.min(...fbmOffers.map(o => (o.offerPrice + o.shippingFee) || Infinity));
          const maxFBM = Math.max(...fbmOffers.map(o => (o.offerPrice + o.shippingFee) || 0));
          console.log(`  FBM: ${fbmOffers.length} offers | Price range: £${(minFBM/100).toFixed(2)} - £${(maxFBM/100).toFixed(2)} (incl. shipping)`);
        }
      }
      
      // Analyze stock levels if available
      const stockedOffers = offers.filter(o => o.stockLevel > 0);
      if (stockedOffers.length > 0) {
        const totalStock = stockedOffers.reduce((sum, o) => sum + o.stockLevel, 0);
        console.log(`\nTotal Stock Available: ${totalStock} units across ${stockedOffers.length} sellers`);
      }
    } else {
      console.log('No current offers available');
    }
    
    console.log();
  }

  analyzeCompetitiveLandscape(product) {
    console.log(`${colors.bright}${colors.blue}=== Competitive Landscape Summary ===${colors.reset}`);
    
    if (product.stats) {
      // Number of sellers over time
      if (product.stats.offerCountFBA !== undefined || product.stats.offerCountFBM !== undefined) {
        console.log('\nSeller Distribution:');
        
        if (product.stats.offerCountFBA !== undefined) {
          console.log(`  FBA Sellers: ${product.stats.offerCountFBA}`);
        }
        if (product.stats.offerCountFBM !== undefined) {
          console.log(`  FBM Sellers: ${product.stats.offerCountFBM}`);
        }
        
        const totalSellers = (product.stats.offerCountFBA || 0) + (product.stats.offerCountFBM || 0);
        const fbaPercentage = totalSellers > 0 ? ((product.stats.offerCountFBA || 0) / totalSellers * 100).toFixed(1) : 0;
        
        console.log(`  Total Sellers: ${totalSellers}`);
        console.log(`  FBA Dominance: ${fbaPercentage}%`);
      }
      
      // Rating analysis
      if (product.stats.rating !== -1) {
        console.log(`\nProduct Rating: ${(product.stats.rating / 10).toFixed(1)} stars`);
      }
      if (product.stats.reviewCount !== -1) {
        console.log(`Review Count: ${product.stats.reviewCount}`);
        
        // Calculate review velocity if we have historical data
        if (product.stats.reviewCount90 !== undefined && product.stats.reviewCount180 !== undefined) {
          const recentReviews = product.stats.reviewCount - product.stats.reviewCount90;
          const reviewsPerMonth = Math.round(recentReviews / 3);
          console.log(`Review Velocity: ~${reviewsPerMonth} reviews/month`);
        }
      }
      
      // Out of stock percentage
      if (product.stats.outOfStockPercentage30 !== undefined) {
        console.log(`\nStock Availability (30 days):`);
        console.log(`  Out of Stock: ${product.stats.outOfStockPercentage30.toFixed(1)}% of time`);
        
        if (product.stats.outOfStockPercentage30 > 20) {
          console.log(`  ${colors.yellow}⚠ High out-of-stock rate indicates supply issues or high demand${colors.reset}`);
        }
      }
    }
    
    // Market opportunity assessment
    console.log(`\n${colors.bright}Market Opportunity Assessment:${colors.reset}`);
    
    const factors = [];
    let opportunityScore = 0;
    
    // Sales velocity
    if (product.stats && product.stats.salesRankDrops90) {
      const monthlySales = product.stats.salesRankDrops90 / 3;
      if (monthlySales > 30) {
        factors.push(`${colors.green}✓ High sales velocity (${Math.round(monthlySales)} sales/month)${colors.reset}`);
        opportunityScore += 2;
      } else if (monthlySales > 10) {
        factors.push(`${colors.yellow}→ Moderate sales velocity (${Math.round(monthlySales)} sales/month)${colors.reset}`);
        opportunityScore += 1;
      } else {
        factors.push(`${colors.red}✗ Low sales velocity (${Math.round(monthlySales)} sales/month)${colors.reset}`);
      }
    }
    
    // Buy Box competition
    if (product.stats && product.stats.buyBoxStats) {
      const numCompetitors = Object.keys(product.stats.buyBoxStats).length;
      if (numCompetitors <= 3) {
        factors.push(`${colors.green}✓ Low Buy Box competition (${numCompetitors} sellers)${colors.reset}`);
        opportunityScore += 2;
      } else if (numCompetitors <= 10) {
        factors.push(`${colors.yellow}→ Moderate Buy Box competition (${numCompetitors} sellers)${colors.reset}`);
        opportunityScore += 1;
      } else {
        factors.push(`${colors.red}✗ High Buy Box competition (${numCompetitors} sellers)${colors.reset}`);
      }
    }
    
    // Price stability
    if (product.stats && product.stats.min180 && product.stats.max180 && product.stats.avg180) {
      const minPrice = product.stats.min180[1] !== -1 ? product.stats.min180[1] / 100 : null;
      const maxPrice = product.stats.max180[1] !== -1 ? product.stats.max180[1] / 100 : null;
      const avgPrice = product.stats.avg180[1] !== -1 ? product.stats.avg180[1] / 100 : null;
      
      if (minPrice && maxPrice && avgPrice) {
        const volatility = ((maxPrice - minPrice) / avgPrice * 100);
        if (volatility < 15) {
          factors.push(`${colors.green}✓ Stable pricing (${volatility.toFixed(1)}% volatility)${colors.reset}`);
          opportunityScore += 1;
        } else if (volatility < 30) {
          factors.push(`${colors.yellow}→ Moderate price volatility (${volatility.toFixed(1)}%)${colors.reset}`);
        } else {
          factors.push(`${colors.red}✗ High price volatility (${volatility.toFixed(1)}%)${colors.reset}`);
        }
      }
    }
    
    factors.forEach(factor => console.log(`  ${factor}`));
    
    console.log(`\n${colors.bright}Overall Opportunity Score: ${opportunityScore}/5${colors.reset}`);
    if (opportunityScore >= 4) {
      console.log(`${colors.green}★★★★★ Excellent opportunity${colors.reset}`);
    } else if (opportunityScore >= 3) {
      console.log(`${colors.green}★★★★☆ Good opportunity${colors.reset}`);
    } else if (opportunityScore >= 2) {
      console.log(`${colors.yellow}★★★☆☆ Fair opportunity${colors.reset}`);
    } else {
      console.log(`${colors.red}★★☆☆☆ Limited opportunity${colors.reset}`);
    }
    
    console.log();
  }

  getConditionName(condition) {
    const conditions = {
      1: 'New',
      2: 'Used - Like New',
      3: 'Used - Very Good',
      4: 'Used - Good',
      5: 'Used - Acceptable',
      6: 'Collectible - Like New',
      7: 'Collectible - Very Good',
      8: 'Collectible - Good',
      9: 'Collectible - Acceptable',
      10: 'Refurbished',
      11: 'Open Box'
    };
    return conditions[condition] || `Condition ${condition}`;
  }
}

// Main execution
async function main() {
  // Check for API key
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) {
    console.error(`${colors.red}Error: KEEPA_API_KEY not found in environment variables${colors.reset}`);
    console.log('Please add KEEPA_API_KEY to your .env.local file');
    process.exit(1);
  }

  // Get ASIN from command line or use example
  const asin = process.argv[2] || 'B08H95Y452'; // Example ASIN (Echo Dot 4th Gen)
  
  if (process.argv.length < 3) {
    console.log(`${colors.yellow}No ASIN provided, using example ASIN: ${asin}${colors.reset}`);
    console.log(`Usage: node test-keepa-analysis.js <ASIN>`);
  }

  // Validate ASIN format
  if (!/^B[0-9A-Z]{9}$/.test(asin)) {
    console.error(`${colors.red}Invalid ASIN format. ASINs should be 10 characters starting with 'B'${colors.reset}`);
    process.exit(1);
  }

  // Create analyzer and run analysis
  const analyzer = new KeepaAnalyzer(apiKey);
  await analyzer.analyzeProduct(asin);
}

// Run the script
main().catch(error => {
  console.error(`${colors.red}Unexpected error: ${error.message}${colors.reset}`);
  process.exit(1);
});