import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface FacebookInsightData {
  campaign_id: string;
  campaign_name: string;
  date_start: string;
  date_stop: string;
  spend: number;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  [key: string]: unknown;
}


@Injectable()
export class FacebookService {
  private readonly logger = new Logger(FacebookService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly accessToken: string | undefined;
  private readonly adAccountId: string | undefined;
  private readonly apiVersion = 'v21.0';

  constructor(private configService: ConfigService) {
    this.accessToken = this.configService.get<string>('FACEBOOK_ACCESS_TOKEN');
    this.adAccountId = this.configService.get<string>('FACEBOOK_AD_ACCOUNT_ID');

    this.axiosInstance = axios.create({
      baseURL: `https://graph.facebook.com/${this.apiVersion}`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!this.accessToken) {
      this.logger.warn('FACEBOOK_ACCESS_TOKEN is not configured');
    }
  }

  /**
   * Lấy insights data từ Facebook cho tất cả campaigns theo ad account
   * Sử dụng Facebook Insights API: act_<AD_ACCOUNT_ID>/insights
   * Reference: https://developers.facebook.com/docs/marketing-api/insights
   */
  async getCampaignInsights(
    adAccountId?: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<FacebookInsightData[]> {
    if (!this.accessToken) {
      throw new Error('Facebook Access Token is not configured');
    }

    const accountId = adAccountId || this.adAccountId;
    if (!accountId) {
      throw new Error('Facebook Ad Account ID is not configured');
    }

    try {
      const allInsights: FacebookInsightData[] = [];
      let nextUrl: string | undefined;

      do {
        const params: Record<string, string> = {
          access_token: this.accessToken,
          level: 'campaign',
          fields: 'campaign_id,campaign_name,date_start,date_stop,spend,impressions,clicks,ctr,cpc,cpm',
        };

        if (dateFrom) {
          params.time_range = JSON.stringify({
            since: dateFrom,
            until: dateTo || dateFrom,
          });
        }

        const url = nextUrl || `/${accountId}/insights`;
        const response = await this.axiosInstance.get<{
          data: FacebookInsightData[];
          paging?: {
            next?: string;
            previous?: string;
            cursors?: { before?: string; after?: string };
          };
        }>(url, {
          params: nextUrl ? undefined : params,
        });

        const insights = response.data.data || [];
        allInsights.push(...insights);

        // Handle pagination
        nextUrl = response.data.paging?.next;
        if (nextUrl) {
          // Extract URL from full URL string
          const urlObj = new URL(nextUrl);
          nextUrl = urlObj.pathname + urlObj.search;
        }
      } while (nextUrl);

      this.logger.log(`Fetched ${allInsights.length} campaign insights from Facebook`);
      return allInsights;
    } catch (error: unknown) {
      this.logger.error('Error fetching insights from Facebook', error);
      if (axios.isAxiosError(error)) {
        const errorData = error.response?.data as
          | { error?: { message?: string } }
          | undefined;
        const message = errorData?.error?.message || error.message;
        throw new Error(`Failed to fetch insights: ${message}`);
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to fetch insights: ${errorMessage}`);
    }
  }
}

