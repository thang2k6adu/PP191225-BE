import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { FirebaseLoginDto } from './dto/firebase-login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { Public } from '@/common/decorators/public.decorator';
import {
  FirebaseLoginResponse,
  RefreshTokenResponse,
} from '@/common/interfaces/api-response.interface';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('firebase/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with Firebase ID token',
    description:
      'Login using Firebase ID token. deviceId and platform are optional and can be omitted for testing.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login success',
    schema: {
      example: {
        error: false,
        code: 200,
        message: 'Login success',
        data: {
          user: {
            id: 'user_123',
            email: 'test@gmail.com',
            firstName: 'Nguyen Van',
            lastName: 'A',
            avatar: 'https://avatar.url',
            role: 'user',
          },
          tokens: {
            accessToken: 'ACCESS_TOKEN_JWT',
            refreshToken: 'REFRESH_TOKEN',
            expiresIn: 900,
          },
        },
        traceId: 'VIHOLaKaWe',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Firebase token expired',
    schema: {
      example: {
        error: true,
        code: 401,
        message: 'Firebase token expired',
        data: null,
        traceId: 'ASD123QWE',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Invalid token or user disabled',
    schema: {
      example: {
        error: true,
        code: 403,
        message: 'Invalid token!',
        data: null,
        traceId: 'VIHOLaKaWe',
      },
    },
  })
  async firebaseLogin(@Body() firebaseLoginDto: FirebaseLoginDto): Promise<FirebaseLoginResponse> {
    return this.authService.firebaseLogin(firebaseLoginDto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'Refresh success',
    schema: {
      example: {
        error: false,
        code: 200,
        message: 'Refresh success',
        data: {
          accessToken: 'NEW_ACCESS_TOKEN',
          expiresIn: 900,
        },
        traceId: 'REFRESH112',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid refresh token',
  })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto): Promise<RefreshTokenResponse> {
    return this.authService.refreshToken(refreshTokenDto.refreshToken);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset link' })
  @ApiResponse({
    status: 200,
    description: 'Password reset request processed successfully',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Success',
        data: {
          message: 'If an account with this email exists, a password reset link has been sent.',
        },
        traceId: 'VIHOLaKaWe',
      },
    },
  })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto): Promise<{ message: string }> {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Public()
  @Post('send-verification-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request email verification link' })
  @ApiResponse({
    status: 200,
    description: 'Email verification request processed successfully',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Success',
        data: {
          message: 'Verification email sent successfully.',
        },
        traceId: 'VERIFYMAIL',
      },
    },
  })
  async sendVerificationEmail(
    @Body() verifyEmailDto: VerifyEmailDto,
  ): Promise<{ message: string }> {
    return this.authService.sendVerificationEmail(verifyEmailDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged out',
  })
  async logout(
    @CurrentUser() user: any,
    @Body() body?: { refreshToken?: string },
  ): Promise<{ message: string }> {
    await this.authService.logout(user.id, body?.refreshToken);
    return { message: 'Logged out successfully' };
  }
}
