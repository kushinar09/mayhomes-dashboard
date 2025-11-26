import { Injectable, Logger } from '@nestjs/common';
import { FacebookService, FacebookInsight } from '../facebook/facebook.service';

export interface AdReportRow {
  'Campaign ID'?: string;
  'Ads ID'?: string;
  Name?: string;
  Status?: string;
  'Created Time'?: string;
  'Updated Time'?: string;
  'Date Start'?: string;
  'Date Stop'?: string;
  Impressions?: number;
  Spend?: number;
  Clicks?: number;
  [key: string]: unknown;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly facebookService: FacebookService) {}

  /**
   * Lấy danh sách campaigns từ Facebook và lấy insights cho mỗi campaign
   * Logic: 1 ad account (act_...) gồm nhiều campaigns, mỗi campaign có 1 insight
   */
  async getAdsReport(): Promise<AdReportRow[]> {
    try {
      // Lấy tất cả campaigns từ Facebook service cùng với ad account ID mapping
      const campaignsWithAccountMap =
        await this.facebookService.getAllCampaignsWithAccountMap();

      this.logger.log(
        `Total campaigns fetched: ${campaignsWithAccountMap.campaigns.length}`,
      );

      // Lọc campaigns có tên bắt đầu bằng "Mayhomes"
      const filteredCampaigns = campaignsWithAccountMap.campaigns.filter(
        (campaign) => {
          const campaignName = campaign.name || '';
          return campaignName.toLowerCase().startsWith('mayhomes');
        },
      );

      this.logger.log(
        `Filtered ${filteredCampaigns.length} campaigns with name starting with "Mayhomes"`,
      );

      // Lấy insights cho các campaigns bằng Batch API
      const campaignIds = filteredCampaigns.map((campaign) => campaign.id);

      // Batch size = 50 (giới hạn của Facebook Batch API)
      const batchSize = 50;
      const campaignInsightsMap = new Map<string, FacebookInsight[]>();

      // Xử lý từng batch
      for (let i = 0; i < campaignIds.length; i += batchSize) {
        const batchCampaignIds = campaignIds.slice(i, i + batchSize);

        this.logger.log(
          `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(campaignIds.length / batchSize)} (${batchCampaignIds.length} campaigns)`,
        );

        try {
          // Sử dụng Batch API để lấy insights cho nhiều campaigns cùng lúc
          const insightsMapResult =
            await this.facebookService.batchCampaignInsights(batchCampaignIds);

          // Map insights về campaign IDs
          insightsMapResult.forEach((insights, campaignId) => {
            campaignInsightsMap.set(campaignId, insights);
          });
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Failed to fetch batch insights for campaigns: ${errorMessage}`,
          );
          // Nếu batch fail, thêm empty insights cho các campaigns trong batch
          batchCampaignIds.forEach((campaignId) => {
            if (!campaignInsightsMap.has(campaignId)) {
              campaignInsightsMap.set(campaignId, []);
            }
          });
        }
      }

      // Tạo report rows cho từng campaign
      const reportRows: AdReportRow[] = filteredCampaigns.map((campaign) => {
        const insights = campaignInsightsMap.get(campaign.id) || [];

        // Mỗi campaign có 1 insight (lấy insight đầu tiên nếu có nhiều)
        const campaignInsight = insights.length > 0 ? insights[0] : null;

        // Tính tổng từ insight (nếu có)
        const totalSpend = campaignInsight
          ? parseFloat(String(campaignInsight.spend || '0')) || 0
          : 0;

        const totalImpressions = campaignInsight
          ? parseInt(String(campaignInsight.impressions || '0'), 10) || 0
          : 0;

        const totalClicks = campaignInsight
          ? parseInt(String(campaignInsight.clicks || '0'), 10) || 0
          : 0;

        // Lấy ad account ID cho campaign này
        const adAccountId =
          campaignsWithAccountMap.adAccountMap.get(campaign.id) || '';

        // Ads ID chỉ là ad account ID (act_...)
        const adsId = adAccountId || undefined;

        return {
          'Campaign ID': campaign.id,
          'Ads ID': adsId,
          Name: campaign.name || '',
          Status: campaign.status,
          'Created Time': campaign.created_time,
          'Updated Time': campaign.updated_time,
          'Date Start': campaignInsight?.date_start,
          'Date Stop': campaignInsight?.date_stop,
          Impressions: totalImpressions,
          Spend: totalSpend,
          Clicks: totalClicks,
        } as AdReportRow;
      });

      this.logger.log(
        `Returning ${reportRows.length} campaigns (including ${reportRows.filter((r) => !r.Impressions && !r.Spend && !r.Clicks).length} without insights)`,
      );

      return reportRows;
    } catch (error) {
      this.logger.error('Error getting ads report', error);
      throw error;
    }
  }
}
