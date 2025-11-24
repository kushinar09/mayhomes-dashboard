import { Controller, Get, Query, Render } from '@nestjs/common';
import { DealsService } from './deals.service';
import { DealFilterDto } from './dto/deal-filter.dto';

@Controller('deals')
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Get()
  @Render('deals/index')
  async getDeals(@Query() filterDto: DealFilterDto) {
    try {
      const result = await this.dealsService.getDealsWithPagination(filterDto);
      return {
        deals: result.deals,
        pagination: result.pagination,
        sort: result.sort,
        filters: {
          dateFrom: filterDto.dateFrom || '',
          dateTo: filterDto.dateTo || '',
          stageId: filterDto.stageId || '',
          categoryId: filterDto.categoryId || '',
          search: filterDto.search || '',
        },
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        deals: [],
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
          stageId: filterDto.stageId || '',
          categoryId: filterDto.categoryId || '',
          search: filterDto.search || '',
        },
        error: errorMessage,
      };
    }
  }
}
