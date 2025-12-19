import { Controller, Get, Post, Param, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get user notifications' })
  async getNotifications(@CurrentUser() user: any, @Query('limit') limit?: number) {
    return this.notificationsService.getUserNotifications(user.id, limit);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  async markAsRead(@Param('id') id: string, @CurrentUser() user: any) {
    await this.notificationsService.markAsRead(id, user.id);
    return { message: 'Notification marked as read' };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@CurrentUser() user: any) {
    await this.notificationsService.markAllAsRead(user.id);
    return { message: 'All notifications marked as read' };
  }
}
