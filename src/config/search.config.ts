import { registerAs } from '@nestjs/config';

export default registerAs('search', () => ({
  provider: process.env.SEARCH_PROVIDER || 'elasticsearch', // 'elasticsearch' | 'algolia'
  elasticsearch: {
    node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD,
  },
  algolia: {
    appId: process.env.ALGOLIA_APP_ID,
    apiKey: process.env.ALGOLIA_API_KEY,
    indexName: process.env.ALGOLIA_INDEX_NAME,
  },
}));
