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
    'STATUS_NAME',
    'SOURCE_ID',
    'SOURCE_NAME',
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

    // Lấy status names và source names để convert Name sang ID
    const [statusNames, sourceNames] = await Promise.all([
      this.bitrix24Service.getLeadStatusNames(),
      this.bitrix24Service.getLeadSourceNames(),
    ]);

    // Convert statusName và sourceName sang ID bằng reverse lookup
    let statusId: string | undefined;
    if (filterDto.statusName) {
      const statusEntry = Object.entries(statusNames).find(
        ([, name]) => name === filterDto.statusName,
      );
      statusId = statusEntry ? statusEntry[0] : undefined;
      if (!statusId) {
        this.logger.warn(
          `Status name "${filterDto.statusName}" not found in status names`,
        );
      }
    }

    let sourceId: string | undefined;
    if (filterDto.sourceName) {
      const sourceEntry = Object.entries(sourceNames).find(
        ([, name]) => name === filterDto.sourceName,
      );
      sourceId = sourceEntry ? sourceEntry[0] : undefined;
      if (!sourceId) {
        this.logger.warn(
          `Source name "${filterDto.sourceName}" not found in source names`,
        );
      }
    }

    // Build filter từ DTO với ID đã convert
    const filter = this.bitrix24Service.buildLeadFilter({
      dateFrom: filterDto.dateFrom,
      dateTo: filterDto.dateTo,
      statusId,
      sourceId,
      search: filterDto.search,
    });

    // Select các trường cần thiết - đọc từ env hoặc dùng default
    const selectFieldsConfig = this.configService.get<string>('BITRIX24_LEAD_SELECT_FIELDS');
    const select = selectFieldsConfig
      ? selectFieldsConfig.split(',').map((field) => field.trim()).filter(Boolean)
      : this.defaultSelectFields;

    // Order by sortBy hoặc mặc định DATE_CREATE desc
    // Bitrix24 yêu cầu: asc hoặc desc (lowercase)
    // Map STATUS_NAME và SOURCE_NAME về STATUS_ID và SOURCE_ID để sort
    let sortBy = filterDto.sortBy || 'DATE_CREATE';
    const sortOrder = filterDto.sortOrder?.toLowerCase() === 'asc' ? 'asc' : 'desc';
    
    // Map NAME fields về ID fields cho Bitrix24 API sorting
    const sortByMapping: Record<string, string> = {
      'STATUS_NAME': 'STATUS_ID',
      'SOURCE_NAME': 'SOURCE_ID',
    };
    const apiSortBy = sortByMapping[sortBy] || sortBy;
    
    const order = {
      [apiSortBy]: sortOrder,
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
          
          // Lấy user names để hiển thị (reuse statusNames và sourceNames đã lấy ở trên)
          const userNamesPromise = userIds.length > 0 
            ? this.bitrix24Service.getUserNames(userIds) 
            : Promise.resolve({} as Record<string, string>);
          
          const userNames = await userNamesPromise;

          // Gắn user names, status names và source names vào leads
          detailedLeads = detailedLeads.map((lead) => {
            const leadData = lead as Bitrix24Lead;
            return {
              ...leadData,
              ASSIGNED_BY_NAME: userNames[leadData.ASSIGNED_BY_ID] || leadData.ASSIGNED_BY_ID,
              CREATED_BY_NAME: userNames[leadData.CREATED_BY_ID] || leadData.CREATED_BY_ID,
              STATUS_NAME: statusNames[leadData.STATUS_ID] || leadData.STATUS_NAME,
              SOURCE_NAME: sourceNames[leadData.SOURCE_ID as string] || leadData.SOURCE_NAME,
            };
          });
        } catch (batchError) {
          this.logger.warn('Error getting leads details via batch, using list data', batchError);
          // Fallback to list data nếu batch fail
        }
      }

      // Nếu sort theo NAME, cần sort client-side sau khi lấy data
      let finalLeads = detailedLeads;
      if (sortBy === 'STATUS_NAME' || sortBy === 'SOURCE_NAME') {
        finalLeads = [...detailedLeads].sort((a, b) => {
          const aValue = (a[sortBy] as string || '').toLowerCase();
          const bValue = (b[sortBy] as string || '').toLowerCase();
          const comparison = aValue.localeCompare(bValue, 'vi');
          return sortOrder === 'asc' ? comparison : -comparison;
        });
      }


      const totalItems = response.total || 0;
      const totalPages = Math.ceil(totalItems / limit);

      return {
        leads: finalLeads,
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

