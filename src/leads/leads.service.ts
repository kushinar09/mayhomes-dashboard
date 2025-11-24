import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bitrix24Service } from '../bitrix24/bitrix24.service';
import { LeadFilterDto } from './dto/lead-filter.dto';
import { Bitrix24Lead } from '../bitrix24/interfaces/bitrix24-lead.interface';

export interface LeadPaginationResult {
  leads: Bitrix24Lead[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  sort: {
    sortBy: string;
    sortOrder: string;
  };
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);
  private readonly defaultSelectFields = [
    'ID',
    'TITLE',
    'NAME',
    'LAST_NAME',
    'SECOND_NAME',
    'STATUS_ID',
    'STATUS_DESCRIPTION',
    'SOURCE_ID',
    'SOURCE_DESCRIPTION',
    'CURRENCY_ID',
    'OPPORTUNITY',
    'COMPANY_TITLE',
    'ASSIGNED_BY_ID',
    'CREATED_BY_ID',
    'DATE_CREATE',
    'DATE_MODIFY',
    'EMAIL',
    'PHONE',
  ];

  constructor(
    private readonly bitrix24Service: Bitrix24Service,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Lấy leads với pagination và filtering
   */
  async getLeadsWithPagination(
    filterDto: LeadFilterDto,
  ): Promise<LeadPaginationResult> {
    const page = filterDto.page || 1;
    const limit = filterDto.limit || 50;
    const start = (page - 1) * limit;

    // Build filter từ DTO
    const filter = this.bitrix24Service.buildLeadFilter({
      dateFrom: filterDto.dateFrom,
      dateTo: filterDto.dateTo,
      statusId: filterDto.statusId,
      sourceId: filterDto.sourceId,
      search: filterDto.search,
    });

    // Select các trường cần thiết - đọc từ env hoặc dùng default
    const selectFieldsConfig = this.configService.get<string>('BITRIX24_LEAD_SELECT_FIELDS');
    const select = selectFieldsConfig
      ? selectFieldsConfig.split(',').map((field) => field.trim()).filter(Boolean)
      : this.defaultSelectFields;

    // Order by sortBy hoặc mặc định DATE_CREATE desc
    // Bitrix24 yêu cầu: asc hoặc desc (lowercase)
    const sortBy = filterDto.sortBy || 'DATE_CREATE';
    const sortOrder = filterDto.sortOrder?.toLowerCase() === 'asc' ? 'asc' : 'desc';
    const order = {
      [sortBy]: sortOrder,
    };

    try {
      const response = await this.bitrix24Service.getLeads({
        start,
        filter,
        select,
        order,
      });

      const leads = response.result || [];
      const leadIds = leads.map((lead) => lead.ID);

      // Lấy thông tin chi tiết bằng batch nếu có leads
      let detailedLeads = leads;
      if (leadIds.length > 0) {
        try {
          detailedLeads = await this.bitrix24Service.getLeadsDetails(leadIds);
          
          // Lấy user names để hiển thị
          const userIds = [
            ...new Set([
              ...leads.map((l) => l.ASSIGNED_BY_ID).filter(Boolean),
              ...leads.map((l) => l.CREATED_BY_ID).filter(Boolean),
            ]),
          ];
          
          if (userIds.length > 0) {
            const userNames = await this.bitrix24Service.getUserNames(userIds);
            // Gắn user names vào leads
            detailedLeads = detailedLeads.map((lead) => ({
              ...lead,
              ASSIGNED_BY_NAME: userNames[lead.ASSIGNED_BY_ID] || lead.ASSIGNED_BY_ID,
              CREATED_BY_NAME: userNames[lead.CREATED_BY_ID] || lead.CREATED_BY_ID,
            }));
          }
        } catch (batchError) {
          this.logger.warn('Error getting leads details via batch, using list data', batchError);
          // Fallback to list data nếu batch fail
        }
      }

      const totalItems = response.total || 0;
      const totalPages = Math.ceil(totalItems / limit);

      return {
        leads: detailedLeads,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        sort: {
          sortBy,
          sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
        },
      };
    } catch (error) {
      this.logger.error('Error getting leads with pagination', error);
      throw error;
    }
  }
}

