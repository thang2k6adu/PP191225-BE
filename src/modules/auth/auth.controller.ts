import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { FirebaseLoginDto } from './dto/firebase-login.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { Public } from '@/common/decorators/public.decorator';
import {
  AuthResponse,
  FirebaseLoginResponse,
  RefreshTokenResponse,
} from '@/common/interfaces/api-response.interface';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Success',
        data: {
          user: {
            id: 'user_123',
            email: 'test@example.com',
            firstName: 'John',
            lastName: 'Doe',
            role: 'USER',
          },
          tokens: {
            accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            expiresIn: 7200,
          },
        },
        traceId: 'VIHOLaKaWe',
      },
    },
  })
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(registerDto);
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged in',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Success',
        data: {
          user: {
            id: 'user_123',
            email: 'test@example.com',
            firstName: 'John',
            lastName: 'Doe',
            role: 'USER',
          },
          tokens: {
            accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            expiresIn: 7200,
          },
        },
        traceId: 'VIHOLaKaWe',
      },
    },
  })
  async login(@Body() loginDto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(loginDto);
  }

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
