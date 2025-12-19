import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('storage')
@ApiBearerAuth()
@Controller('storage')
@UseGuards(JwtAuthGuard)
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
        folder: {
          type: 'string',
        },
      },
    },
  })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder?: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @CurrentUser() _user?: any,
  ) {
    return this.storageService.uploadFile({
      file,
      folder,
    });
  }

  @Get('signed-url/:key')
  @ApiOperation({ summary: 'Get signed URL for file' })
  async getSignedUrl(@Param('key') key: string, @Query('expiresIn') expiresIn?: number) {
    return {
      url: await this.storageService.getSignedUrl(key, expiresIn),
    };
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Delete a file' })
  async deleteFile(@Param('key') key: string) {
    await this.storageService.deleteFile(key);
    return { message: 'File deleted successfully' };
  }
}
