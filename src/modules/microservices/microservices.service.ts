import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class MicroservicesService {
  private readonly logger = new Logger(MicroservicesService.name);

  constructor(
    @Inject('RABBITMQ_SERVICE') private rabbitmqClient: ClientProxy,
    @Inject('KAFKA_SERVICE') private kafkaClient: ClientProxy,
    @Inject('NATS_SERVICE') private natsClient: ClientProxy,
  ) {}

  async emitEvent(
    pattern: string,
    data: any,
    transport: 'rabbitmq' | 'kafka' | 'nats' = 'rabbitmq',
  ) {
    const client = this.getClient(transport);
    client.emit(pattern, data);
    this.logger.log(`Event emitted: ${pattern} via ${transport}`);
  }

  async sendMessage(
    pattern: string,
    data: any,
    transport: 'rabbitmq' | 'kafka' | 'nats' = 'rabbitmq',
  ) {
    const client = this.getClient(transport);
    return client.send(pattern, data).toPromise();
  }

  private getClient(transport: 'rabbitmq' | 'kafka' | 'nats'): ClientProxy {
    switch (transport) {
      case 'rabbitmq':
        return this.rabbitmqClient;
      case 'kafka':
        return this.kafkaClient;
      case 'nats':
        return this.natsClient;
      default:
        return this.rabbitmqClient;
    }
  }
}
