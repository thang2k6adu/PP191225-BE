import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class SocketIoAdapter extends IoAdapter {
  constructor(
    private app: INestApplicationContext,
    private configService: ConfigService,
  ) {
    super(app);
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

    return super.createIOServer(port, serverOptions);
  }
}
