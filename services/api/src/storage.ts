import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';
import { config } from './config.js';
import sharp from 'sharp';

export const ALLOWED_UPLOADS = {
  image: { mime: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 10 * 1024 * 1024 },
  document: { mime: ['application/pdf'], maxBytes: 20 * 1024 * 1024 }
} as const;
const s3 = config.S3_BUCKET ? new S3Client({ region: config.AWS_REGION }) : null;
export async function createUploadUrl(hotelId: string, category: keyof typeof ALLOWED_UPLOADS, mimeType: string, sizeBytes: number): Promise<{ uploadUrl: string; objectKey: string; deliveryUrl: string }> {
  const rules = ALLOWED_UPLOADS[category];
  if (!rules.mime.includes(mimeType as never) || sizeBytes <= 0 || sizeBytes > rules.maxBytes) throw Object.assign(new Error('Unsupported file type or size'), { status: 400 });
  if (!s3 || !config.S3_BUCKET) throw Object.assign(new Error('File storage is not configured'), { status: 503 });
  const extension = mimeType.split('/')[1].replace('jpeg', 'jpg');
  const objectKey = `hotels/${hotelId}/${category}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: objectKey, ContentType: mimeType, ContentLength: sizeBytes }), { expiresIn: 300 });
  const deliveryBase = config.CLOUDFRONT_URL?.replace(/\/$/, '') ?? `https://${config.S3_BUCKET}.s3.${config.AWS_REGION}.amazonaws.com`;
  return { uploadUrl, objectKey, deliveryUrl: `${deliveryBase}/${objectKey}` };
}
export async function optimizeImage(input: Buffer): Promise<Buffer> {
  return sharp(input).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
}
