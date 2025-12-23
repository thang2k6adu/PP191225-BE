/**
 * User state machine for matchmaking
 */
export enum UserState {
  /** User is not in matchmaking or room */
  IDLE = 'IDLE',

  /** User is waiting in matchmaking queue */
  WAITING = 'WAITING',

  /** User is matched and in a room */
  IN_ROOM = 'IN_ROOM',
}
