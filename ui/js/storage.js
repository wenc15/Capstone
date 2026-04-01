// 2026/03/31 edited by Zikai Lu
// Changes:
//  - Reuse shared localStorage helper for quota-safe JSON persistence.
//  - Keep focus session writes resilient when storage is temporarily unavailable.

// storage.js
import { LOCAL_STORAGE_KEYS, readJsonSafe, writeJsonSafe } from './local_storage.js';

const KEY = LOCAL_STORAGE_KEYS.focusSessions; // { ts, minutes, note }

export function loadSessions(){
  const list = readJsonSafe(KEY, []);
  return Array.isArray(list) ? list : [];
}

export function saveSession(minutes, note){
  const list = loadSessions();
  list.push({ ts: Date.now(), minutes, note: note?.trim() || '' });
  writeJsonSafe(KEY, list);
  return list;
}
