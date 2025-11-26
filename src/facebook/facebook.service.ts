import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface FacebookAd {
  id: string;
  name: string;
  adset_id?: string;
  campaign_id?: string;
  creative?: unknown;
  status?: string;
  effective_status?: string;
  bid_amount?: string;
  created_time?: string;
  updated_time?: string;
}

export interface FacebookInsight {
  account_id?: string;
  ad_id?: string;
  campaign_id?: string;
  adset_id?: string;
  date_start?: string;
  date_stop?: string;
  impressions?: string;
  spend?: string;
  clicks?: string;
  [key: string]: unknown;
}

export interface FacebookCampaign {
  id: string;
  name: string;
  status?: string;
  created_time?: string;
  updated_time?: string;
  campaign_id?: string;
}

export interface FacebookCampaignWithInsights {
  campaign_id: string;
  campaign_name: string;
  ads: FacebookAd[];
  insights: FacebookInsight[];
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
}

@Injectable()
export class FacebookService {
  private readonly logger = new Logger(FacebookService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly accessToken: string | undefined;
  private readonly appSecretProof: string | undefined;
  private readonly adAccountIds: string[];
  private readonly graphApiBaseUrl: string;
  
  // Request queue để quản lý rate limiting
  private requestQueue: Array<() => Promise<unknown>> = [];
  private isProcessingQueue = false;
  private readonly maxConcurrentRequests = 5; // Giảm số request đồng thời
  private readonly minDelayBetweenRequests = 200; // Tối thiểu 200ms giữa các requests
  private lastRequestTime = 0;

  constructor(private configService: ConfigService) {
    this.accessToken = this.configService.get<string>('FACEBOOK_ACCESS_TOKEN');
    const adAccountIdConfig = this.configService.get<string>(
      'FACEBOOK_AD_ACCOUNT_ID',
    );
    // Parse nhiều ad account IDs từ env (cách nhau bởi dấu phẩy)
    this.adAccountIds = adAccountIdConfig
      ? adAccountIdConfig
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      : [];
    this.appSecretProof = this.configService.get<string>(
      'FACEBOOK_APP_SECRET_PROOF',
    );
    this.graphApiBaseUrl =
      this.configService.get<string>('FACEBOOK_GRAPH_API') ||
      'https://graph.facebook.com/v24.0';

    this.axiosInstance = axios.create({
      baseURL: this.graphApiBaseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!this.accessToken) {
      this.logger.warn('FACEBOOK_ACCESS_TOKEN is not configured');
    }

    if (this.adAccountIds.length > 0) {
      this.logger.log(
        `Configured ${this.adAccountIds.length} Facebook Ad Account(s): ${this.adAccountIds.join(', ')}`,
      );
    } else {
      this.logger.warn('FACEBOOK_AD_ACCOUNT_ID is not configured');
    }
  }

  /**
   * Lấy danh sách campaigns từ một ad account
   */
  private async getCampaignsFromAccount(
    adAccountId: string,
  ): Promise<FacebookCampaign[]> {
    if (!this.accessToken) {
      throw new Error('Facebook Access Token is not configured');
    }

    const allCampaigns: FacebookCampaign[] = [];
    let nextUrl: string | undefined;
    let pageCount = 0;

    do {
      pageCount++;
      const params: Record<string, string> = {
        fields: 'id,name,status,created_time,updated_time',
        access_token: this.accessToken,
        limit: '100', // Tăng limit từ 25 (mặc định) lên 100
      };

      if (this.appSecretProof) {
        params.appsecret_proof = this.appSecretProof;
      }

      let requestUrl: string;
      let requestParams: Record<string, string> | undefined;

      if (nextUrl) {
        // Pagination URL từ Facebook
        try {
          const urlObj = new URL(nextUrl);
          const searchParams = new URLSearchParams(urlObj.search);

          if (this.appSecretProof) {
            searchParams.set('appsecret_proof', this.appSecretProof);
          }

          if (!searchParams.has('limit')) {
            searchParams.set('limit', '100');
          }

          let pathname = urlObj.pathname;
          if (pathname.startsWith('/v24.0/')) {
            pathname = pathname.substring(6);
          }

          requestUrl = pathname + '?' + searchParams.toString();
          requestParams = undefined;
        } catch {
          requestUrl = nextUrl;
          requestParams = this.appSecretProof
            ? { appsecret_proof: this.appSecretProof }
            : undefined;
        }
      } else {
        // Request đầu tiên - sử dụng ad account ID với prefix act_
        requestUrl = `/${adAccountId}/campaigns`;
        requestParams = params;
      }

      const response = await this.axiosInstance.get<{
        data: FacebookCampaign[];
        paging?: {
          next?: string;
          cursors?: { before?: string; after?: string };
        };
      }>(requestUrl, {
        params: requestParams,
      });

      const campaigns = response.data.data || [];
      allCampaigns.push(...campaigns);

      this.logger.log(
        `Fetched page ${pageCount}: ${campaigns.length} campaigns (total: ${allCampaigns.length})`,
      );

      nextUrl = response.data.paging?.next;
      if (nextUrl) {
        try {
          const urlObj = new URL(nextUrl);
          let pathname = urlObj.pathname;
          if (pathname.startsWith('/v24.0/')) {
            pathname = pathname.substring(6);
          }
          nextUrl = pathname + urlObj.search;
        } catch {
          // Nếu đã là relative path, giữ nguyên
        }
      }
    } while (nextUrl);

    this.logger.log(
      `Fetched total ${allCampaigns.length} campaigns from account ${adAccountId}`,
    );

    return allCampaigns;
  }

  /**
   * Lấy danh sách ads từ một ad account
   */
  private async getAdsFromAccount(adAccountId: string): Promise<FacebookAd[]> {
    if (!this.accessToken) {
      throw new Error('Facebook Access Token is not configured');
    }

    const allAds: FacebookAd[] = [];
    let nextUrl: string | undefined;
    let pageCount = 0;

    do {
      pageCount++;
      const params: Record<string, string> = {
        fields:
          'id,name,campaign_id,status,bid_amount,created_time,updated_time',
        access_token: this.accessToken,
        limit: '100',
      };

      if (this.appSecretProof) {
        params.appsecret_proof = this.appSecretProof;
      }

      let requestUrl: string;
      let requestParams: Record<string, string> | undefined;

      if (nextUrl) {
        // Pagination URL từ Facebook - cần parse và thêm appsecret_proof
        try {
          const urlObj = new URL(nextUrl);
          const searchParams = new URLSearchParams(urlObj.search);

          // Thêm appsecret_proof nếu có
          if (this.appSecretProof) {
            searchParams.set('appsecret_proof', this.appSecretProof);
          }

          // Đảm bảo limit được giữ lại trong pagination (Facebook thường giữ limit trong next URL)
          // Nếu không có limit trong URL, thêm limit=100
          if (!searchParams.has('limit')) {
            searchParams.set('limit', '100');
          }

          let pathname = urlObj.pathname;
          if (pathname.startsWith('/v24.0/')) {
            pathname = pathname.substring(6);
          }

          // Reconstruct URL với appsecret_proof và limit
          requestUrl = pathname + '?' + searchParams.toString();
          requestParams = undefined; // URL đã có đầy đủ params
        } catch {
          // Nếu không parse được URL, sử dụng như relative path
          requestUrl = nextUrl;
          requestParams = this.appSecretProof
            ? { appsecret_proof: this.appSecretProof }
            : undefined;
        }
      } else {
        // Request đầu tiên - sử dụng ad account ID với prefix act_
        requestUrl = `/${adAccountId}/ads`;
        requestParams = params;
      }

      const response = await this.axiosInstance.get<{
        data: FacebookAd[];
        paging?: {
          next?: string;
          cursors?: { before?: string; after?: string };
        };
      }>(requestUrl, {
        params: requestParams,
      });

      const ads = response.data.data || [];
      allAds.push(...ads);

      this.logger.log(
        `Fetched page ${pageCount}: ${ads.length} ads (total: ${allAds.length})`,
      );

      // Handle pagination - tiếp tục nếu có next URL
      nextUrl = response.data.paging?.next;
      if (nextUrl) {
        this.logger.log(`More data available, fetching next page...`);
        try {
          const urlObj = new URL(nextUrl);
          // Loại bỏ /v24.0 từ pathname vì baseURL đã có
          let pathname = urlObj.pathname;
          if (pathname.startsWith('/v24.0/')) {
            pathname = pathname.substring(6); // Loại bỏ '/v24.0'
          }
          nextUrl = pathname + urlObj.search;
        } catch {
          // Nếu đã là relative path, giữ nguyên
        }
      } else {
        this.logger.log(`No more pages available for account ${adAccountId}`);
      }
    } while (nextUrl);

    this.logger.log(
      `Fetched total ${allAds.length} ads from account ${adAccountId} (${pageCount} pages)`,
    );

    return allAds;
  }

  /**
   * Lấy insights cho một ad cụ thể (dựa trên ad ID)
   */
  async getAdInsights(adId: string): Promise<FacebookInsight[]> {
    if (!this.accessToken) {
      throw new Error('Facebook Access Token is not configured');
    }

    const allInsights: FacebookInsight[] = [];
    let nextUrl: string | undefined;

    do {
      const params: Record<string, string> = {
        access_token: this.accessToken,
      };

      if (this.appSecretProof) {
        params.appsecret_proof = this.appSecretProof;
      }

      let requestUrl: string;
      let requestParams: Record<string, string> | undefined;

      if (nextUrl) {
        // Pagination URL từ Facebook
        try {
          const urlObj = new URL(nextUrl);
          const searchParams = new URLSearchParams(urlObj.search);

          if (this.appSecretProof) {
            searchParams.set('appsecret_proof', this.appSecretProof);
          }

          // Loại bỏ /v24.0 từ pathname vì baseURL đã có
          let pathname = urlObj.pathname;
          if (pathname.startsWith('/v24.0/')) {
            pathname = pathname.substring(6); // Loại bỏ '/v24.0'
          }

          requestUrl = pathname + '?' + searchParams.toString();
          requestParams = undefined;
        } catch {
          requestUrl = nextUrl;
          requestParams = this.appSecretProof
            ? { appsecret_proof: this.appSecretProof }
            : undefined;
        }
      } else {
        // Request đầu tiên - ad ID là số không có prefix
        requestUrl = `/${adId}/insights?date_preset=maximum`;
        requestParams = params;
      }

      const response = await this.axiosInstance.get<{
        data: FacebookInsight[];
        paging?: {
          next?: string;
          cursors?: { before?: string; after?: string };
        };
      }>(requestUrl, {
        params: requestParams,
      });

      const insights = response.data.data || [];

      const insightsWithSpend = insights.filter(
        (insight) => insight.spend !== null && insight.spend !== undefined,
      );
      allInsights.push(...insightsWithSpend);

      // Handle pagination
      nextUrl = response.data.paging?.next;
      if (nextUrl) {
        try {
          const urlObj = new URL(nextUrl);
          // Loại bỏ /v24.0 từ pathname vì baseURL đã có
          let pathname = urlObj.pathname;
          if (pathname.startsWith('/v24.0/')) {
            pathname = pathname.substring(6); // Loại bỏ '/v24.0'
          }
          nextUrl = pathname + urlObj.search;
        } catch {
          // Nếu đã là relative path, giữ nguyên
        }
      }
    } while (nextUrl);

    return allInsights;
  }

  /**
   * Parse X-Business-Use-Case-Usage header để lấy thông tin rate limit
   * Theo: https://developers.facebook.com/docs/graph-api/overview/rate-limiting/
   */
  private parseRateLimitHeader(
    headers: Record<string, string | string[] | undefined>,
  ): {
    callCount?: number;
    estimatedTimeToRegainAccess?: number; // minutes
    adsApiAccessTier?: string;
  } {
    const headerValue = headers['x-business-use-case-usage'];
    if (!headerValue) {
      return {};
    }

    try {
      const headerStr =
        typeof headerValue === 'string' ? headerValue : headerValue[0];
      const usageData = JSON.parse(headerStr);

      // Header có thể chứa nhiều business objects
      // Lấy object đầu tiên có ads_insights hoặc ads_management
      for (const businessId in usageData) {
        const usageArray = usageData[businessId];
        if (Array.isArray(usageArray) && usageArray.length > 0) {
          const usage = usageArray[0];
          if (
            usage.type === 'ads_insights' ||
            usage.type === 'ads_management'
          ) {
            return {
              callCount: usage.call_count,
              estimatedTimeToRegainAccess: usage.estimated_time_to_regain_access,
              adsApiAccessTier: usage.ads_api_access_tier,
            };
          }
        }
      }
    } catch (error) {
      this.logger.debug('Failed to parse rate limit header', error);
    }

    return {};
  }

  /**
   * Request queue system để quản lý rate limiting
   * Đảm bảo các requests được xử lý tuần tự với delay phù hợp
   */
  private async queueRequest<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      if (timeSinceLastRequest < this.minDelayBetweenRequests) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.minDelayBetweenRequests - timeSinceLastRequest),
        );
      }

      const requestFn = this.requestQueue.shift();
      if (requestFn) {
        this.lastRequestTime = Date.now();
        try {
          await requestFn();
        } catch (error) {
          this.logger.error('Error processing queued request', error);
        }
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Facebook Batch API - Gộp nhiều requests thành một HTTP request
   * Theo: https://developers.facebook.com/docs/graph-api/making-multiple-requests
   * Mỗi request trong batch vẫn tính là một API call, nhưng giảm HTTP overhead
   */
  private async batchRequest<T>(
    requests: Array<{
      method: 'GET' | 'POST' | 'DELETE';
      relative_url: string;
      name?: string;
    }>,
  ): Promise<Array<{ code: number; body: T }>> {
    if (!this.accessToken) {
      throw new Error('Facebook Access Token is not configured');
    }

    if (requests.length === 0) {
      return [];
    }

    // Facebook Batch API giới hạn 50 requests mỗi batch
    const maxBatchSize = 50;
    const batches: Array<typeof requests> = [];
    
    for (let i = 0; i < requests.length; i += maxBatchSize) {
      batches.push(requests.slice(i, i + maxBatchSize));
    }

    const allResults: Array<{ code: number; body: T }> = [];

    for (const batch of batches) {
      const batchParams: Record<string, string> = {
        access_token: this.accessToken,
        batch: JSON.stringify(batch),
      };

      if (this.appSecretProof) {
        batchParams.appsecret_proof = this.appSecretProof;
      }

      const response = await this.retryWithBackoff(async () => {
        const res = await this.axiosInstance.post<Array<{ code: number; body: string }>>(
          '/',
          null,
          { params: batchParams },
        );

        // Kiểm tra rate limit header
        if (res.headers) {
          const rateLimitInfo = this.parseRateLimitHeader(
            res.headers as Record<string, string | string[]>,
          );
          if (
            rateLimitInfo.callCount !== undefined &&
            rateLimitInfo.callCount >= 80
          ) {
            this.logger.warn(
              `Rate limit usage high: ${rateLimitInfo.callCount}% (tier: ${rateLimitInfo.adsApiAccessTier || 'unknown'})`,
            );
          }
        }

        return res;
      });

      // Parse body từ string thành object
      const parsedResults = response.data.map((item) => ({
        code: item.code,
        body: JSON.parse(item.body) as T,
      }));

      allResults.push(...parsedResults);
    }

    return allResults;
  }

  /**
   * Lấy insights cho nhiều campaigns cùng lúc bằng Batch API
   * Giảm số lượng HTTP requests từ N xuống N/50 (tối đa 50 requests mỗi batch)
   */
  async batchCampaignInsights(
    campaignIds: string[],
  ): Promise<Map<string, FacebookInsight[]>> {
    if (!this.accessToken) {
      throw new Error('Facebook Access Token is not configured');
    }

    if (campaignIds.length === 0) {
      return new Map();
    }

    this.logger.log(
      `Fetching insights for ${campaignIds.length} campaigns using Batch API`,
    );

    // Tạo batch requests với limit=100 để tăng số insights mỗi page
    const batchRequests = campaignIds.map((campaignId, index) => ({
      method: 'GET' as const,
      relative_url: `${campaignId}/insights?date_preset=maximum&limit=100`,
      name: `campaign_${index}`,
    }));

    // Gọi batch API với rate limiting
    const results = await this.queueRequest(() =>
      this.batchRequest<{
        data?: FacebookInsight[];
        paging?: { next?: string };
        error?: { message?: string; code?: number };
      }>(batchRequests),
    );

    // Xử lý kết quả và map về campaign IDs
    const insightsMap = new Map<string, FacebookInsight[]>();

    results.forEach((result, index) => {
      const campaignId = campaignIds[index];

      if (result.code === 200 && result.body.data) {
        insightsMap.set(campaignId, result.body.data);
      } else if (result.body.error) {
        this.logger.warn(
          `Failed to fetch insights for campaign ${campaignId}: ${result.body.error.message || 'Unknown error'}`,
        );
        insightsMap.set(campaignId, []);
      } else {
        insightsMap.set(campaignId, []);
      }
    });

    this.logger.log(
      `Successfully fetched insights for ${insightsMap.size} campaigns`,
    );

    return insightsMap;
  }

  /**
   * Retry với exponential backoff khi gặp rate limit
   * Sử dụng estimated_time_to_regain_access từ header nếu có
   * Theo best practices: https://developers.facebook.com/docs/graph-api/overview/rate-limiting/
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = 5, // Tăng số lần retry lên 5 để xử lý rate limit tốt hơn
    initialDelay = 2000, // Tăng initial delay lên 2 giây cho Ads API rate limit
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: unknown) {
        lastError = error;
        let isRateLimit = false;
        let rateLimitSubcode: number | undefined;
        let estimatedWaitTime: number | undefined;

        if (axios.isAxiosError(error)) {
          const errorData = error.response?.data as
            | {
                error?: {
                  code?: number;
                  error_subcode?: number;
                  message?: string;
                };
              }
            | undefined;
          const errorCode = errorData?.error?.code;
          const errorSubcode = errorData?.error?.error_subcode;
          rateLimitSubcode = errorSubcode;

          // Kiểm tra rate limit: code 17 hoặc status 429
          // Subcode 2446079 = Ads API rate limit reached (v3.3 and older)
          // Theo: https://developers.facebook.com/docs/graph-api/overview/rate-limiting/
          isRateLimit =
            error.response?.status === 429 ||
            error.response?.status === 17 ||
            errorCode === 17 ||
            (errorCode === 17 && errorSubcode === 2446079) ||
            errorData?.error?.message?.toLowerCase().includes('too many') ||
            errorData?.error?.message?.toLowerCase().includes('rate limit') ||
            false;

          // Đọc header để lấy estimated_time_to_regain_access
          if (error.response?.headers) {
            const rateLimitInfo = this.parseRateLimitHeader(
              error.response.headers as Record<string, string | string[]>,
            );
            estimatedWaitTime = rateLimitInfo.estimatedTimeToRegainAccess;

            if (rateLimitInfo.callCount !== undefined) {
              this.logger.warn(
                `Rate limit usage: ${rateLimitInfo.callCount}% (tier: ${rateLimitInfo.adsApiAccessTier || 'unknown'})`,
              );
            }
          }
        }

        if (isRateLimit && attempt < maxRetries - 1) {
          // Sử dụng estimated_time_to_regain_access từ header nếu có
          // Theo best practices: "When the limit has been reached, stop making API calls"
          let delay: number;
          if (estimatedWaitTime !== undefined && estimatedWaitTime > 0) {
            // Chuyển từ phút sang milliseconds và thêm buffer
            delay = estimatedWaitTime * 60 * 1000 + 5000; // +5 giây buffer
            this.logger.warn(
              `Rate limit reached. Waiting ${estimatedWaitTime} minutes as suggested by API (subcode: ${rateLimitSubcode || 'unknown'})`,
            );
          } else {
            // Fallback: exponential backoff với delay gấp đôi cho subcode 2446079
            const baseDelay =
              rateLimitSubcode === 2446079
                ? initialDelay * 2
                : initialDelay; // Delay gấp đôi cho Ads API rate limit
            delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
            this.logger.warn(
              `Rate limit hit${rateLimitSubcode ? ` (subcode: ${rateLimitSubcode})` : ''}, retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
            );
          }

          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  /**
   * Lấy insights cho một campaign cụ thể (dựa trên campaign ID)
   */
  async getCampaignInsights(campaignId: string): Promise<FacebookInsight[]> {
    if (!this.accessToken) {
      throw new Error('Facebook Access Token is not configured');
    }

    const allInsights: FacebookInsight[] = [];
    let nextUrl: string | undefined;

    do {
      const params: Record<string, string> = {
        access_token: this.accessToken,
        limit: '100', // Tăng limit từ 25 (mặc định) lên 100 để giảm số lần pagination
      };

      if (this.appSecretProof) {
        params.appsecret_proof = this.appSecretProof;
      }

      let requestUrl: string;
      let requestParams: Record<string, string> | undefined;

      if (nextUrl) {
        // Pagination URL từ Facebook
        try {
          const urlObj = new URL(nextUrl);
          const searchParams = new URLSearchParams(urlObj.search);

          if (this.appSecretProof) {
            searchParams.set('appsecret_proof', this.appSecretProof);
          }

          // Đảm bảo limit được giữ lại trong pagination
          if (!searchParams.has('limit')) {
            searchParams.set('limit', '100');
          }

          // Loại bỏ /v24.0 từ pathname vì baseURL đã có
          let pathname = urlObj.pathname;
          if (pathname.startsWith('/v24.0/')) {
            pathname = pathname.substring(6); // Loại bỏ '/v24.0'
          }

          requestUrl = pathname + '?' + searchParams.toString();
          requestParams = undefined;
        } catch {
          requestUrl = nextUrl;
          requestParams = this.appSecretProof
            ? { appsecret_proof: this.appSecretProof }
            : undefined;
        }
      } else {
        // Request đầu tiên - campaign ID là số không có prefix
        requestUrl = `/${campaignId}/insights?date_preset=maximum`;
        requestParams = params;
      }

      // Retry với exponential backoff khi gặp rate limit và sử dụng queue
      const response = await this.queueRequest(() =>
        this.retryWithBackoff(async () => {
          const res = await this.axiosInstance.get<{
            data: FacebookInsight[];
            paging?: {
              next?: string;
              cursors?: { before?: string; after?: string };
            };
          }>(requestUrl, {
            params: requestParams,
          });

          // Kiểm tra header sau khi request thành công để cảnh báo sớm
          if (res.headers) {
            const rateLimitInfo = this.parseRateLimitHeader(
              res.headers as Record<string, string | string[]>,
            );
            if (
              rateLimitInfo.callCount !== undefined &&
              rateLimitInfo.callCount >= 80
            ) {
              this.logger.warn(
                `Rate limit usage high: ${rateLimitInfo.callCount}% (tier: ${rateLimitInfo.adsApiAccessTier || 'unknown'})`,
              );
            }
          }

          return res;
        }),
      );

      const insights = response.data.data || [];
      allInsights.push(...insights);

      // Handle pagination
      nextUrl = response.data.paging?.next;
      if (nextUrl) {
        try {
          const urlObj = new URL(nextUrl);
          // Loại bỏ /v24.0 từ pathname vì baseURL đã có
          let pathname = urlObj.pathname;
          if (pathname.startsWith('/v24.0/')) {
            pathname = pathname.substring(6); // Loại bỏ '/v24.0'
          }
          nextUrl = pathname + urlObj.search;
        } catch {
          // Nếu đã là relative path, giữ nguyên
        }
      }
    } while (nextUrl);

    return allInsights;
  }

  /**
   * Lấy tất cả ads từ tất cả ad accounts (không có insights)
   */
  async getAllAds(): Promise<FacebookAd[]> {
    const result = await this.getAllAdsWithAccountMap();
    return result.ads;
  }

  /**
   * Lấy tất cả ads từ tất cả ad accounts cùng với mapping từ ad ID sang ad account ID
   */
  async getAllAdsWithAccountMap(): Promise<{
    ads: FacebookAd[];
    adAccountMap: Map<string, string>;
  }> {
    if (!this.accessToken) {
      throw new Error('Facebook Access Token is not configured');
    }

    const accountIds = this.adAccountIds.length > 0 ? this.adAccountIds : [];
    if (accountIds.length === 0) {
      throw new Error('Facebook Ad Account ID(s) is not configured');
    }

    this.logger.log(`Fetching ads from ${accountIds.length} ad account(s)`);

    // Fetch ads từ tất cả ad accounts song song
    const adsPromises = accountIds.map((accountId) =>
      this.getAdsFromAccount(accountId).catch((error) => {
        this.logger.error(
          `Failed to fetch ads from account ${accountId}:`,
          error,
        );
        return [] as FacebookAd[];
      }),
    );

    const adsArrays = await Promise.all(adsPromises);

    // Tạo map từ ad ID sang ad account ID
    const adAccountMap = new Map<string, string>();
    adsArrays.forEach((ads, index) => {
      const accountId = accountIds[index];
      this.logger.log(`Account ${accountId}: ${ads.length} ads`);
      ads.forEach((ad) => {
        adAccountMap.set(ad.id, accountId);
      });
    });

    const allAds = adsArrays.flat();

    this.logger.log(
      `Fetched total ${allAds.length} ads from ${accountIds.length} ad account(s)`,
    );

    return {
      ads: allAds,
      adAccountMap,
    };
  }

  /**
   * Lấy tất cả campaigns từ tất cả ad accounts cùng với mapping từ campaign ID sang ad account ID
   */
  async getAllCampaignsWithAccountMap(): Promise<{
    campaigns: FacebookCampaign[];
    adAccountMap: Map<string, string>;
  }> {
    if (!this.accessToken) {
      throw new Error('Facebook Access Token is not configured');
    }

    const accountIds = this.adAccountIds.length > 0 ? this.adAccountIds : [];
    if (accountIds.length === 0) {
      throw new Error('Facebook Ad Account ID(s) is not configured');
    }

    this.logger.log(
      `Fetching campaigns from ${accountIds.length} ad account(s)`,
    );

    // Fetch campaigns từ tất cả ad accounts song song
    const campaignsPromises = accountIds.map((accountId) =>
      this.getCampaignsFromAccount(accountId).catch((error) => {
        this.logger.error(
          `Failed to fetch campaigns from account ${accountId}:`,
          error,
        );
        return [] as FacebookCampaign[];
      }),
    );

    const campaignsArrays = await Promise.all(campaignsPromises);

    // Tạo map từ campaign ID sang ad account ID
    const adAccountMap = new Map<string, string>();
    campaignsArrays.forEach((campaigns, index) => {
      const accountId = accountIds[index];
      this.logger.log(
        `Account ${accountId}: ${campaigns.length} campaigns`,
      );
      campaigns.forEach((campaign) => {
        adAccountMap.set(campaign.id, accountId);
      });
    });

    const allCampaigns = campaignsArrays.flat();

    this.logger.log(
      `Fetched total ${allCampaigns.length} campaigns from ${accountIds.length} ad account(s)`,
    );

    return {
      campaigns: allCampaigns,
      adAccountMap,
    };
  }

  /**
   * Lấy tất cả campaigns từ ads và insights (legacy method)
   */
  async getAllCampaigns(): Promise<FacebookCampaignWithInsights[]> {
    if (!this.accessToken) {
      throw new Error('Facebook Access Token is not configured');
    }

    const accountIds = this.adAccountIds.length > 0 ? this.adAccountIds : [];
    if (accountIds.length === 0) {
      throw new Error('Facebook Ad Account ID(s) is not configured');
    }

    this.logger.log(`Fetching ads from ${accountIds.length} ad account(s)`);

    // Fetch ads từ tất cả ad accounts song song
    const adsPromises = accountIds.map((accountId) =>
      this.getAdsFromAccount(accountId).catch((error) => {
        this.logger.error(
          `Failed to fetch ads from account ${accountId}:`,
          error,
        );
        return [] as FacebookAd[];
      }),
    );

    const adsArrays = await Promise.all(adsPromises);
    const allAds = adsArrays.flat();

    this.logger.log(
      `Fetched total ${allAds.length} ads from ${accountIds.length} ad account(s)`,
    );

    // Lấy insights cho từng ad (song song để tăng tốc độ)
    this.logger.log(`Fetching insights for ${allAds.length} ads`);
    const adsWithInsightsPromises = allAds.map(async (ad) => {
      try {
        const insights = await this.getAdInsights(ad.campaign_id || '');
        return {
          ad,
          insights,
        };
      } catch (error) {
        this.logger.error(`Failed to fetch insights for ad ${ad.id}:`, error);
        return {
          ad,
          insights: [] as FacebookInsight[],
        };
      }
    });

    const adsWithInsights = await Promise.all(adsWithInsightsPromises);

    // Group ads theo campaign_id và tính tổng insights
    const campaignMap = new Map<string, FacebookCampaignWithInsights>();
    for (const { ad, insights } of adsWithInsights) {
      if (!ad.campaign_id) continue;

      let campaign = campaignMap.get(ad.campaign_id);
      if (!campaign) {
        campaign = {
          campaign_id: ad.campaign_id,
          campaign_name: ad.name || `Campaign ${ad.campaign_id}`,
          ads: [],
          insights: [],
          total_spend: 0,
          total_impressions: 0,
          total_clicks: 0,
        };
        campaignMap.set(ad.campaign_id, campaign);
      }

      campaign.ads.push(ad);
      campaign.insights.push(...insights);

      // Tính tổng từ insights
      const adSpend = insights.reduce((sum, insight) => {
        return sum + (parseFloat(insight.spend || '0') || 0);
      }, 0);
      const adImpressions = insights.reduce((sum, insight) => {
        return sum + (parseInt(insight.impressions || '0', 10) || 0);
      }, 0);
      const adClicks = insights.reduce((sum, insight) => {
        return sum + (parseInt(insight.clicks || '0', 10) || 0);
      }, 0);

      campaign.total_spend += adSpend;
      campaign.total_impressions += adImpressions;
      campaign.total_clicks += adClicks;
    }

    const campaigns = Array.from(campaignMap.values());

    this.logger.log(
      `Grouped ${allAds.length} ads into ${campaigns.length} campaigns`,
    );

    // Log 20 phần tử đầu tiên
    if (campaigns.length > 0) {
      const first20 = campaigns.slice(0, 20);
      this.logger.log(`First 20 campaigns:`);
      first20.forEach((campaign, index) => {
        this.logger.log(
          `  [${index + 1}] Campaign: ${campaign.campaign_name}, ` +
            `ID: ${campaign.campaign_id}, ` +
            `Ads: ${campaign.ads.length}, ` +
            `Total Spend: ${campaign.total_spend || 0}, ` +
            `Impressions: ${campaign.total_impressions || 0}, ` +
            `Clicks: ${campaign.total_clicks || 0}`,
        );
      });
      if (campaigns.length > 20) {
        this.logger.log(`  ... and ${campaigns.length - 20} more campaigns`);
      }
    }

    return campaigns;
  }
}
