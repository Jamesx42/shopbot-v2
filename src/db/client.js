// src/db/client.js
import { MongoClient } from 'mongodb';
import { getConfig }   from '../config.js';

let client = null;
let db     = null;

export async function connectDB() {
  if (db) return db;
  const { MONGODB_URI } = getConfig();
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db();
  console.log('[DB] MongoDB connected');
  return db;
}

export function getDB() {
  if (!db) throw new Error('[DB] Not connected. Call connectDB() first.');
  return db;
}

export function getClient() {
  if (!client) throw new Error('[DB] Client not initialized.');
  return client;
}

export async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    db     = null;
    console.log('[DB] MongoDB connection closed');
  }
}