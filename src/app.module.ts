import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER, APP_PIPE } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { redisStore } from 'cache-manager-redis-yet';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { HealthModule } from './modules/health/health.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { QueuesModule } from './modules/queues/queues.module';
import { EventsModule } from './modules/events/events.module';
import { MailModule } from './modules/mail/mail.module';
import { StorageModule } from './modules/storage/storage.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WebSocketModule } from './modules/websocket/websocket.module';
import { SearchModule } from './modules/search/search.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { MicroservicesModule } from './modules/microservices/microservices.module';
import { ExpModule } from './modules/exp/exp.module';
import { PrismaService } from './database/prisma.service';
import { DatabaseService } from './database/database.service';
import { CacheService } from './common/services/cache.service';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import firebaseConfig from './config/firebase.config';
import { validate } from './config/config.schema';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ValidationPipe } from './common/pipes/validation.pipe';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, redisConfig, firebaseConfig],
      validate,
      envFilePath: ['.env.local', '.env'],
    }),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisHost = configService.get<string>('redis.host');
        const redisPort = configService.get<number>('redis.port');
        const redisPassword = configService.get<string>('redis.password');
        const redisTls = configService.get<boolean>('redis.tls');

        const socketOptions: any = {
          host: redisHost,
          port: redisPort,
          reconnectStrategy: (retries: number) => {
            if (retries > 10) {
              console.error('Redis connection failed after 10 retries');
              return new Error('Redis connection failed');
            }
            const delay = Math.min(retries * 100, 3000);
            console.log(`Retrying Redis connection (attempt ${retries}) in ${delay}ms...`);
            return delay;
          },
        };

        if (redisTls) {
          socketOptions.tls = true;
        }

        try {
          const store = await redisStore({
            socket: socketOptions,
            password: redisPassword || undefined,
            ttl: 60000, // Default TTL: 60 seconds
          });

          // Handle connection errors
          const client = (store as any).client;
          if (client) {
            client.on('error', (err: Error) => {
              console.error('Redis connection error:', err.message);
            });
            client.on('connect', () => {
              console.log('✅ Redis cache connected');
            });
            client.on('reconnecting', () => {
              console.log('🔄 Redis reconnecting...');
            });
          }

          return { store, ttl: 60000 };
        } catch (error) {
          console.error('Failed to initialize Redis store:', error.message);
          throw error;
        }
      },
      inject: [ConfigService],
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => [
        {
          ttl: 60000, // 1 minute
          limit: 100, // 100 requests per minute
        },
      ],
      inject: [ConfigService],
    }),
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('app.nodeEnv');
        const isProduction = nodeEnv === 'production';

        return {
          level: isProduction ? 'info' : 'debug',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json(),
          ),
          defaultMeta: { service: 'nest-boilerplate' },
          transports: [
            new winston.transports.Console({
              format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
            }),
            new winston.transports.File({
              filename: 'logs/error.log',
              level: 'error',
            }),
            new winston.transports.File({
              filename: 'logs/combined.log',
            }),
          ],
        };
      },
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    HealthModule,
    TasksModule,
    RoomsModule,
    QueuesModule,
    EventsModule,
    MailModule,
    StorageModule,
    NotificationsModule,
    WebSocketModule,
    SearchModule,
    MonitoringModule,
    MicroservicesModule,
    ExpModule,
  ],
  providers: [
    PrismaService,
    DatabaseService,
    CacheService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
