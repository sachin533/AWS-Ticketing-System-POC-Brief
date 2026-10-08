'use strict';

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const region = process.env.AWS_REGION || 'us-east-1';
const s3 = new S3Client({ region });

const BUCKET = process.env.ATTACHMENTS_BUCKET;
const EXPIRES_IN = parseInt(process.env.PRESIGNED_URL_EXPIRES_IN || '300', 10);

const ALLOWED_MIME_TYPES = (process.env.ALLOWED_MIME_TYPES ||
  'image/png,image/jpeg,application/pdf,text/plain').split(',');

const MAX_BYTES = parseInt(process.env.MAX_ATTACHMENT_BYTES || '5242880', 10);

async function createUploadUrl({ key, contentType }) {
  if (!BUCKET) throw new Error('Missing env var ATTACHMENTS_BUCKET');
  if (!ALLOWED_MIME_TYPES.includes(contentType)) {
    const err = new Error(`Content-Type not allowed: ${contentType}`);
    err.statusCode = 400;
    throw err;
  }
  const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: EXPIRES_IN });
  return { uploadUrl, expiresIn: EXPIRES_IN };
}

async function createDownloadUrl(key) {
  if (!BUCKET) throw new Error('Missing env var ATTACHMENTS_BUCKET');
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: EXPIRES_IN });
}

module.exports = { createUploadUrl, createDownloadUrl, BUCKET, ALLOWED_MIME_TYPES, MAX_BYTES, EXPIRES_IN };
