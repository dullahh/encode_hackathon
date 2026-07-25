export type TemporaryShareDelivery = 'remote' | 'local_demo';

export interface TemporaryShare {
  id: string;
  accessUrl: string;
  expiresAt: string;
  qrCodeDataUrl: string;
  delivery: TemporaryShareDelivery;
}

export type TemporaryShareState = 'valid' | 'invalid' | 'expired' | 'revoked';
