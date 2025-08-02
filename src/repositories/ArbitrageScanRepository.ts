import { IArbitrageScanRepository } from '@/domain/interfaces/IArbitrageScanRepository';
import { ArbitrageScan, ArbitrageOpportunity } from '@/domain/models/ArbitrageOpportunity';
import { SupabaseClient } from '@supabase/supabase-js';

export class ArbitrageScanRepository implements IArbitrageScanRepository {
  constructor(private supabase: SupabaseClient) {}

  async create(scan: Partial<ArbitrageScan>): Promise<ArbitrageScan> {
    const { data, error } = await this.supabase
      .from('arbitrage_scans')
      .insert({
        user_id: scan.userId,
        status: scan.status,
        storefront_id: scan.storefrontId,
        asins: scan.asins,
        products_scanned: scan.productsScanned || 0,
        opportunities_found: scan.opportunitiesFound || 0,
        metadata: scan.metadata,
        started_at: scan.startedAt?.toISOString()
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return this.mapToArbitrageScan(data);
  }

  async update(id: string, data: Partial<ArbitrageScan>): Promise<void> {
    const updateData: any = {};
    
    if (data.status !== undefined) updateData.status = data.status;
    if (data.productsScanned !== undefined) updateData.products_scanned = data.productsScanned;
    if (data.opportunitiesFound !== undefined) updateData.opportunities_found = data.opportunitiesFound;
    if (data.error !== undefined) updateData.error = data.error;
    if (data.completedAt !== undefined) updateData.completed_at = data.completedAt.toISOString();
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    const { error } = await this.supabase
      .from('arbitrage_scans')
      .update(updateData)
      .eq('id', id);

    if (error) {
      throw error;
    }
  }

  async addOpportunity(scanId: string, opportunity: ArbitrageOpportunity): Promise<void> {
    const { error } = await this.supabase
      .from('arbitrage_opportunities')
      .insert({
        scan_id: scanId,
        asin: opportunity.asin,
        product_title: opportunity.productTitle,
        uk_price: opportunity.ukPrice.toString(),
        uk_competitors: opportunity.ukCompetitors,
        uk_sales_rank: opportunity.ukSalesRank,
        sales_per_month: opportunity.salesPerMonth,
        best_source_marketplace: opportunity.sourceMarketplace,
        best_source_price: opportunity.sourcePrice.toString(),
        best_source_price_gbp: opportunity.sourcePriceGBP.toString(),
        profit_gbp: opportunity.profitGBP.toString(),
        roi: opportunity.roi.toString(),
        amazon_fees: opportunity.totalFees.toString(),
        referral_fee: opportunity.referralFee.toString(),
        digital_services_fee: opportunity.digitalServicesFee.toString(),
        net_profit: opportunity.netProfit.toString(),
        confidence_score: opportunity.confidence,
        created_at: new Date().toISOString()
      });

    if (error) {
      throw error;
    }
  }

  async findById(id: string): Promise<ArbitrageScan | null> {
    const { data, error } = await this.supabase
      .from('arbitrage_scans')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return this.mapToArbitrageScan(data);
  }

  async findByUserId(userId: string, limit: number = 10): Promise<ArbitrageScan[]> {
    const { data, error } = await this.supabase
      .from('arbitrage_scans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data.map(scan => this.mapToArbitrageScan(scan));
  }

  private mapToArbitrageScan(data: any): ArbitrageScan {
    return {
      id: data.id,
      userId: data.user_id,
      status: data.status,
      storefrontId: data.storefront_id,
      asins: data.asins,
      productsScanned: data.products_scanned,
      opportunitiesFound: data.opportunities_found,
      metadata: data.metadata,
      startedAt: new Date(data.started_at),
      completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
      error: data.error
    };
  }
}