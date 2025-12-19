import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CqrsModule } from '@nestjs/cqrs';
import { UserCreatedHandler } from './handlers/user-created.handler';
import { UserUpdatedHandler } from './handlers/user-updated.handler';

@Module({
  imports: [EventEmitterModule.forRoot(), CqrsModule],
  providers: [UserCreatedHandler, UserUpdatedHandler],
  exports: [EventEmitterModule, CqrsModule],
})
export class EventsModule {}
