import { Controller, Post, Body, Inject } from '@nestjs/common';
import { ClientProxy, EventPattern, MessagePattern } from '@nestjs/microservices';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('microservices')
@Controller('microservices')
export class MicroservicesController {
  constructor(
    @Inject('RABBITMQ_SERVICE') private rabbitmqClient: ClientProxy,
    @Inject('KAFKA_SERVICE') private kafkaClient: ClientProxy,
    @Inject('NATS_SERVICE') private natsClient: ClientProxy,
  ) {}

  @Post('rabbitmq/send')
  @ApiOperation({ summary: 'Send message via RabbitMQ' })
  async sendRabbitMQ(@Body() data: any) {
    return this.rabbitmqClient.send('message', data).toPromise();
  }

  @Post('kafka/send')
  @ApiOperation({ summary: 'Send message via Kafka' })
  async sendKafka(@Body() data: any) {
    return this.kafkaClient.send('message', data).toPromise();
  }

  @Post('nats/send')
  @ApiOperation({ summary: 'Send message via NATS' })
  async sendNats(@Body() data: any) {
    return this.natsClient.send('message', data).toPromise();
  }

  @EventPattern('user.created')
  handleUserCreated(data: any) {
    console.log('User created event received:', data);
  }

  @MessagePattern('get.user')
  handleGetUser(data: { id: string }) {
    // Handle get user message
    return { id: data.id, name: 'User Name' };
  }
}
