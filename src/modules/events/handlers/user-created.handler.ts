import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { OnEvent } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';

export class UserCreatedEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
  ) {}
}

@Injectable()
@EventsHandler(UserCreatedEvent)
export class UserCreatedHandler implements IEventHandler<UserCreatedEvent> {
  private readonly logger = new Logger(UserCreatedHandler.name);

  @OnEvent('user.created')
  handle(event: UserCreatedEvent) {
    this.logger.log(`User created: ${event.userId} - ${event.email}`);
    // Handle user created event
    // e.g., send welcome email, create default settings, etc.
  }
}
