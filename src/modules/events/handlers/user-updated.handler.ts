import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { OnEvent } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';

export class UserUpdatedEvent {
  constructor(
    public readonly userId: string,
    public readonly changes: Record<string, any>,
  ) {}
}

@Injectable()
@EventsHandler(UserUpdatedEvent)
export class UserUpdatedHandler implements IEventHandler<UserUpdatedEvent> {
  private readonly logger = new Logger(UserUpdatedHandler.name);

  @OnEvent('user.updated')
  handle(event: UserUpdatedEvent) {
    this.logger.log(`User updated: ${event.userId}`);
    // Handle user updated event
  }
}
