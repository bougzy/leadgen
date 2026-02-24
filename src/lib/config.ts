// Centralized configuration with hardcoded defaults
// Environment variables override these defaults when set

export const CONFIG = {
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb+srv://leadgen:leadgen@leadgen.jad0hvj.mongodb.net/leadgen',
  API_SECRET: process.env.API_SECRET || '66727526705ef4998bfaebd2d49ba7827e3c8198585d0a2ed855e353cdd9de78',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'b49191699185b32bc97228352f3219d8f2b9c6e836ad3a27a454c06ede0e4d45',
  AUTH_PASSWORD: process.env.AUTH_PASSWORD || '',
  BASE_URL: process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://leadgen.vercel.app',
} as const;

// Client-safe config (only values safe to expose in browser bundles)
export const CLIENT_CONFIG = {
  API_SECRET: process.env.NEXT_PUBLIC_API_SECRET || '66727526705ef4998bfaebd2d49ba7827e3c8198585d0a2ed855e353cdd9de78',
  BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || 'https://leadgen.vercel.app',
} as const;
