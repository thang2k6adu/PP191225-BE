import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, UnauthorizedException } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { FirebaseService } from '../src/modules/auth/services/firebase.service';
import { PrismaService } from '../src/database/prisma.service';
import * as admin from 'firebase-admin';

describe('AuthController - Firebase Login (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let firebaseService: FirebaseService;

  // Mock Firebase decoded token
  const mockDecodedToken: admin.auth.DecodedIdToken = {
    uid: 'firebase_uid_123',
    email: 'test@example.com',
    email_verified: true,
    name: 'Test User',
    picture: 'https://example.com/avatar.jpg',
    iss: 'https://securetoken.google.com/test-project',
    aud: 'test-project',
    auth_time: Math.floor(Date.now() / 1000),
    user_id: 'firebase_uid_123',
    sub: 'firebase_uid_123',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    firebase: {
      identities: {},
      sign_in_provider: 'password',
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    firebaseService = app.get<FirebaseService>(FirebaseService);

    // Clean up test data before starting
    await prisma.refreshToken.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'test@example.com',
            'existing@example.com',
            'disabled@example.com',
            'device@example.com',
            'optional@example.com',
            'optional1@example.com',
            'optional2@example.com',
            'optional3@example.com',
            'noavatar@example.com',
            'noname@example.com',
          ],
        },
      },
    });
  });

  afterEach(() => {
    // Reset all mocks after each test
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.refreshToken.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'test@example.com',
            'existing@example.com',
            'disabled@example.com',
            'device@example.com',
            'optional@example.com',
            'optional1@example.com',
            'optional2@example.com',
            'optional3@example.com',
            'noavatar@example.com',
            'noname@example.com',
          ],
        },
      },
    });
    await app.close();
  });

  describe('POST /api/auth/firebase/login', () => {
    it('should successfully login with valid Firebase token and create new user', async () => {
      // Mock Firebase service to return valid token
      jest.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue(mockDecodedToken);

      const response = await request(app.getHttpServer())
        .post('/api/auth/firebase/login')
        .send({
          idToken: 'valid_firebase_token',
        })
        .expect(200);

      expect(response.body).toHaveProperty('error', false);
      expect(response.body).toHaveProperty('code', 0);
      expect(response.body).toHaveProperty('message', 'Success');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('tokens');

      // Verify user data
      expect(response.body.data.user).toHaveProperty('id');
      expect(response.body.data.user).toHaveProperty('email', 'test@example.com');
      expect(response.body.data.user).toHaveProperty('name', 'Test User');
      expect(response.body.data.user).toHaveProperty('avatar', 'https://example.com/avatar.jpg');
      expect(response.body.data.user).toHaveProperty('role');

      // Verify tokens
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');
      expect(response.body.data.tokens).toHaveProperty('expiresIn');

      // Verify tokens are strings
      expect(typeof response.body.data.tokens.accessToken).toBe('string');
      expect(typeof response.body.data.tokens.refreshToken).toBe('string');
      expect(response.body.data.tokens.accessToken.length).toBeGreaterThan(0);
      expect(response.body.data.tokens.refreshToken.length).toBeGreaterThan(0);
    });

    it('should successfully login with existing user and update lastLogin', async () => {
      // Create existing user first
      const existingUser = await prisma.user.create({
        data: {
          email: 'existing@example.com',
          firebaseUid: 'firebase_uid_existing',
          firstName: 'Existing',
          lastName: 'User',
          isActive: true,
        } as any,
      });

      // Mock Firebase service with different token for existing user
      const existingUserToken: admin.auth.DecodedIdToken = {
        ...mockDecodedToken,
        uid: 'firebase_uid_existing',
        email: 'existing@example.com',
        name: 'Existing User Updated',
      };

      jest.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue(existingUserToken);

      const response = await request(app.getHttpServer())
        .post('/api/auth/firebase/login')
        .send({
          idToken: 'valid_firebase_token_existing',
        })
        .expect(200);

      expect(response.body).toHaveProperty('error', false);
      expect(response.body.data.user).toHaveProperty('id', existingUser.id);
      expect(response.body.data.user).toHaveProperty('email', 'existing@example.com');
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');

      // Verify user was updated
      const updatedUser = await prisma.user.findUnique({
        where: { id: existingUser.id },
      });
      expect((updatedUser as any)?.lastLogin).toBeDefined();
    });

    it('should successfully login with device info', async () => {
      const tokenWithDevice: admin.auth.DecodedIdToken = {
        ...mockDecodedToken,
        uid: 'firebase_uid_device',
        email: 'device@example.com',
      };

      jest.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue(tokenWithDevice);

      const response = await request(app.getHttpServer())
        .post('/api/auth/firebase/login')
        .send({
          idToken: 'valid_firebase_token_device',
          deviceId: 'web_chrome_123',
          platform: 'web',
        })
        .expect(200);

      expect(response.body).toHaveProperty('error', false);
      expect(response.body.data.user).toHaveProperty('email', 'device@example.com');
      expect(response.body.data.tokens).toHaveProperty('accessToken');
    });

    it('should return 401 when Firebase token is expired', async () => {
      jest
        .spyOn(firebaseService, 'verifyIdToken')
        .mockRejectedValue(new UnauthorizedException('Firebase token expired'));

      const response = await request(app.getHttpServer())
        .post('/api/auth/firebase/login')
        .send({
          idToken: 'expired_firebase_token',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error', true);
      expect(response.body).toHaveProperty('code', 401);
      expect(response.body.message).toContain('Firebase token expired');
    });

    it('should return 401 when Firebase token is invalid', async () => {
      jest
        .spyOn(firebaseService, 'verifyIdToken')
        .mockRejectedValue(new UnauthorizedException('Invalid token!'));

      const response = await request(app.getHttpServer())
        .post('/api/auth/firebase/login')
        .send({
          idToken: 'invalid_firebase_token',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error', true);
      expect(response.body.message).toContain('Invalid token');
    });

    it('should return 401 when Firebase token has no email', async () => {
      const tokenWithoutEmail: admin.auth.DecodedIdToken = {
        ...mockDecodedToken,
        email: undefined,
      };

      jest.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue(tokenWithoutEmail);

      const response = await request(app.getHttpServer())
        .post('/api/auth/firebase/login')
        .send({
          idToken: 'token_without_email',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error', true);
      expect(response.body.message).toContain('Email is required');
    });

    it('should return 403 when user is disabled', async () => {
      // Create disabled user
      await prisma.user.create({
        data: {
          email: 'disabled@example.com',
          firebaseUid: 'firebase_uid_disabled',
          firstName: 'Disabled',
          lastName: 'User',
          isActive: false,
        } as any,
      });

      const disabledUserToken: admin.auth.DecodedIdToken = {
        ...mockDecodedToken,
        uid: 'firebase_uid_disabled',
        email: 'disabled@example.com',
      };

      jest.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue(disabledUserToken);

      const response = await request(app.getHttpServer())
        .post('/api/auth/firebase/login')
        .send({
          idToken: 'valid_firebase_token_disabled',
        })
        .expect(403);

      expect(response.body).toHaveProperty('error', true);
      expect(response.body.message).toContain('disabled');
    });

    it('should return 400 when idToken is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/firebase/login')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error', true);
    });

    it('should return 400 when idToken is empty string', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/firebase/login')
        .send({
          idToken: '',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', true);
    });

    it('should handle optional deviceId and platform fields', async () => {
      // Test without device info
      const tokenOptional1: admin.auth.DecodedIdToken = {
        ...mockDecodedToken,
        uid: 'firebase_uid_optional1',
        email: 'optional1@example.com',
      };

      jest.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue(tokenOptional1);

      const response1 = await request(app.getHttpServer())
        .post('/api/auth/firebase/login')
        .send({
          idToken: 'valid_firebase_token_optional1',
        })
        .expect(200);

      expect(response1.body).toHaveProperty('error', false);

      // Test with only deviceId
      const tokenOptional2: admin.auth.DecodedIdToken = {
        ...mockDecodedToken,
        uid: 'firebase_uid_optional2',
        email: 'optional2@example.com',
      };

      jest.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue(tokenOptional2);

      const response2 = await request(app.getHttpServer())
        .post('/api/auth/firebase/login')
        .send({
          idToken: 'valid_firebase_token_optional2',
          deviceId: 'ios_device_123',
        })
        .expect(200);

      expect(response2.body).toHaveProperty('error', false);

      // Test with only platform
      const tokenOptional3: admin.auth.DecodedIdToken = {
        ...mockDecodedToken,
        uid: 'firebase_uid_optional3',
        email: 'optional3@example.com',
      };

      jest.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue(tokenOptional3);

      const response3 = await request(app.getHttpServer())
        .post('/api/auth/firebase/login')
        .send({
          idToken: 'valid_firebase_token_optional3',
          platform: 'ios',
        })
        .expect(200);

      expect(response3.body).toHaveProperty('error', false);
    });

    it('should update user avatar if missing', async () => {
      // Create user without avatar
      const userWithoutAvatar = await prisma.user.create({
        data: {
          email: 'noavatar@example.com',
          firebaseUid: 'firebase_uid_noavatar',
          firstName: 'No',
          lastName: 'Avatar',
          avatar: null,
          isActive: true,
        } as any,
      });

      const tokenWithAvatar: admin.auth.DecodedIdToken = {
        ...mockDecodedToken,
        uid: 'firebase_uid_noavatar',
        email: 'noavatar@example.com',
        picture: 'https://example.com/new-avatar.jpg',
      };

      jest.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue(tokenWithAvatar);

      const response = await request(app.getHttpServer())
        .post('/api/auth/firebase/login')
        .send({
          idToken: 'valid_firebase_token_avatar',
        })
        .expect(200);

      expect(response.body.data.user).toHaveProperty(
        'avatar',
        'https://example.com/new-avatar.jpg',
      );

      // Verify avatar was updated in database
      const updatedUser = await prisma.user.findUnique({
        where: { id: userWithoutAvatar.id },
      });
      expect((updatedUser as any)?.avatar).toBe('https://example.com/new-avatar.jpg');
    });

    it('should update user name if missing', async () => {
      // Create user without name
      const userWithoutName = await prisma.user.create({
        data: {
          email: 'noname@example.com',
          firebaseUid: 'firebase_uid_noname',
          firstName: null,
          lastName: null,
          isActive: true,
        } as any,
      });

      const tokenWithName: admin.auth.DecodedIdToken = {
        ...mockDecodedToken,
        uid: 'firebase_uid_noname',
        email: 'noname@example.com',
        name: 'John Doe',
      };

      jest.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue(tokenWithName);

      const response = await request(app.getHttpServer())
        .post('/api/auth/firebase/login')
        .send({
          idToken: 'valid_firebase_token_name',
        })
        .expect(200);

      expect(response.body.data.user).toHaveProperty('name', 'John Doe');

      // Verify name was updated in database
      const updatedUser = await prisma.user.findUnique({
        where: { id: userWithoutName.id },
      });
      expect(updatedUser?.firstName).toBe('John');
      expect(updatedUser?.lastName).toBe('Doe');
    });
  });
});
