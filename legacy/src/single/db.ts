import Database from '@tauri-apps/plugin-sql';
import { isTauri } from '../lib/tauri-env';


let dbPromise: Promise<Database> | null = null;

export function getDataBaseInstance(): Promise<Database> {
    if (!isTauri()) {
        return Promise.reject(new Error('SQLite is only available in the Tauri runtime'));
    }
    if (!dbPromise) {
        dbPromise = Database.load('sqlite:data.db');
    }
    return dbPromise;
}
