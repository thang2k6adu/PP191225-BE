import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MicroservicesController } from './microservices.controller';
import { MicroservicesService } from './microservices.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'RABBITMQ_SERVICE',
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get<string>('rabbitmq.url') || 'amqp://localhost:5672'],
            queue: configService.get<string>('rabbitmq.queue') || 'nestjs_queue',
            queueOptions: {
              durable: true,
            },
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'KAFKA_SERVICE',
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: 'nestjs-client',
              brokers: [configService.get<string>('kafka.broker') || 'localhost:9092'],
            },
            consumer: {
              groupId: 'nestjs-consumer',
            },
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'NATS_SERVICE',
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          transport: Transport.NATS,
          options: {
            url: configService.get<string>('nats.url') || 'nats://localhost:4222',
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [MicroservicesController],
  providers: [MicroservicesService],
  exports: [ClientsModule, MicroservicesService],
})
export class MicroservicesModule {}
