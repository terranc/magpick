import { createHash } from 'crypto';

export function modelSlug(modelId: string): string {
  const readable = modelId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const hash = createHash('sha1').update(modelId).digest('hex').slice(0, 8);
  return `${readable || 'model'}-${hash}`;
}
