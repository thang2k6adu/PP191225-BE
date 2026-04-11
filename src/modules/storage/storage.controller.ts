import {
  Controller,
  Post,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('storage')
@ApiBearerAuth()
@Controller('storage')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        type: {
          type: 'string',
          enum: ['avatar', 'image', 'file'],
          description: 'Type of the file to determine upload directory',
        },
      },
    },
  })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: string,
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const allowedTypes = ['avatar', 'image', 'file'];
    if (!allowedTypes.includes(type)) {
      throw new BadRequestException('Invalid upload type. Must be avatar, image, or file');
    }

    // Map type to folder structure
    const folderMap: Record<string, string> = {
      avatar: 'avatars',
      image: 'images',
      file: 'files',
    };

    const userId = user?.id || 'anonymous';
    const folder = `${folderMap[type]}/${userId}`;

    return this.storageService.uploadFile({
      file,
      folder,
      userId: user?.id,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a file by ID' })
  async deleteFile(@Param('id') id: string, @CurrentUser() user: any) {
    await this.storageService.deleteFile(id, user);
    return { message: 'File deleted successfully' };
  }
}
