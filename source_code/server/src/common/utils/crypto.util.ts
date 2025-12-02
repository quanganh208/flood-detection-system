import * as crypto from 'crypto';
import * as fs from 'fs';

export function calculateMD5(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  const hash = crypto.createHash('md5');
  hash.update(fileBuffer);
  return hash.digest('hex');
}
