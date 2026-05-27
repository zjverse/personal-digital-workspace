import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

export const config = {
  root,
  port: Number(process.env.PORT ?? 4000),
  databasePath: path.resolve(root, process.env.DATABASE_PATH ?? 'data/workspace.sqlite'),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  adminEmail: process.env.ADMIN_EMAIL ?? 'owner@example.invalid',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'replace-with-a-long-random-password',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'
};
