import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsNotEmpty()
  @IsString()
  NODE_ENV: string;

  @IsOptional()
  @IsNumber()
  PORT: number;

  @IsNotEmpty()
  @IsString()
  DATABASE_URL: string;

  @IsNotEmpty()
  @IsString()
  JWT_SECRET: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN: string;

  @IsNotEmpty()
  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_EXPIRES_IN: string;

  @IsOptional()
  @IsString()
  REDIS_HOST: string;

  @IsOptional()
  @IsNumber()
  REDIS_PORT: number;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
