import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  Bitrix24DealResponse,
  Bitrix24ApiResponse,
} from './interfaces/bitrix24-deal.interface';
import {
  Bitrix24Lead,
  Bitrix24LeadResponse,
  Bitrix24LeadApiResponse,
} from './interfaces/bitrix24-lead.interface';
import { Bitrix24Deal } from './interfaces/bitrix24-deal.interface';

@Injectable()
export class Bitrix24Service {
  private readonly logger = new Logger(Bitrix24Service.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly webhookUrl: string;

  constructor(private configService: ConfigService) {
    const webhookUrl = this.configService.get<string>('BITRIX24_WEBHOOK_URL');

    if (!webhookUrl) {
      this.logger.warn('BITRIX24_WEBHOOK_URL is not configured');
      this.webhookUrl = '';
    } else {
      this.webhookUrl = webhookUrl;
    }

    this.axiosInstance = axios.create({
      baseURL: this.webhookUrl || 'https://placeholder.bitrix24.com',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Lấy danh sách deals từ Bitrix24 với pagination và filtering
   */
  async getDeals(params: {
    start?: number;
    filter?: Record<string, unknown>;
    select?: string[];
    order?: Record<string, string>;
  }): Promise<Bitrix24DealResponse> {
    try {
      interface Bitrix24RequestData {
        start: number;
        filter?: Record<string, unknown>;
        select?: string[];
        order?: Record<string, string>;
      }

      const requestData: Bitrix24RequestData = {
        start: params.start || 0,
      };

      if (params.filter && Object.keys(params.filter).length > 0) {
        requestData.filter = params.filter;
      }

      if (params.select && params.select.length > 0) {
        requestData.select = params.select;
      }

      if (params.order && Object.keys(params.order).length > 0) {
        requestData.order = params.order;
      }

      const response = await this.axiosInstance.post<Bitrix24ApiResponse>(
        'crm.deal.list',
        requestData,
      );

      // Bitrix24 trả về result là array hoặc object với result và total
      if (Array.isArray(response.data.result)) {
        return {
          result: response.data.result,
          total: response.data.total || response.data.result.length,
          next: response.data.next,
        };
      } else {
        const dealResponse = response.data.result;
        return {
          result: dealResponse.result || [],
          total: dealResponse.total || response.data.total || 0,
          next: dealResponse.next || response.data.next,
        };
      }
    } catch (error: unknown) {
      this.logger.error('Error fetching deals from Bitrix24', error);
      if (axios.isAxiosError(error)) {
        const errorData = error.response?.data as
          | { error_description?: string }
          | undefined;
        const message = errorData?.error_description || error.message;
        throw new Error(`Failed to fetch deals: ${message}`);
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to fetch deals: ${errorMessage}`);
    }
  }

  /**
   * Build filter object từ query parameters
   * Sử dụng range operators (>=, <=) để filter trực tiếp trong API call
   */
  buildFilter(filterDto: {
    dateFrom?: string;
    dateTo?: string;
    stageId?: string;
    categoryId?: string;
    search?: string;
  }): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    // Filter theo ngày DATE_CREATE với range operators
    // Format: YYYY-MM-DD hoặc YYYY-MM-DD HH:MI:SS
    if (filterDto.dateFrom || filterDto.dateTo) {
      // Nếu chỉ có dateFrom, thêm time 00:00:00 để lấy từ đầu ngày
      // Nếu chỉ có dateTo, thêm time 23:59:59 để lấy đến cuối ngày
      const dateFromValue = filterDto.dateFrom
        ? filterDto.dateFrom.includes(' ')
          ? filterDto.dateFrom
          : `${filterDto.dateFrom} 00:00:00`
        : undefined;
      const dateToValue = filterDto.dateTo
        ? filterDto.dateTo.includes(' ')
          ? filterDto.dateTo
          : `${filterDto.dateTo} 23:59:59`
        : undefined;

      const dateFilter: Record<string, string> = {};
      if (dateFromValue) {
        dateFilter['>='] = dateFromValue;
      }
      if (dateToValue) {
        dateFilter['<='] = dateToValue;
      }
      filter.DATE_CREATE = dateFilter;
    }

    // Filter theo stage (exact match)
    if (filterDto.stageId) {
      filter.STAGE_ID = filterDto.stageId;
    }

    // Filter theo category (exact match)
    if (filterDto.categoryId) {
      filter.CATEGORY_ID = filterDto.categoryId;
    }

    // Search trong title với LIKE operator (%)
    if (filterDto.search) {
      filter['%TITLE'] = filterDto.search;
    }

    return filter;
  }

  /**
   * Lấy danh sách leads từ Bitrix24 với pagination và filtering
   */
  async getLeads(params: {
    start?: number;
    filter?: Record<string, unknown>;
    select?: string[];
    order?: Record<string, string>;
  }): Promise<Bitrix24LeadResponse> {
    try {
      interface Bitrix24RequestData {
        start: number;
        filter?: Record<string, unknown>;
        select?: string[];
        order?: Record<string, string>;
      }

      const requestData: Bitrix24RequestData = {
        start: params.start || 0,
      };

      if (params.filter && Object.keys(params.filter).length > 0) {
        requestData.filter = params.filter;
      }

      if (params.select && params.select.length > 0) {
        requestData.select = params.select;
      }

      if (params.order && Object.keys(params.order).length > 0) {
        requestData.order = params.order;
      }

      const response = await this.axiosInstance.post<Bitrix24LeadApiResponse>(
        'crm.lead.list',
        requestData,
      );

      // Bitrix24 trả về result là array hoặc object với result và total
      if (Array.isArray(response.data.result)) {
        return {
          result: response.data.result,
          total: response.data.total || response.data.result.length,
          next: response.data.next,
        };
      } else {
        const leadResponse = response.data.result;
        return {
          result: leadResponse.result || [],
          total: leadResponse.total || response.data.total || 0,
          next: leadResponse.next || response.data.next,
        };
      }
    } catch (error: unknown) {
      this.logger.error('Error fetching leads from Bitrix24', error);
      if (axios.isAxiosError(error)) {
        const errorData = error.response?.data as
          | { error_description?: string }
          | undefined;
        const message = errorData?.error_description || error.message;
        throw new Error(`Failed to fetch leads: ${message}`);
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to fetch leads: ${errorMessage}`);
    }
  }

  /**
   * Build filter object cho leads từ query parameters
   * Sử dụng range operators (>=, <=) để filter trực tiếp trong API call
   */
  buildLeadFilter(filterDto: {
    dateFrom?: string;
    dateTo?: string;
    statusId?: string;
    sourceId?: string;
    search?: string;
  }): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    // Filter theo ngày DATE_CREATE với range operators
    // Format: YYYY-MM-DD hoặc YYYY-MM-DD HH:MI:SS
    // Bitrix24 yêu cầu prefix kèm field name: ">=DATE_CREATE", "<=DATE_CREATE"
    if (filterDto.dateFrom || filterDto.dateTo) {
      // Nếu chỉ có dateFrom, thêm time 00:00:00 để lấy từ đầu ngày
      // Nếu chỉ có dateTo, thêm time 23:59:59 để lấy đến cuối ngày
      const dateFromValue = filterDto.dateFrom
        ? filterDto.dateFrom.includes(' ')
          ? filterDto.dateFrom
          : `${filterDto.dateFrom} 00:00:00`
        : undefined;
      const dateToValue = filterDto.dateTo
        ? filterDto.dateTo.includes(' ')
          ? filterDto.dateTo
          : `${filterDto.dateTo} 23:59:59`
        : undefined;

      // Sử dụng prefix với field name theo format Bitrix24: ">=DATE_CREATE", "<=DATE_CREATE"
      if (dateFromValue) {
        filter['>=DATE_CREATE'] = dateFromValue;
      }
      if (dateToValue) {
        filter['<=DATE_CREATE'] = dateToValue;
      }
    }

    // Filter theo status (exact match)
    if (filterDto.statusId) {
      filter.STATUS_ID = filterDto.statusId;
    }

    // Filter theo source (exact match)
    if (filterDto.sourceId) {
      filter.SOURCE_ID = filterDto.sourceId;
    }

    // Search trong title với LIKE operator (%)
    // Có thể search trong nhiều field bằng cách thêm các filter khác
    if (filterDto.search) {
      filter['%TITLE'] = filterDto.search;
      // Có thể thêm search trong NAME nếu cần
      // filter['%NAME'] = filterDto.search;
    }

    return filter;
  }

  /**
   * Batch request để gọi nhiều methods cùng lúc
   */
  async batchRequest(
    commands: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    try {
      const batchData = {
        halt: 0,
        cmd: commands,
      };

      const response = await this.axiosInstance.post<{
        result: {
          result: Record<string, unknown>;
          result_error: Record<string, unknown>;
          result_total: Record<string, unknown>;
          result_next: Record<string, unknown>;
          result_time: Record<string, unknown>;
        };
      }>('batch', batchData);

      if (response.data.result?.result_error) {
        const errors = Object.keys(response.data.result.result_error);
        if (errors.length > 0) {
          this.logger.warn('Some batch commands failed', errors);
        }
      }

      return response.data.result?.result || {};
    } catch (error: unknown) {
      this.logger.error('Error executing batch request', error);
      if (axios.isAxiosError(error)) {
        const errorData = error.response?.data as
          | { error_description?: string }
          | undefined;
        const message = errorData?.error_description || error.message;
        throw new Error(`Failed to execute batch request: ${message}`);
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to execute batch request: ${errorMessage}`);
    }
  }

  /**
   * Lấy thông tin chi tiết của deals bằng batch
   */
  async getDealsDetails(dealIds: string[]): Promise<Bitrix24Deal[]> {
    if (dealIds.length === 0) return [];

    try {
      // Chia thành các batch nhỏ (mỗi batch tối đa 50 items)
      const batchSize = 50;
      const batches: string[][] = [];
      for (let i = 0; i < dealIds.length; i += batchSize) {
        batches.push(dealIds.slice(i, i + batchSize));
      }

      const allDeals: Bitrix24Deal[] = [];

      for (const batch of batches) {
        const commands: Record<string, string> = {};

        batch.forEach((dealId) => {
          // Bitrix24 batch format: "method?params" hoặc JSON string
          commands[`deal_${dealId}`] = `crm.deal.get?id=${dealId}`;
        });

        const batchResult = await this.batchRequest(commands);

        batch.forEach((dealId) => {
          const dealKey = `deal_${dealId}`;
          const dealData = batchResult[dealKey];
          if (dealData && typeof dealData === 'object') {
            // Bitrix24 trả về trực tiếp result object trong batch
            if ('result' in dealData) {
              allDeals.push(dealData.result as Bitrix24Deal);
            } else {
              // Nếu không có result wrapper, có thể là object trực tiếp
              allDeals.push(dealData as Bitrix24Deal);
            }
          }
        });
      }

      return allDeals;
    } catch (error: unknown) {
      this.logger.error('Error getting deals details', error);
      throw error;
    }
  }

  /**
   * Lấy thông tin chi tiết của leads bằng batch
   */
  async getLeadsDetails(leadIds: string[]): Promise<Bitrix24Lead[]> {
    if (leadIds.length === 0) return [];

    try {
      // Chia thành các batch nhỏ (mỗi batch tối đa 50 items)
      const batchSize = 50;
      const batches: string[][] = [];
      for (let i = 0; i < leadIds.length; i += batchSize) {
        batches.push(leadIds.slice(i, i + batchSize));
      }

      const allLeads: Bitrix24Lead[] = [];

      for (const batch of batches) {
        const commands: Record<string, string> = {};

        batch.forEach((leadId) => {
          commands[`lead_${leadId}`] = `crm.lead.get?id=${leadId}`;
        });

        const batchResult = await this.batchRequest(commands);

        batch.forEach((leadId) => {
          const leadKey = `lead_${leadId}`;
          const leadData = batchResult[leadKey];
          if (leadData && typeof leadData === 'object') {
            if ('result' in leadData) {
              allLeads.push(leadData.result as Bitrix24Lead);
            } else {
              allLeads.push(leadData as Bitrix24Lead);
            }
          }
        });
      }

      return allLeads;
    } catch (error: unknown) {
      this.logger.error('Error getting leads details', error);
      throw error;
    }
  }

  /**
   * Lấy thông tin user names bằng batch
   */
  async getUserNames(userIds: string[]): Promise<Record<string, string>> {
    if (userIds.length === 0) return {};

    try {
      const uniqueUserIds = [...new Set(userIds)];
      const batchSize = 50;
      const batches: string[][] = [];
      for (let i = 0; i < uniqueUserIds.length; i += batchSize) {
        batches.push(uniqueUserIds.slice(i, i + batchSize));
      }

      const userNames: Record<string, string> = {};

      for (const batch of batches) {
        const commands: Record<string, string> = {};

        batch.forEach((userId) => {
          commands[`user_${userId}`] = `user.get?id=${userId}`;
        });

        const batchResult = await this.batchRequest(commands);

        batch.forEach((userId) => {
          const userKey = `user_${userId}`;
          const userData = batchResult[userKey];
          if (userData && typeof userData === 'object') {
            let user: { NAME?: string; LAST_NAME?: string; ID: string } | null =
              null;
            if ('result' in userData) {
              user = userData.result as {
                NAME?: string;
                LAST_NAME?: string;
                ID: string;
              };
            } else {
              user = userData as {
                NAME?: string;
                LAST_NAME?: string;
                ID: string;
              };
            }
            if (user) {
              const fullName =
                [user.NAME, user.LAST_NAME].filter(Boolean).join(' ') || userId;
              userNames[userId] = fullName;
            }
          }
        });
      }

      return userNames;
    } catch (error: unknown) {
      this.logger.error('Error getting user names', error);
      return {};
    }
  }

  /**
   * Lấy danh sách status names từ Bitrix24 cho leads
   */
  async getLeadStatusNames(): Promise<Record<string, string>> {
    try {
      const response = await this.axiosInstance.post<{
        result: Array<{ STATUS_ID: string; NAME: string }>;
      }>(`${this.webhookUrl}crm.status.list`, {
        filter: { ENTITY_ID: 'STATUS' },
        select: ['STATUS_ID', 'NAME'],
      });

      const statusNames: Record<string, string> = {};
      if (response.data.result) {
        response.data.result.forEach((status) => {
          statusNames[status.STATUS_ID] = status.NAME;
        });
      }

      return statusNames;
    } catch (error: unknown) {
      this.logger.error('Error getting lead status names', error);
      return {};
    }
  }

  /**
   * Lấy danh sách source names từ Bitrix24 cho leads
   */
  async getLeadSourceNames(): Promise<Record<string, string>> {
    try {
      // Dùng crm.enum.fields để lấy source enum values
      const response = await this.axiosInstance.post<{
        result: {
          SOURCE?: {
            items?: Record<string, { ID: string; VALUE: string }>;
          };
        };
      }>(`${this.webhookUrl}crm.enum.fields`, {
        entityType: 'lead',
      });

      const sourceNames: Record<string, string> = {};
      if (response.data.result?.SOURCE?.items) {
        Object.values(response.data.result.SOURCE.items).forEach((item) => {
          sourceNames[item.ID] = item.VALUE;
        });
        this.logger.log(
          `Fetched ${Object.keys(sourceNames).length} source names from enum.fields`,
        );
      }

      // Nếu không lấy được từ enum.fields, thử dùng crm.status.list
      if (Object.keys(sourceNames).length === 0) {
        this.logger.warn('No sources from enum.fields, trying crm.status.list');
        const statusResponse = await this.axiosInstance.post<{
          result: Array<{ STATUS_ID: string; NAME: string }>;
        }>(`${this.webhookUrl}crm.status.list`, {
          filter: { ENTITY_ID: 'SOURCE' },
          select: ['STATUS_ID', 'NAME'],
        });

        if (statusResponse.data.result) {
          statusResponse.data.result.forEach((source) => {
            sourceNames[source.STATUS_ID] = source.NAME;
          });
          this.logger.log(
            `Fetched ${Object.keys(sourceNames).length} source names from status.list`,
          );
        }
      }

      return sourceNames;
    } catch (error: unknown) {
      this.logger.error('Error getting lead source names', error);
      return {};
    }
  }

  /**
   * Lấy smart process items (dynamic items) từ Bitrix24
   */
  async getSmartProcessItems(params: {
    entityTypeId: number;
    start?: number;
    filter?: Record<string, unknown>;
    select?: string[];
    order?: Record<string, string>;
  }): Promise<{
    result: Record<string, unknown>[];
    total: number;
    next?: number;
  }> {
    try {
      interface Bitrix24RequestData {
        start: number;
        filter?: Record<string, unknown>;
        select?: string[];
        order?: Record<string, string>;
      }

      interface Bitrix24SmartProcessRequestData extends Bitrix24RequestData {
        entityTypeId: number;
      }

      const requestData: Bitrix24SmartProcessRequestData = {
        start: params.start || 0,
        entityTypeId: params.entityTypeId,
      };

      if (params.filter && Object.keys(params.filter).length > 0) {
        requestData.filter = params.filter;
      }

      if (params.select && params.select.length > 0) {
        requestData.select = params.select;
      }

      if (params.order && Object.keys(params.order).length > 0) {
        requestData.order = params.order;
      }

      const response = await this.axiosInstance.post<{
        result:
          | Record<string, unknown>[]
          | {
              result: Record<string, unknown>[];
              total: number;
              next?: number;
            };
        total?: number;
        next?: number;
      }>('crm.item.list', requestData);

      if (Array.isArray(response.data.result)) {
        return {
          result: response.data.result,
          total: response.data.total || response.data.result.length,
          next: response.data.next,
        };
      } else {
        const itemResponse = response.data.result as {
          result: Record<string, unknown>[];
          total: number;
          next?: number;
        };
        return {
          result: itemResponse.result || [],
          total: itemResponse.total || response.data.total || 0,
          next: itemResponse.next || response.data.next,
        };
      }
    } catch (error: unknown) {
      this.logger.error(
        'Error fetching smart process items from Bitrix24',
        error,
      );
      if (axios.isAxiosError(error)) {
        const errorData = error.response?.data as
          | { error_description?: string }
          | undefined;
        const message = errorData?.error_description || error.message;
        throw new Error(`Failed to fetch smart process items: ${message}`);
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to fetch smart process items: ${errorMessage}`);
    }
  }
}
