import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { FirebaseLoginDto } from './dto/firebase-login.dto';
import { AuthResponse, FirebaseLoginResponse } from '@/common/interfaces/api-response.interface';
import { FirebaseService } from './services/firebase.service';
import * as admin from 'firebase-admin';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private firebaseService: FirebaseService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      return null;
    }

    // Firebase users don't have password
    if (!user.password) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...result } = user;
    return result;
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user);
  }

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        password: hashedPassword,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });

    return this.generateTokens(user);
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    try {
      await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      const tokenRecord = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true },
      });

      if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      const user = tokenRecord.user;
      if (!user.isActive) {
        throw new UnauthorizedException('User is inactive');
      }

      // Delete old refresh token
      await this.prisma.refreshToken.delete({
        where: { id: tokenRecord.id },
      });

      const tokens = await this.generateTokens({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
      });

      return {
        accessToken: tokens.tokens.accessToken,
        expiresIn: tokens.tokens.expiresIn,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async firebaseLogin(firebaseLoginDto: FirebaseLoginDto): Promise<FirebaseLoginResponse> {
    // Extract optional device info for future multi-device management
    const { idToken, deviceId, platform } = firebaseLoginDto;

    // Log device info if provided (for debugging/testing)
    if (deviceId || platform) {
      console.log('[Firebase Login] Device info:', { deviceId, platform });
    }

    // Verify Firebase ID token
    let decodedToken: admin.auth.DecodedIdToken;
    try {
      decodedToken = await this.firebaseService.verifyIdToken(idToken);
    } catch (error: any) {
      if (error.message === 'Firebase token expired') {
        throw new UnauthorizedException('Firebase token expired');
      }
      throw new UnauthorizedException('Invalid token!');
    }

    const firebaseUid = decodedToken.uid;
    const email = decodedToken.email;
    const name = decodedToken.name || decodedToken.display_name || null;
    const avatar = decodedToken.picture || decodedToken.avatar_url || null;

    if (!email) {
      throw new UnauthorizedException('Email is required');
    }

    // TODO: In the future, store deviceId and platform in Device table for:
    // - Multi-device management
    // - Revoke refresh token by device
    // - Audit login history
    // Example: await this.deviceService.createOrUpdate(userId, deviceId, platform);

    // Check if user exists by firebaseUid or email
    let existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firebaseUid: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        isActive: true,
      },
    } as any);

    // If not found by email, try firebaseUid
    if (!existingUser && firebaseUid) {
      existingUser = await (this.prisma.user.findFirst as any)({
        where: {
          firebaseUid: firebaseUid,
        },
        select: {
          id: true,
          email: true,
          firebaseUid: true,
          firstName: true,
          lastName: true,
          avatar: true,
          role: true,
          isActive: true,
        },
      });
    }

    const userSelect = {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatar: true,
      role: true,
      isActive: true,
    };

    // If user doesn't exist, create new user
    let user: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      avatar: string | null;
      role: string;
      isActive: boolean;
    };

    if (!existingUser) {
      user = await (this.prisma.user.create as any)({
        data: {
          email,
          firebaseUid,
          firstName: name?.split(' ')[0] || null,
          lastName: name?.split(' ').slice(1).join(' ') || null,
          avatar,
          password: null, // Firebase users don't have password
        },
        select: userSelect,
      });
    } else {
      // Update user if firebaseUid is missing or update lastLogin
      const updateData: any = {
        lastLogin: new Date(),
      };

      const userWithFirebase = existingUser as typeof existingUser & {
        firebaseUid: string | null;
        avatar: string | null;
      };

      if (!userWithFirebase.firebaseUid) {
        updateData.firebaseUid = firebaseUid;
      }

      if (avatar && !userWithFirebase.avatar) {
        updateData.avatar = avatar;
      }

      if (name && (!existingUser.firstName || !existingUser.lastName)) {
        const nameParts = name.split(' ');
        updateData.firstName = nameParts[0] || existingUser.firstName;
        updateData.lastName = nameParts.slice(1).join(' ') || existingUser.lastName;
      }

      user = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: updateData,
        select: userSelect,
      });
    }

    // Check if user is active
    if (!user.isActive) {
      throw new ForbiddenException('User is disabled');
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        avatar: user.avatar || undefined,
        role: user.role,
      },
      tokens: {
        accessToken: tokens.tokens.accessToken,
        refreshToken: tokens.tokens.refreshToken,
        expiresIn: tokens.tokens.expiresIn,
      },
    };
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await this.prisma.refreshToken.deleteMany({
        where: {
          userId,
          token: refreshToken,
        },
      });
    } else {
      await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });
    }
  }

  private async generateTokens(user: any): Promise<AuthResponse> {
    const payload = {
      sub: user.id,
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>('jwt.expiresIn'),
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
    });

    const expiresIn = this.configService.get<string>('jwt.expiresIn');
    const expiresInSeconds = this.parseExpiresIn(expiresIn);

    // Store refresh token in database
    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(
          Date.now() +
            this.parseExpiresIn(this.configService.get<string>('jwt.refreshExpiresIn')) * 1000,
        ),
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        avatar: user.avatar || undefined,
        role: user.role,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: expiresInSeconds,
      },
    };
  }

  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 7200; // Default 2 hours
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 7200;
    }
  }
}
