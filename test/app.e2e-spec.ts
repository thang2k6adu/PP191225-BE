import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { HealthModule } from '../src/modules/health/health.module';
import { PrismaService } from '../src/database/prisma.service';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { ConfigModule } from '@nestjs/config';
import databaseConfig from '../src/config/database.config';

describe('Health Endpoint (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [databaseConfig],
          envFilePath: ['.env.local', '.env'],
        }),
        HealthModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Set global prefix như trong main.ts
    app.setGlobalPrefix('api');

    // Add transform interceptor để wrap response
    app.useGlobalInterceptors(new TransformInterceptor());

    // Add validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
      }),
    );

    prisma = app.get<PrismaService>(PrismaService);

    await app.init();
  });

  afterAll(async () => {
    // Disconnect Prisma
    if (prisma) {
      await prisma.$disconnect();
    }

    // Close app
    if (app) {
      await app.close();
    }
  });

  it('/api/health (GET) should return health status', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);

    // Kiểm tra response format (wrapped by TransformInterceptor)
    expect(res.body).toHaveProperty('error', false);
    expect(res.body).toHaveProperty('code', 0);
    expect(res.body).toHaveProperty('message', 'Success');
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('traceId');

    // Kiểm tra data
    expect(res.body.data).toHaveProperty('status', 'ok');
    expect(res.body.data).toHaveProperty('timestamp');
    expect(res.body.data).toHaveProperty('uptime');
    expect(res.body.data).toHaveProperty('database');

    // Database phải connected (hoặc disconnected nếu DB không chạy)
    expect(['connected', 'disconnected']).toContain(res.body.data.database);
  });
});
