import { Controller, Get, Query, Render } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadFilterDto } from './dto/lead-filter.dto';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  @Render('leads/index')
  async getLeads(@Query() filterDto: LeadFilterDto) {
    try {
      const result = await this.leadsService.getLeadsWithPagination(filterDto);
      return {
        leads: result.leads,
        pagination: result.pagination,
        sort: result.sort,
        filters: {
          dateFrom: filterDto.dateFrom || '',
          dateTo: filterDto.dateTo || '',
          statusId: filterDto.statusId || '',
          sourceId: filterDto.sourceId || '',
          search: filterDto.search || '',
        },
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
          statusId: filterDto.statusId || '',
          sourceId: filterDto.sourceId || '',
          search: filterDto.search || '',
        },
        error: errorMessage,
      };
    }
  }
}

