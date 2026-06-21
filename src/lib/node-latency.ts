import { getDataBaseInstance } from '../single/db'

// Session-level latency cache shared across pages so measured node delays
// survive navigation (component unmount). Keyed by node tag.
//
// Values: > 0 = latency in ms, -1 = timeout/unreachable, 0/undefined = unknown.

const cache = new Map<string, number>()
let initPromise: Promise<void> | null = null

export async function initNodeLatency(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const db = await getDataBaseInstance()
      const rows = await db.select<{ tag: string; latency: number }[]>(
        'SELECT tag, latency FROM node_latencies'
      )
      if (Array.isArray(rows)) {
        for (const row of rows) {
          if (row.tag && typeof row.latency === 'number') {
            cache.set(row.tag, row.latency)
          }
        }
      }
    } catch (error) {
      console.error('Failed to load node latencies from DB:', error)
    }
  })()

  return initPromise
}

export function getNodeLatency(tag: string): number | undefined {
  return cache.get(tag)
}

export function setNodeLatency(tag: string, ms: number): void {
  if (!tag) return
  cache.set(tag, ms)

  // Asynchronously save to database
  getDataBaseInstance()
    .then(async (db) => {
      try {
        await db.execute(
          'INSERT OR REPLACE INTO node_latencies (tag, latency, updated_at) VALUES (?, ?, ?)',
          [tag, ms, Math.floor(Date.now() / 1000)]
        )
      } catch (error) {
        console.error('Failed to save node latency to DB:', error)
      }
    })
    .catch((err) => {
      console.error('Failed to get database instance for saving latency:', err)
    })
}

export function clearNodeLatency(): void {
  cache.clear()

  // Asynchronously clear database table
  getDataBaseInstance()
    .then(async (db) => {
      try {
        await db.execute('DELETE FROM node_latencies')
      } catch (error) {
        console.error('Failed to clear node latencies from DB:', error)
      }
    })
    .catch((err) => {
      console.error('Failed to get database instance for clearing latency:', err)
    })
}
