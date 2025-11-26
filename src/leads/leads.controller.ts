import { Controller, Get, Query, Render } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadFilterDto } from './dto/lead-filter.dto';
import { Bitrix24Service } from '../bitrix24/bitrix24.service';

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly bitrix24Service: Bitrix24Service,
  ) {}

  @Get()
  @Render('leads/index')
  async getLeads(@Query() filterDto: LeadFilterDto) {
    try {
      // Lấy danh sách status và source names để hiển thị trong dropdown
      const [statusNames, sourceNames] = await Promise.all([
        this.bitrix24Service.getLeadStatusNames(),
        this.bitrix24Service.getLeadSourceNames(),
      ]);

      const result = await this.leadsService.getLeadsWithPagination(filterDto);
      return {
        leads: result.leads,
        pagination: result.pagination,
        sort: result.sort,
        filters: {
          dateFrom: filterDto.dateFrom || '',
          dateTo: filterDto.dateTo || '',
          statusName: filterDto.statusName || '',
          sourceName: filterDto.sourceName || '',
          search: filterDto.search || '',
        },
        statusNames: Object.values(statusNames).sort(),
        sourceNames: Object.values(sourceNames).sort(),
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        leads: [],
        pagination: {
          currentPage: 1,
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: 50,
        },
        sort: {
          sortBy: filterDto.sortBy || 'DATE_CREATE',
          sortOrder: filterDto.sortOrder || 'DESC',
        },
        filters: {
          dateFrom: filterDto.dateFrom || '',
          dateTo: filterDto.dateTo || '',
          statusName: filterDto.statusName || '',
          sourceName: filterDto.sourceName || '',
          search: filterDto.search || '',
        },
        statusNames: [],
        sourceNames: [],
        error: errorMessage,
      };
    }
  }
}

