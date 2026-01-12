import { registerAs } from '@nestjs/config';

export const PUBLIC_TOPICS = ['math', 'coding', 'english', 'pomodoro'] as const;

export type PublicTopic = (typeof PUBLIC_TOPICS)[number];

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  name: process.env.APP_NAME || 'nest-boilerplate',
  publicTopics: PUBLIC_TOPICS,
}));
