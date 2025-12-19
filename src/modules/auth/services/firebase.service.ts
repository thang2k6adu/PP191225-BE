import { Injectable, UnauthorizedException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private firebaseApp: admin.app.App;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const projectId = this.configService.get<string>('firebase.projectId');
    const clientEmail = this.configService.get<string>('firebase.clientEmail');
    const privateKey = this.configService.get<string>('firebase.privateKey');

    // Only initialize if credentials are provided
    if (projectId && clientEmail && privateKey) {
      try {
        // Check if Firebase app is already initialized
        const existingApp = admin.apps.find((app) => app?.name === '[DEFAULT]');
        if (existingApp) {
          this.firebaseApp = existingApp;
        } else {
          this.firebaseApp = admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              clientEmail,
              privateKey,
            }),
          });
        }
      } catch (error) {
        console.error('Failed to initialize Firebase Admin SDK:', error);
      }
    }
  }

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    if (!this.firebaseApp) {
      throw new UnauthorizedException('Firebase is not configured');
    }

    try {
      const decodedToken = await this.firebaseApp.auth().verifyIdToken(idToken);
      return decodedToken;
    } catch (error: any) {
      if (error.code === 'auth/id-token-expired') {
        throw new UnauthorizedException('Firebase token expired');
      }
      if (error.code === 'auth/argument-error') {
        throw new UnauthorizedException('Invalid token!');
      }
      throw new UnauthorizedException('Invalid token!');
    }
  }
}
