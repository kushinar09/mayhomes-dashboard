import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bitrix24Service } from '../bitrix24/bitrix24.service';
import { FacebookService } from '../facebook/facebook.service';
import { Bitrix24Lead } from '../bitrix24/interfaces/bitrix24-lead.interface';
import { FacebookInsightData } from '../facebook/facebook.service';

export interface CampaignReportRow {
  Project?: string;
  Campaign?: string;
  'Số Leads'?: number;
  'CHỐT DEAL THÀNH CÔNG'?: number;
  'KHÔNG QUAN TÂM'?: number;
  'ĐANG QUAN TÂM'?: number;
  'LEAD MỚI'?: number;
  'THẤT BẠI'?: number;
  'ĐANG CHĂM'?: number;
  'ĐÃ GẶP KHÁCH'?: number;
  'Tổng chi phí'?: number;
  'Chi phí trung bình / Lead'?: number;
  [key: string]: unknown;
}

interface ParsedLead {
  project_name: string;
  campaign_name: string;
  status_id: string;
  status_name?: string;
}

interface LeadAggregation {
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

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly useFacebookApi: boolean;

  constructor(
    private readonly bitrix24Service: Bitrix24Service,
    private readonly facebookService: FacebookService,
    private readonly configService: ConfigService,
  ) {
    this.useFacebookApi = !!this.configService.get<string>(
      'FACEBOOK_ACCESS_TOKEN',
    );
  }

  /**
   * Parse source_name từ lead để lấy project và campaign
   * Format: "Project | Campaign"
   */
  private parseSourceName(sourceName: string | undefined): {
    project: string | null;
    campaign: string | null;
  } {
    if (!sourceName) {
      return { project: null, campaign: null };
    }

    const parts = sourceName.split(' | ').map((p) => p.trim());
    return {
      project: parts[0] || null,
      campaign: parts[1] || null,
    };
  }

  /**
   * Lấy tất cả leads từ Bitrix24
   */
  private async getAllLeads(): Promise<Bitrix24Lead[]> {
    const allLeads: Bitrix24Lead[] = [];
    let start = 0;
    const limit = 50;
    const maxIterations = 1000;
    let iterations = 0;

    while (iterations < maxIterations) {
      try {
        const response = await this.bitrix24Service.getLeads({
          start,
          select: [
            'ID',
            'SOURCE_ID',
            'SOURCE_DESCRIPTION',
            'STATUS_ID',
            'STATUS_DESCRIPTION',
          ],
        });

        const leads = response.result || [];
        if (leads.length === 0) break;

        allLeads.push(...leads);
        start += limit;
        iterations++;

        if (!response.next && leads.length < limit) break;
      } catch (error) {
        this.logger.error('Error fetching leads', error);
        break;
      }
    }

    this.logger.log(`Fetched ${allLeads.length} leads from Bitrix24`);
    return allLeads;
  }

  /**
   * Lấy expenses từ Facebook Insights API
   */
  private async getFacebookExpenses(
    dateFrom?: string,
    dateTo?: string,
  ): Promise<Map<string, number>> {
    if (!this.useFacebookApi) {
      return new Map();
    }

    try {
      const insights = await this.facebookService.getCampaignInsights(
        undefined,
        dateFrom,
        dateTo,
      );

      // Aggregate expenses by campaign name
      const expensesMap = new Map<string, number>();
      for (const insight of insights) {
        if (insight.campaign_name && insight.spend) {
          const campaignName = insight.campaign_name.trim();
          const currentSpend = expensesMap.get(campaignName) || 0;
          expensesMap.set(campaignName, currentSpend + (insight.spend || 0));
        }
      }

      this.logger.log(
        `Aggregated expenses for ${expensesMap.size} campaigns from Facebook`,
      );
      return expensesMap;
    } catch (error) {
      this.logger.error('Error fetching Facebook expenses', error);
      return new Map();
    }
  }

  /**
   * Aggregate leads theo project và campaign
   */
  private aggregateLeads(parsedLeads: ParsedLead[]): Map<string, LeadAggregation> {
    const aggMap = new Map<string, LeadAggregation>();

    for (const lead of parsedLeads) {
      const key = `${lead.project_name}|${lead.campaign_name}`;
      const agg = aggMap.get(key) || {
        project_name: lead.project_name,
        campaign_name: lead.campaign_name,
        total_leads: 0,
        converted_count: 0,
        not_interested_count: 0,
        interested_count: 0,
        new_count: 0,
        junk_count: 0,
        in_process_count: 0,
        met_customer_count: 0,
      };

      agg.total_leads++;
      switch (lead.status_id) {
        case 'CONVERTED':
          agg.converted_count++;
          break;
        case 'UC_OHHPZK':
          agg.not_interested_count++;
          break;
        case 'UC_W9N2SA':
          agg.interested_count++;
          break;
        case 'NEW':
          agg.new_count++;
          break;
        case 'JUNK':
          agg.junk_count++;
          break;
        case 'IN_PROCESS':
          agg.in_process_count++;
          break;
        case 'UC_AOIPKI':
          agg.met_customer_count++;
          break;
      }

      aggMap.set(key, agg);
    }

    return aggMap;
  }

  /**
   * Join leads với Facebook expenses
   */
  private joinLeadsWithExpenses(
    leadAggMap: Map<string, LeadAggregation>,
    expensesMap: Map<string, number>,
  ): CampaignReportRow[] {
    const results: CampaignReportRow[] = [];

    for (const agg of leadAggMap.values()) {
      // Tìm expenses từ Facebook bằng campaign name
      // Có thể match exact hoặc partial match
      let expenses = 0;
      const campaignKey = agg.campaign_name.toLowerCase().trim();

      // Try exact match first
      for (const [fbCampaignName, spend] of expensesMap.entries()) {
        const fbKey = fbCampaignName.toLowerCase().trim();
        if (fbKey === campaignKey) {
          expenses = spend;
          break;
        }
        // Try partial match (campaign name contains or is contained)
        if (
          fbKey.includes(campaignKey) ||
          campaignKey.includes(fbKey)
        ) {
          expenses = spend;
          break;
        }
      }

      // Chỉ hiển thị nếu có expenses từ Facebook (nếu đã cấu hình Facebook API)
      if (this.useFacebookApi && expenses === 0) {
        continue;
      }

      results.push({
        Project: agg.project_name,
        Campaign: agg.campaign_name,
        'Số Leads': agg.total_leads,
        'CHỐT DEAL THÀNH CÔNG': agg.converted_count,
        'KHÔNG QUAN TÂM': agg.not_interested_count,
        'ĐANG QUAN TÂM': agg.interested_count,
        'LEAD MỚI': agg.new_count,
        'THẤT BẠI': agg.junk_count,
        'ĐANG CHĂM': agg.in_process_count,
        'ĐÃ GẶP KHÁCH': agg.met_customer_count,
        'Tổng chi phí': expenses,
        'Chi phí trung bình / Lead':
          agg.total_leads > 0 ? Math.round(expenses / agg.total_leads) : 0,
      });
    }

    return results;
  }

  /**
   * Sort data theo column và order
   */
  private sortData(
    data: CampaignReportRow[],
    sortBy?: string,
    sortOrder?: 'ASC' | 'DESC',
  ): CampaignReportRow[] {
    if (!sortBy) return data;

    const order = sortOrder || 'ASC';
    const sorted = [...data].sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];

      // Handle null/undefined
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      // Compare numbers
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return order === 'ASC' ? aValue - bValue : bValue - aValue;
      }

      // Compare strings
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      if (order === 'ASC') {
        return aStr.localeCompare(bStr, 'vi');
      } else {
        return bStr.localeCompare(aStr, 'vi');
      }
    });

    return sorted;
  }

  /**
   * Lấy report chi tiết với lead counts và expenses từ Facebook
   */
  async getCampaignReport(
    sortBy?: string,
    sortOrder?: 'ASC' | 'DESC',
  ): Promise<CampaignReportRow[]> {
    try {
      // Lấy leads từ Bitrix24
      const leads = await this.getAllLeads();

      // Parse leads
      const parsedLeads: ParsedLead[] = [];
      for (const lead of leads) {
        const sourceName =
          lead.SOURCE_DESCRIPTION || (lead.SOURCE_ID as string) || '';
        const { project, campaign } = this.parseSourceName(sourceName);

        if (project && campaign && lead.STATUS_ID) {
          parsedLeads.push({
            project_name: project,
            campaign_name: campaign,
            status_id: lead.STATUS_ID,
            status_name: lead.STATUS_DESCRIPTION,
          });
        }
      }

      // Aggregate leads
      const leadAggMap = this.aggregateLeads(parsedLeads);

      // Lấy expenses từ Facebook Insights API
      const expensesMap = await this.getFacebookExpenses();

      // Join và tính toán
      const results = this.joinLeadsWithExpenses(leadAggMap, expensesMap);

      // Sort data
      return this.sortData(results, sortBy, sortOrder);
    } catch (error) {
      this.logger.error('Error getting campaign report', error);
      throw error;
    }
  }

  /**
   * Lấy report đơn giản với lead counts theo status (không có expenses)
   */
  async getSimpleCampaignReport(
    sortBy?: string,
    sortOrder?: 'ASC' | 'DESC',
  ): Promise<CampaignReportRow[]> {
    try {
      const leads = await this.getAllLeads();

      // Parse leads
      const parsedLeads: ParsedLead[] = [];
      for (const lead of leads) {
        const sourceName =
          lead.SOURCE_DESCRIPTION || (lead.SOURCE_ID as string) || '';
        const { project, campaign } = this.parseSourceName(sourceName);

        if (project && campaign && lead.STATUS_ID) {
          parsedLeads.push({
            project_name: project,
            campaign_name: campaign,
            status_id: lead.STATUS_ID,
            status_name: lead.STATUS_DESCRIPTION,
          });
        }
      }

      // Aggregate by project, campaign, status
      const aggMap = new Map<string, number>();
      for (const lead of parsedLeads) {
        const key = `${lead.project_name}|${lead.campaign_name}|${lead.status_id}`;
        aggMap.set(key, (aggMap.get(key) || 0) + 1);
      }

      // Build results
      const results: CampaignReportRow[] = [];
      for (const [key, count] of aggMap.entries()) {
        const [project, campaign, statusId] = key.split('|');
        const lead = parsedLeads.find(
          (l) =>
            l.project_name === project &&
            l.campaign_name === campaign &&
            l.status_id === statusId,
        );

        results.push({
          Project: project,
          Campaign: campaign,
          status_id: statusId,
          status_name: lead?.status_name,
          lead_count: count,
        });
      }

      return this.sortData(results, sortBy, sortOrder);
    } catch (error) {
      this.logger.error('Error getting simple campaign report', error);
      throw error;
    }
  }
}
