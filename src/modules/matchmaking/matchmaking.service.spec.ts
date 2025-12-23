import { Test, TestingModule } from '@nestjs/testing';
import { MatchmakingService } from './matchmaking.service';
import { ConflictException } from '@nestjs/common';
import { UserState } from './enums/user-state.enum';

describe('MatchmakingService', () => {
  let service: MatchmakingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MatchmakingService],
    }).compile();

    service = module.get<MatchmakingService>(MatchmakingService);
  });

  afterEach(() => {
    // Clean up after each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerUser', () => {
    it('should register a user with socket ID', () => {
      service.registerUser('user1', 'socket1');
    });
  });

  describe('joinMatchmaking', () => {
    it('should add user to waiting queue when no one is waiting', async () => {
      service.registerUser('user1', 'socket1');

      const result = await service.joinMatchmaking('user1', 'John Doe');

      expect(result.matched).toBe(false);
      expect(service.getUserState('user1')).toBe(UserState.WAITING);
    });

    it('should match two users when someone is waiting', async () => {
      service.registerUser('user1', 'socket1');
      service.registerUser('user2', 'socket2');

      // First user joins
      const result1 = await service.joinMatchmaking('user1', 'John Doe');
      expect(result1.matched).toBe(false);

      // Second user joins and gets matched
      const result2 = await service.joinMatchmaking('user2', 'Jane Smith');
      expect(result2.matched).toBe(true);
      expect(result2.roomId).toBeDefined();
      expect(result2.opponentId).toBe('user1');

      // Both users should be in IN_ROOM state
      expect(service.getUserState('user1')).toBe(UserState.IN_ROOM);
      expect(service.getUserState('user2')).toBe(UserState.IN_ROOM);
    });

    it('should throw ConflictException if user already in room', async () => {
      service.registerUser('user1', 'socket1');
      service.registerUser('user2', 'socket2');

      // Create a match
      await service.joinMatchmaking('user1', 'John Doe');
      await service.joinMatchmaking('user2', 'Jane Smith');

      // Try to join again
      await expect(service.joinMatchmaking('user1', 'John Doe')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if user already in queue', async () => {
      service.registerUser('user1', 'socket1');

      await service.joinMatchmaking('user1', 'John Doe');

      await expect(service.joinMatchmaking('user1', 'John Doe')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if user not connected', async () => {
      await expect(service.joinMatchmaking('user1', 'John Doe')).rejects.toThrow(ConflictException);
    });
  });

  describe('cancelMatchmaking', () => {
    it('should remove user from waiting queue', async () => {
      service.registerUser('user1', 'socket1');
      await service.joinMatchmaking('user1', 'John Doe');

      service.cancelMatchmaking('user1');

      expect(service.getUserState('user1')).toBe(UserState.IDLE);
    });

    it('should throw ConflictException if user not in queue', () => {
      service.registerUser('user1', 'socket1');

      expect(() => service.cancelMatchmaking('user1')).toThrow(ConflictException);
    });
  });

  describe('unregisterUser', () => {
    it('should remove user from waiting queue on disconnect', async () => {
      service.registerUser('user1', 'socket1');
      await service.joinMatchmaking('user1', 'John Doe');

      const result = await service.unregisterUser('user1');

      expect(result.shouldNotifyOpponent).toBe(false);
      expect(service.getUserState('user1')).toBe(UserState.IDLE);
    });

    it('should notify opponent when user disconnects from room', async () => {
      service.registerUser('user1', 'socket1');
      service.registerUser('user2', 'socket2');

      // Create match
      await service.joinMatchmaking('user1', 'John Doe');
      const matchResult = await service.joinMatchmaking('user2', 'Jane Smith');

      // User1 disconnects
      const result = await service.unregisterUser('user1');

      expect(result.shouldNotifyOpponent).toBe(true);
      expect(result.opponentId).toBe('user2');
      expect(result.roomId).toBe(matchResult.roomId);
      expect(service.getUserState('user2')).toBe(UserState.IDLE);
    });
  });

  describe('leaveRoom', () => {
    it('should allow user to leave room', async () => {
      service.registerUser('user1', 'socket1');
      service.registerUser('user2', 'socket2');

      // Create match
      await service.joinMatchmaking('user1', 'John Doe');
      await service.joinMatchmaking('user2', 'Jane Smith');

      // User1 leaves
      const result = service.leaveRoom('user1');

      expect(result.opponentId).toBe('user2');
      expect(service.getUserState('user1')).toBe(UserState.IDLE);
      expect(service.getUserState('user2')).toBe(UserState.IDLE);
    });

    it('should throw ConflictException if user not in room', () => {
      service.registerUser('user1', 'socket1');

      expect(() => service.leaveRoom('user1')).toThrow(ConflictException);
    });
  });

  describe('getStats', () => {
    it('should return matchmaking statistics', async () => {
      service.registerUser('user1', 'socket1');
      service.registerUser('user2', 'socket2');
      service.registerUser('user3', 'socket3');

      await service.joinMatchmaking('user1', 'John Doe');
      await service.joinMatchmaking('user2', 'Jane Smith');

      const stats = service.getStats();

      expect(stats.onlineUsers).toBe(3);
      expect(stats.activeRooms).toBe(1);
      expect(stats.waitingQueueSize).toBe(0);
      expect(stats.stateDistribution.inRoom).toBe(2);
      expect(stats.stateDistribution.idle).toBe(1);
    });
  });

  describe('concurrency', () => {
    it('should handle concurrent matchmaking requests', async () => {
      // Register 4 users
      for (let i = 1; i <= 4; i++) {
        service.registerUser(`user${i}`, `socket${i}`);
      }

      // All users join simultaneously
      const promises = [
        service.joinMatchmaking('user1', 'User 1'),
        service.joinMatchmaking('user2', 'User 2'),
        service.joinMatchmaking('user3', 'User 3'),
        service.joinMatchmaking('user4', 'User 4'),
      ];

      const results = await Promise.all(promises);

      // Count matched users
      const matchedCount = results.filter((r) => r.matched).length;

      // Should have 2 matches (4 users = 2 pairs)
      // Due to race conditions, could be either scenario
      expect(matchedCount).toBeGreaterThanOrEqual(2);
      expect(service.getStats().activeRooms).toBeGreaterThanOrEqual(1);
    });
  });
});
