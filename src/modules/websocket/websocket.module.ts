import { Module } from '@nestjs/common';
import { AppWebSocketGateway } from './websocket.gateway';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AppWebSocketGateway],
  exports: [AppWebSocketGateway],
})
export class WebSocketModule {}
