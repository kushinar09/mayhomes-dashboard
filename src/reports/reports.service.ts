import { Injectable, Logger } from '@nestjs/common';
import { FacebookService, FacebookInsight } from '../facebook/facebook.service';
import { LeadsService } from '../leads/leads.service';
import { Bitrix24Service } from '../bitrix24/bitrix24.service';
import { Bitrix24Lead } from '../bitrix24/interfaces/bitrix24-lead.interface';
import { ProgressUpdate } from './progress.service';

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

export interface LeadCampaignReportRow {
  Project: string;
  Campaign: string;
  'Số Leads': number;
  'CHỐT DEAL THÀNH CÔNG': number;
  'KHÔNG QUAN TÂM': number;
  'ĐANG QUAN TÂM': number;
  'LEAD MỚI': number;
  'THẤT BẠI': number;
  'ĐANG CHĂM': number;
  'ĐÃ GẶP KHÁCH': number;
  'Tổng chi phí': number;
  'Chi phí trung bình / Lead': number;
}

export interface LeadStatusReportRow {
  Project: string;
  Campaign: string;
  'Status ID': string;
  'Status Name': string;
  'Số Leads': number;
}

export interface LeadCampaignReportResult {
  table1: LeadStatusReportRow[]; // Bảng 1: Leads theo status
  table2: LeadCampaignReportRow[]; // Bảng 2: Leads và campaigns với chi phí
  projects: string[];
  campaigns: Array<{ project: string; campaign: string }>;
}

export interface NameSpendSummaryRow {
  Name: string;
  'Tổng tiền': number;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly facebookService: FacebookService,
    private readonly leadsService: LeadsService,
    private readonly bitrix24Service: Bitrix24Service,
  ) {}

  /**
   * Lấy danh sách campaigns từ Facebook và lấy insights cho mỗi campaign
   * Logic: 1 ad account (act_...) gồm nhiều campaigns, mỗi campaign có 1 insight
   */
  async getAdsReport(
    onProgress?: (update: ProgressUpdate) => void,
    requestId?: string,
  ): Promise<AdReportRow[]> {
    try {
      // Lấy tất cả campaigns từ Facebook service cùng với ad account ID mapping
      const campaignsWithAccountMap =
        await this.facebookService.getAllCampaignsWithAccountMap();

      this.logger.log(
        `Total campaigns fetched: ${campaignsWithAccountMap.campaigns.length}`,
      );

      // // Lọc campaigns có tên bắt đầu bằng "Mayhomes"
      // const filteredCampaigns = campaignsWithAccountMap.campaigns.filter(
      //   (campaign) => {
      //     const campaignName = campaign.name || '';
      //     return campaignName.toLowerCase().startsWith('mayhomes');
      //   },
      // );

      // this.logger.log(
      //   `Filtered ${filteredCampaigns.length} campaigns with name starting with "Mayhomes"`,
      // );

      const filteredCampaigns = campaignsWithAccountMap.campaigns;
      // Lấy insights cho các campaigns bằng Batch API
      const campaignIds = filteredCampaigns.map((campaign) => campaign.id);

      // Batch size = 100
      const batchSize = 100;
      const campaignInsightsMap = new Map<string, FacebookInsight[]>();
      const totalBatches = Math.ceil(campaignIds.length / batchSize);

      // Xử lý từng batch
      for (let i = 0; i < campaignIds.length; i += batchSize) {
        const batchCampaignIds = campaignIds.slice(i, i + batchSize);
        const currentBatch = Math.floor(i / batchSize) + 1;

        this.logger.log(
          `Processing batch ${currentBatch}/${totalBatches} (${batchCampaignIds.length} campaigns)`,
        );

        // Emit progress
        if (onProgress) {
          onProgress({
            stage: 'fetching_campaign_insights',
            current: currentBatch,
            total: totalBatches,
            message: `Đang lấy data facebook insights progress ${currentBatch}/${totalBatches}...`,
            percentage: Math.round((currentBatch / totalBatches) * 50), // 0-50% cho fetching insights
            requestId,
          });
        }

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

      // // Chỉ lấy các campaign có insights (có ít nhất một trong Impressions, Spend, hoặc Clicks)
      // const campaignsWithInsights = reportRows.filter(
      //   (r) => r.Impressions || r.Spend || r.Clicks,
      // );

      const campaignsWithInsights = reportRows;

      this.logger.log(
        `Returning ${campaignsWithInsights.length} campaigns with insights (filtered from ${reportRows.length} total campaigns)`,
      );

      return campaignsWithInsights;
    } catch (error) {
      this.logger.error('Error getting ads report', error);
      throw error;
    }
  }

  /**
   * Tạo bảng tổng tiền gộp theo Name
   * Loại bỏ các cột: Campaign ID, Ads ID, Status, Impressions, Clicks
   */
  async getNameSpendSummary(): Promise<NameSpendSummaryRow[]> {
    try {
      const adsReport = await this.getAdsReport();

      // Group by Name và sum Spend
      const nameSpendMap = new Map<string, number>();

      adsReport.forEach((row) => {
        const name = row.Name || '';
        const spend = row.Spend || 0;

        if (name) {
          const currentTotal = nameSpendMap.get(name) || 0;
          nameSpendMap.set(name, currentTotal + spend);
        }
      });

      // Convert map thành array
      const summaryRows: NameSpendSummaryRow[] = Array.from(
        nameSpendMap.entries(),
      ).map(([name, totalSpend]) => ({
        Name: name,
        'Tổng tiền': Math.round(totalSpend * 100) / 100,
      }));

      // Sort theo tổng tiền DESC
      summaryRows.sort((a, b) => b['Tổng tiền'] - a['Tổng tiền']);

      this.logger.log(
        `Generated ${summaryRows.length} name spend summary rows`,
      );

      return summaryRows;
    } catch (error) {
      this.logger.error('Error getting name spend summary', error);
      throw error;
    }
  }

  /**
   * Lấy báo cáo kết hợp leads và campaigns
   * Logic tương tự SQL query: parse source_name từ leads, aggregate theo project và campaign,
   * join với expenses từ campaigns
   */
  async getLeadCampaignReport(
    onProgress?: (update: ProgressUpdate) => void,
    requestId?: string,
  ): Promise<LeadCampaignReportResult> {
    try {
      // Bước 1: Lấy tất cả leads và campaigns song song để tăng tốc độ
      this.logger.log('Fetching all leads and campaigns in parallel...');

      if (onProgress) {
        onProgress({
          stage: 'fetching_source_status_names',
          current: 0,
          total: 1,
          message: 'Đang lấy danh sách source và status names...',
          percentage: 2,
          requestId,
        });
      }

      // Lấy source names và status names để map SOURCE_ID và STATUS_ID
      const [sourceNames, statusNames] = await Promise.all([
        this.bitrix24Service.getLeadSourceNames(),
        this.bitrix24Service.getLeadStatusNames(),
      ]);

      if (onProgress) {
        onProgress({
          stage: 'fetching_leads',
          current: 0,
          total: 1,
          message: 'Đang lấy leads từ Bitrix24...',
          percentage: 5,
          requestId,
        });
      }

      // Lấy leads với tối ưu: tăng batch size và fetch song song nhiều batch
      const leads: Bitrix24Lead[] = [];
      const leadsBatchSize = 100; // Tăng từ 50 lên 100 để giảm số lượng requests
      const maxConcurrentBatches = 10; // Fetch tối đa 10 batch cùng lúc để tránh rate limit

      // Bước 1: Lấy batch đầu tiên để biết total
      if (onProgress) {
        onProgress({
          stage: 'fetching_leads',
          current: 0,
          total: 1,
          message: 'Đang lấy thông tin tổng quan về leads...',
          percentage: 5,
          requestId,
        });
      }

      const firstResponse = await this.bitrix24Service.getLeads({
        start: 0,
        select: ['ID', 'SOURCE_ID', 'STATUS_ID'],
      });

      const firstBatchLeads = firstResponse.result || [];
      const totalLeads = firstResponse.total || firstBatchLeads.length;

      // Map SOURCE_ID sang SOURCE_NAME và STATUS_ID sang STATUS_NAME cho batch đầu
      const firstBatchMapped = firstBatchLeads.map((lead) => ({
        ...lead,
        SOURCE_NAME:
          sourceNames[lead.SOURCE_ID as string] ||
          lead.SOURCE_NAME ||
          undefined,
        STATUS_NAME:
          statusNames[lead.STATUS_ID] || lead.STATUS_NAME || undefined,
      }));

      leads.push(...firstBatchMapped);

      // Tính toán số batch còn lại cần fetch
      const totalBatches = Math.ceil(totalLeads / leadsBatchSize);
      const remainingBatches = totalBatches - 1; // Trừ batch đầu tiên đã lấy

      if (remainingBatches > 0) {
        // Tạo array các start positions cho các batch còn lại
        const batchStarts: number[] = [];
        for (let i = 1; i < totalBatches; i++) {
          batchStarts.push(i * leadsBatchSize);
        }

        // Fetch các batch song song với concurrency limit
        let completedBatches = 1; // Đã hoàn thành batch đầu tiên

        // Chia thành các nhóm để fetch song song
        for (let i = 0; i < batchStarts.length; i += maxConcurrentBatches) {
          const batchGroup = batchStarts.slice(i, i + maxConcurrentBatches);

          // Fetch nhóm batch này song song
          const batchPromises = batchGroup.map((start) =>
            this.bitrix24Service.getLeads({
              start,
              select: ['ID', 'SOURCE_ID', 'STATUS_ID'],
            }),
          );

          const batchResponses = await Promise.all(batchPromises);

          // Xử lý kết quả từ các batch
          for (const response of batchResponses) {
            const batchLeads = response.result || [];
            completedBatches++;

            // Map SOURCE_ID sang SOURCE_NAME và STATUS_ID sang STATUS_NAME
            const leadsWithMappedNames = batchLeads.map((lead) => ({
              ...lead,
              SOURCE_NAME:
                sourceNames[lead.SOURCE_ID as string] ||
                lead.SOURCE_NAME ||
                undefined,
              STATUS_NAME:
                statusNames[lead.STATUS_ID] || lead.STATUS_NAME || undefined,
            }));

            leads.push(...leadsWithMappedNames);

            // Emit progress cho leads (5-30%)
            if (onProgress) {
              const progressPercent = Math.min(
                5 + Math.round((completedBatches / totalBatches) * 25),
                30,
              );
              onProgress({
                stage: 'fetching_leads',
                current: completedBatches,
                total: totalBatches,
                message: `Đang lấy leads... (${leads.length}/${totalLeads} leads đã lấy)`,
                percentage: progressPercent,
                requestId,
              });
            }
          }
        }
      } else {
        // Nếu chỉ có 1 batch, emit progress
        if (onProgress) {
          onProgress({
            stage: 'fetching_leads',
            current: 1,
            total: 1,
            message: `Đã lấy ${leads.length} leads`,
            percentage: 30,
            requestId,
          });
        }
      }

      this.logger.log(`Fetched total ${leads.length} leads`);

      const allLeads = leads;

      // Lấy campaigns với progress tracking (30-80%)
      if (onProgress) {
        onProgress({
          stage: 'fetching_campaigns',
          current: 0,
          total: 1,
          message: 'Đang lấy campaigns từ Facebook...',
          percentage: 30,
          requestId,
        });
      }

      const facebookCampaigns = await this.getAdsReport((update) => {
        if (onProgress) {
          // Scale progress từ 0-50% thành 30-80%
          const scaledPercentage =
            30 + Math.round((update.percentage / 50) * 50);
          onProgress({
            ...update,
            stage: 'fetching_campaigns',
            percentage: scaledPercentage,
            message: update.message.replace(
              'fetching_campaign_insights',
              'fetching_campaigns',
            ),
            requestId,
          });
        }
      }, requestId);

      this.logger.log(`Fetched ${facebookCampaigns.length} campaigns`);
      this.logger.log(
        `Total leads fetched: ${allLeads.length}, Leads with SOURCE_NAME: ${allLeads.filter((lead) => lead.SOURCE_NAME).length}`,
      );

      if (onProgress) {
        onProgress({
          stage: 'processing_data',
          current: 0,
          total: 1,
          message: 'Đang xử lý và phân tích dữ liệu...',
          percentage: 80,
          requestId,
        });
      }

      // Bước 2: Parse source_name và aggregate leads
      // Parse: split by ' | ', phần 1 là project_name, phần 2 là campaign_name
      interface LeadParsed {
        project_name: string;
        campaign_name: string;
        status_id: string;
        status_name?: string;
      }

      // Debug: Log một số SOURCE_NAME mẫu để kiểm tra format (commented out)
      // const sampleSourceNames = allLeads
      //   .filter((lead) => lead.SOURCE_NAME)
      //   .slice(0, 10)
      //   .map((lead) => String(lead.SOURCE_NAME));
      // this.logger.log(
      //   `Sample SOURCE_NAME values (first 10): ${JSON.stringify(sampleSourceNames)}`,
      // );

      this.logger.log('List campaign names:');
      const leadParsed: LeadParsed[] = allLeads
        .filter((lead) => lead.SOURCE_NAME)
        .map((lead) => {
          const sourceName = String(lead.SOURCE_NAME || '');
          const parts = sourceName.split('|').map((p) => p.trim());
          if (parts[1]) {
            this.logger.log(parts[1] + ' ' || '');
          }
          return {
            project_name: parts[0] || '',
            campaign_name: parts[1] || '',
            status_id: lead.STATUS_ID,
            status_name: lead.STATUS_NAME,
          };
        })
        .filter((lp) => lp.project_name && lp.campaign_name);

      this.logger.log(
        `After parsing: ${leadParsed.length} leads have valid project_name and campaign_name (from ${allLeads.filter((lead) => lead.SOURCE_NAME).length} leads with SOURCE_NAME)`,
      );

      // Aggregate leads theo project_name và campaign_name
      interface LeadAgg {
        project_name: string;
        campaign_name: string;
        total_leads: number;
        converted_count: number;
        not_interested_count: number;
        interested_count: number;
        new_count: number;
        junk_count: number;
        in_process_count: number;
        met_customer_count: number;
      }

      const leadAggMap = new Map<string, LeadAgg>();

      leadParsed.forEach((lp) => {
        const key = `${lp.project_name}|${lp.campaign_name}`;
        let agg = leadAggMap.get(key);

        if (!agg) {
          agg = {
            project_name: lp.project_name,
            campaign_name: lp.campaign_name,
            total_leads: 0,
            converted_count: 0,
            not_interested_count: 0,
            interested_count: 0,
            new_count: 0,
            junk_count: 0,
            in_process_count: 0,
            met_customer_count: 0,
          };
          leadAggMap.set(key, agg);
        }

        agg.total_leads++;
        if (lp.status_id === 'CONVERTED') agg.converted_count++;
        else if (lp.status_id === 'UC_OHHPZK') agg.not_interested_count++;
        else if (lp.status_id === 'UC_W9N2SA') agg.interested_count++;
        else if (lp.status_id === 'NEW') agg.new_count++;
        else if (lp.status_id === 'JUNK') agg.junk_count++;
        else if (lp.status_id === 'IN_PROCESS') agg.in_process_count++;
        else if (lp.status_id === 'UC_AOIPKI') agg.met_customer_count++;
      });

      const leadAgg = Array.from(leadAggMap.values());
      this.logger.log(
        `Aggregated ${leadAgg.length} unique project-campaign combinations`,
      );

      // Bước 3: Parse campaign name từ campaigns đã lấy
      // Parse campaign name: split by ' - ', lấy phần thứ 2
      interface TrackingParsed {
        campaign_name_clean: string;
        total_expenses: number;
      }

      const trackingMap = new Map<string, number>();

      facebookCampaigns.forEach((campaign) => {
        const campaignName = String(campaign.Name || '');
        // // Filter campaigns có tên bắt đầu bằng "Mayhomes" (case insensitive)
        // if (!campaignName.toLowerCase().startsWith('mayhomes')) {
        //   return;
        // }

        // Parse: split by ' - ', lấy phần thứ 2
        const parts = campaignName.split(' - ').map((p) => p.trim());
        const campaignNameClean = parts[1] || '';

        if (campaignNameClean) {
          const spend = campaign.Spend || 0;
          const existing = trackingMap.get(campaignNameClean) || 0;
          trackingMap.set(campaignNameClean, existing + spend);
        }
      });

      const trackingParsed: TrackingParsed[] = Array.from(
        trackingMap.entries(),
      ).map(([campaign_name_clean, total_expenses]) => ({
        campaign_name_clean,
        total_expenses,
      }));

      this.logger.log(
        `Parsed ${trackingParsed.length} unique campaign expenses`,
      );

      if (onProgress) {
        onProgress({
          stage: 'joining_data',
          current: 0,
          total: 1,
          message: 'Đang kết hợp dữ liệu leads và campaigns...',
          percentage: 90,
          requestId,
        });
      }

      // Bước 4: Join lead_agg với tracking_parsed
      const reportRows: LeadCampaignReportRow[] = [];

      leadAgg.forEach((lead) => {
        const tracking = trackingParsed.find(
          (t) => t.campaign_name_clean === lead.campaign_name,
        );

        // Chỉ thêm vào report nếu có cả lead và tracking data
        if (tracking) {
          const avgCostPerLead =
            lead.total_leads > 0
              ? Math.round(tracking.total_expenses / lead.total_leads)
              : 0;

          reportRows.push({
            Project: lead.project_name,
            Campaign: lead.campaign_name,
            'Số Leads': lead.total_leads,
            'CHỐT DEAL THÀNH CÔNG': lead.converted_count,
            'KHÔNG QUAN TÂM': lead.not_interested_count,
            'ĐANG QUAN TÂM': lead.interested_count,
            'LEAD MỚI': lead.new_count,
            'THẤT BẠI': lead.junk_count,
            'ĐANG CHĂM': lead.in_process_count,
            'ĐÃ GẶP KHÁCH': lead.met_customer_count,
            'Tổng chi phí': Math.round(tracking.total_expenses * 100) / 100,
            'Chi phí trung bình / Lead': avgCostPerLead,
          });
        }
      });

      // Sort theo "Chi phí trung bình / Lead" ASC
      reportRows.sort(
        (a, b) =>
          a['Chi phí trung bình / Lead'] - b['Chi phí trung bình / Lead'],
      );

      // Lấy danh sách unique projects và campaigns
      const uniqueProjects = Array.from(
        new Set(reportRows.map((row) => row.Project)),
      ).sort();

      const campaignsByProject = new Map<string, Set<string>>();
      reportRows.forEach((row) => {
        if (!campaignsByProject.has(row.Project)) {
          campaignsByProject.set(row.Project, new Set());
        }
        campaignsByProject.get(row.Project)?.add(row.Campaign);
      });

      const campaigns: Array<{ project: string; campaign: string }> = [];
      campaignsByProject.forEach((campaignSet, project) => {
        Array.from(campaignSet)
          .sort()
          .forEach((campaign) => {
            campaigns.push({ project, campaign });
          });
      });

      this.logger.log(
        `Generated ${reportRows.length} report rows combining leads and campaigns`,
      );

      if (onProgress) {
        onProgress({
          stage: 'generating_tables',
          current: 0,
          total: 1,
          message: 'Đang tạo bảng báo cáo...',
          percentage: 95,
          requestId,
        });
      }

      // Tạo bảng 1: Leads theo status (không có chi phí)
      const table1Data = this.generateLeadStatusReport(
        leadParsed,
        trackingParsed,
      );

      this.logger.log(
        `Generated table 1: ${table1Data.length} rows, table 2: ${reportRows.length} rows`,
      );

      if (onProgress) {
        onProgress({
          stage: 'completed',
          current: 1,
          total: 1,
          message: 'Hoàn thành!',
          percentage: 100,
          requestId,
        });
      }

      return {
        table1: table1Data,
        table2: reportRows,
        projects: uniqueProjects,
        campaigns,
      };
    } catch (error) {
      this.logger.error('Error getting lead campaign report', error);
      throw error;
    }
  }

  /**
   * Tạo bảng 1: Leads theo status (theo SQL query mẫu)
   * LEFT JOIN tracking_parsed với lead_parsed bằng LIKE (case insensitive)
   * Group by project_name, campaign_name, status_id, status_name
   * Count leads
   */
  private generateLeadStatusReport(
    leadParsed: Array<{
      project_name: string;
      campaign_name: string;
      status_id: string;
      status_name?: string;
    }>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _trackingParsed: Array<{
      campaign_name_clean: string;
      total_expenses: number;
    }>,
  ): LeadStatusReportRow[] {
    // Group leads theo project_name, campaign_name, status_id, status_name
    // LEFT JOIN: tất cả leads đều được thêm vào (không cần check tracking match)
    const leadStatusMap = new Map<string, number>();

    leadParsed.forEach((lead) => {
      // LEFT JOIN: thêm tất cả leads (có hoặc không có tracking match)
      // Theo SQL query, LEFT JOIN không filter leads
      const key = `${lead.project_name}|${lead.campaign_name}|${lead.status_id}|${lead.status_name || ''}`;
      const currentCount = leadStatusMap.get(key) || 0;
      leadStatusMap.set(key, currentCount + 1);
    });

    // Convert map thành array
    const table1Data: LeadStatusReportRow[] = [];
    leadStatusMap.forEach((leadCount, key) => {
      const [project_name, campaign_name, status_id, status_name] =
        key.split('|');
      table1Data.push({
        Project: project_name,
        Campaign: campaign_name,
        'Status ID': status_id,
        'Status Name': status_name || '',
        'Số Leads': leadCount,
      });
    });

    // Sort theo số leads DESC
    table1Data.sort((a, b) => b['Số Leads'] - a['Số Leads']);

    return table1Data;
  }
}
