import { SetMetadata } from '@nestjs/common';

export const TRANSACTION_KEY = 'transaction';
export const Transactional = () => SetMetadata(TRANSACTION_KEY, true);
