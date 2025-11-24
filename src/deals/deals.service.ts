import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bitrix24Service } from '../bitrix24/bitrix24.service';
import { DealFilterDto } from './dto/deal-filter.dto';
import { Bitrix24Deal } from '../bitrix24/interfaces/bitrix24-deal.interface';

export interface PaginationResult {
  deals: Bitrix24Deal[];
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
export class DealsService {
  private readonly logger = new Logger(DealsService.name);
  private readonly defaultSelectFields = [
    'ID',
    'TITLE',
    'STAGE_ID',
    'CURRENCY_ID',
    'OPPORTUNITY',
    'BEGINDATE',
    'CLOSEDATE',
    'ASSIGNED_BY_ID',
    'CREATED_BY_ID',
    'DATE_CREATE',
    'DATE_MODIFY',
  ];

  constructor(
    private readonly bitrix24Service: Bitrix24Service,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Lấy deals với pagination và filtering
   */
  async getDealsWithPagination(
    filterDto: DealFilterDto,
  ): Promise<PaginationResult> {
    const page = filterDto.page || 1;
    const limit = filterDto.limit || 50;
    const start = (page - 1) * limit;

    // Build filter từ DTO
    const filter = this.bitrix24Service.buildFilter({
      dateFrom: filterDto.dateFrom,
      dateTo: filterDto.dateTo,
      stageId: filterDto.stageId,
      categoryId: filterDto.categoryId,
      search: filterDto.search,
    });

    // Select các trường cần thiết - đọc từ env hoặc dùng default
    const selectFieldsConfig = this.configService.get<string>('BITRIX24_DEAL_SELECT_FIELDS');
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
      const response = await this.bitrix24Service.getDeals({
        start,
        filter,
        select,
        order,
      });

      const deals = response.result || [];
      const dealIds = deals.map((deal) => deal.ID);

      // Lấy thông tin chi tiết bằng batch nếu có deals
      let detailedDeals = deals;
      if (dealIds.length > 0) {
        try {
          detailedDeals = await this.bitrix24Service.getDealsDetails(dealIds);
          
          // Lấy user names để hiển thị
          const userIds = [
            ...new Set([
              ...deals.map((d) => d.ASSIGNED_BY_ID).filter(Boolean),
              ...deals.map((d) => d.CREATED_BY_ID).filter(Boolean),
            ]),
          ];
          
          if (userIds.length > 0) {
            const userNames = await this.bitrix24Service.getUserNames(userIds);
            // Gắn user names vào deals
            detailedDeals = detailedDeals.map((deal) => ({
              ...deal,
              ASSIGNED_BY_NAME: userNames[deal.ASSIGNED_BY_ID] || deal.ASSIGNED_BY_ID,
              CREATED_BY_NAME: userNames[deal.CREATED_BY_ID] || deal.CREATED_BY_ID,
            }));
          }
        } catch (batchError) {
          this.logger.warn('Error getting deals details via batch, using list data', batchError);
          // Fallback to list data nếu batch fail
        }
      }

      const totalItems = response.total || 0;
      const totalPages = Math.ceil(totalItems / limit);

      return {
        deals: detailedDeals,
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
      this.logger.error('Error getting deals with pagination', error);
      throw error;
    }
  }
}
