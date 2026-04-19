import { QueryTasksDto } from '@/modules/tasks/dto/query-tasks.dto';
import { QueryTaskStatsDto } from '@/modules/tasks/dto/query-task-stats.dto';
import { QueryUsersDto } from '@/modules/users/dto/query-users.dto';

function normalize(value: string | number | boolean | null | undefined): string {
  if (value === undefined || value === null || value === '') {
    return 'all';
  }

  return String(value).trim().toLowerCase();
}

export const CacheKeys = {
  users: {
    profile: (userId: string) => `user:profile:${userId}`,
    detail: (userId: string) => `user:detail:${userId}`,
    list: (query: QueryUsersDto) =>
      `user:list:page:${normalize(query.page)}:limit:${normalize(query.limit)}:search:${normalize(
        query.search,
      )}`,
    listPattern: () => 'user:list:*',
  },
  tasks: {
    active: (userId: string) => `task:active:${userId}`,
    detail: (userId: string, taskId: string) => `task:detail:${userId}:${taskId}`,
    list: (userId: string, query: QueryTasksDto) =>
      `task:list:user:${userId}:page:${normalize(query.page)}:limit:${normalize(
        query.limit,
      )}:status:${normalize(query.status)}:isActive:${normalize(query.isActive)}:search:${normalize(
        query.search,
      )}`,
    stats: (userId: string, query: QueryTaskStatsDto) =>
      `task:stats:user:${userId}:period:${normalize(query.period)}:anchor:${normalize(query.anchorDate)}`,
    listPattern: (userId: string) => `task:list:user:${userId}:*`,
    detailPattern: (userId: string) => `task:detail:${userId}:*`,
    statsPattern: (userId: string) => `task:stats:user:${userId}:*`,
  },
};

export const CacheTTL = {
  userProfile: 10 * 60 * 1000,
  userDetail: 10 * 60 * 1000,
  userList: 5 * 60 * 1000,
  taskActive: 60 * 1000,
  taskDetail: 3 * 60 * 1000,
  taskList: 2 * 60 * 1000,
  taskStats: 2 * 60 * 1000,
  default: 5 * 60 * 1000,
};
