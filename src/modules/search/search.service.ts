import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';

export interface SearchOptions {
  index: string;
  query: string;
  filters?: Record<string, any>;
  page?: number;
  limit?: number;
}

export interface SearchResult<T = any> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private client: Client;

  constructor(private configService: ConfigService) {
    const node = this.configService.get<string>('search.elasticsearch.node');
    const username = this.configService.get<string>('search.elasticsearch.username');
    const password = this.configService.get<string>('search.elasticsearch.password');

    this.client = new Client({
      node,
      auth:
        username && password
          ? {
              username,
              password,
            }
          : undefined,
    });
  }

  async search<T = any>(options: SearchOptions): Promise<SearchResult<T>> {
    const { index, query, filters, page = 1, limit = 10 } = options;
    const from = (page - 1) * limit;

    try {
      const response = await this.client.search({
        index,
        body: {
          query: {
            bool: {
              must: [
                {
                  multi_match: {
                    query,
                    fields: ['*'],
                    fuzziness: 'AUTO',
                  },
                },
              ],
              filter: filters
                ? Object.entries(filters).map(([key, value]) => ({
                    term: { [key]: value },
                  }))
                : [],
            },
          },
          from,
          size: limit,
        },
      });

      const items = response.hits.hits.map((hit) => hit._source as T);
      const total = response.hits.total as number;

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error(`Search failed: ${error.message}`);
      throw error;
    }
  }

  async indexDocument(index: string, id: string, document: any): Promise<void> {
    try {
      await this.client.index({
        index,
        id,
        body: document,
      });
      this.logger.log(`Document indexed: ${index}/${id}`);
    } catch (error) {
      this.logger.error(`Failed to index document: ${error.message}`);
      throw error;
    }
  }

  async deleteDocument(index: string, id: string): Promise<void> {
    try {
      await this.client.delete({
        index,
        id,
      });
      this.logger.log(`Document deleted: ${index}/${id}`);
    } catch (error) {
      this.logger.error(`Failed to delete document: ${error.message}`);
      throw error;
    }
  }

  async createIndex(index: string, mapping?: any): Promise<void> {
    try {
      const exists = await this.client.indices.exists({ index });
      if (!exists) {
        await this.client.indices.create({
          index,
          body: {
            mappings: mapping || {},
          },
        });
        this.logger.log(`Index created: ${index}`);
      }
    } catch (error) {
      this.logger.error(`Failed to create index: ${error.message}`);
      throw error;
    }
  }
}
