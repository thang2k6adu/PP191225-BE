import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Search across indices' })
  async search(
    @Query('q') query: string,
    @Query('index') index: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.searchService.search({
      index,
      query,
      page: page ? parseInt(page.toString(), 10) : 1,
      limit: limit ? parseInt(limit.toString(), 10) : 10,
    });
  }
}
