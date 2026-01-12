import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

export class SocketIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(
    private app: INestApplicationContext,
    private configService: ConfigService,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    try {
      const redisHost = this.configService.get<string>('redis.host');
      const redisPort = this.configService.get<number>('redis.port');
      const redisPassword = this.configService.get<string>('redis.password');

      const pubClient = createClient({
        socket: {
          host: redisHost,
          port: redisPort,
          reconnectStrategy: () => false, // Disable reconnection
        },
        password: redisPassword,
      });

      const subClient = pubClient.duplicate();

      // Silent error handlers
      pubClient.on('error', () => {
        // Suppress logging
      });
      subClient.on('error', () => {
        // Suppress logging
      });

      await Promise.all([pubClient.connect(), subClient.connect()]);

      this.adapterConstructor = createAdapter(pubClient, subClient);
      console.log('✅ Socket.IO Redis adapter connected');
    } catch (error) {
      console.log('⚠️  Socket.IO running without Redis adapter (single instance only)');
      // Don't throw - allow server to start without Redis
    }
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const corsOrigin =
      this.configService.get<string>('app.nodeEnv') === 'production'
        ? process.env.CORS_ORIGIN?.split(',') || []
        : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'];

    const serverOptions: ServerOptions = {
      ...options,
      cors: {
        origin: corsOrigin,
        credentials: true,
        methods: ['GET', 'POST'],
      },
    };

    const server = super.createIOServer(port, serverOptions);

    // Attach Redis adapter if connected
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }

    return server;
  }
}
