import { invoke } from '@tauri-apps/api/core';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { getDataBaseInstance } from '../single/db';
import { buildSubscriptionUserAgent, GITHUB_URL, Subscription, SubscriptionConfig } from '../types/definition';
import { resolveSubscriptionData } from '../config/subscription-decoder';
import { apiFetch } from '../api/client';


export interface ResponseHeaders {
    'subscription-userinfo'?: string;
    'official-website'?: string;
    'content-disposition'?: string;
}

export interface ConfigResponse {
    data: any;
    headers: ResponseHeaders;
    status: number;
    rawBody?: string;
}

export class FileError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "FileError";
    }
}

export async function fetchConfigContent(url: string): Promise<ConfigResponse> {
    if (url.startsWith('file://')) {
        const filePath = url.slice(7);
        try {
            const content = await readTextFile(filePath);
            return {
                data: JSON.parse(content),
                headers: {
                    'subscription-userinfo': `upload=0; download=0; total=1125899906842624; expire=32503680000`,
                    'official-website': GITHUB_URL,
                    'content-disposition': `attachment; filename=local-config-${Date.now()}.json`
                },
                status: 200
            };
        } catch (error) {
            throw new FileError(`${error}`);
        }
    } else {
        const userAgent = buildSubscriptionUserAgent();
        const result = await invoke<{
            data: unknown;
            headers: Record<string, string>;
            status: number;
        }>('fetch_config', {
            url,
            userAgent,
        });

        // Normalize header keys to lowercase
        const normalizedHeaders: Record<string, string> = {};
        if (result.headers) {
            for (const key of Object.keys(result.headers)) {
                normalizedHeaders[key.toLowerCase()] = result.headers[key];
            }
        }

        const rawBody = (result as any).raw_body as string | undefined

        return {
            data: result.data ?? null,
            headers: {
                'subscription-userinfo': normalizedHeaders['subscription-userinfo'] || '',
                'official-website': normalizedHeaders['official-website'] || GITHUB_URL,
                'content-disposition': normalizedHeaders['content-disposition'] || '',
            },
            status: result.status,
            rawBody,
        };
    }
}

export function getRemoteNameByContentDisposition(contentDisposition: string) {
    const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
    const matches = filenameRegex.exec(contentDisposition);
    if (matches != null && matches[1]) {
        return decodeURIComponent(matches[1].replace(/['"]/g, ''));
    }
    return null;
}

export function getRemoteInfoBySubscriptionUserinfo(subscriptionUserinfo: string) {
    try {
        const info = subscriptionUserinfo.split('; ').reduce((acc, item) => {
            const [key, value] = item.split('=');
            if (key && value) {
                acc[key.trim()] = value.trim();
            }
            return acc;
        }, {} as Record<string, string>);

        return {
            upload: info.upload || '0',
            download: info.download || '0',
            total: info.total || '0',
            expire: info.expire || '0',
        };
    } catch (error) {
        console.error('Error parsing subscription userinfo:', error);
        return {
            upload: '0',
            download: '0',
            total: '0',
            expire: '0',
        };
    }
}

async function upsertSubscriptionRow(
    db: Awaited<ReturnType<typeof getDataBaseInstance>>,
    identifier: string,
    fields: {
        name: string
        url: string
        officialWebsite: string
        usedTraffic: number
        totalTraffic: number
        expireTime: number
        configJson: string
    }
): Promise<void> {
    const lastUpdate = Math.floor(Date.now() / 1000)
    const existingById: { identifier: string }[] = await db.select(
        'SELECT identifier FROM subscriptions WHERE identifier = ? LIMIT 1',
        [identifier]
    )
    if (existingById.length > 0) {
        await db.execute(
            'UPDATE subscriptions SET name = ?, subscription_url = ?, official_website = ?, used_traffic = ?, total_traffic = ?, expire_time = ?, last_update_time = ? WHERE identifier = ?',
            [
                fields.name,
                fields.url,
                fields.officialWebsite,
                fields.usedTraffic,
                fields.totalTraffic,
                fields.expireTime,
                lastUpdate,
                identifier,
            ]
        )
        await db.execute(
            'UPDATE subscription_configs SET config_content = ? WHERE identifier = ?',
            [fields.configJson, identifier]
        )
        return
    }

    await db.execute(
        'INSERT INTO subscriptions (identifier, name, subscription_url, official_website, used_traffic, total_traffic, expire_time, last_update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
            identifier,
            fields.name,
            fields.url,
            fields.officialWebsite,
            fields.usedTraffic,
            fields.totalTraffic,
            fields.expireTime,
            lastUpdate,
        ]
    )
    await db.execute(
        'INSERT INTO subscription_configs (identifier, config_content) VALUES (?, ?)',
        [identifier, fields.configJson]
    )
}

/**
 * Align a row found by URL to the API subscription id when they differ
 * (account switch / stale local identifier).
 */
async function rekeySubscriptionIdentifier(
    db: Awaited<ReturnType<typeof getDataBaseInstance>>,
    fromId: string,
    toId: string
): Promise<void> {
    if (!fromId || !toId || fromId === toId) return

    const conflict: { identifier: string }[] = await db.select(
        'SELECT identifier FROM subscriptions WHERE identifier = ? LIMIT 1',
        [toId]
    )
    if (conflict.length > 0) {
        // Target id already exists — drop the stale URL duplicate.
        await db.execute('DELETE FROM subscription_configs WHERE identifier = ?', [fromId])
        await db.execute('DELETE FROM subscriptions WHERE identifier = ?', [fromId])
        return
    }

    await db.execute('UPDATE subscriptions SET identifier = ? WHERE identifier = ?', [toId, fromId])
    await db.execute(
        'UPDATE subscription_configs SET identifier = ? WHERE identifier = ?',
        [toId, fromId]
    )
}

export async function insertSubscription(url: string, name?: string, customIdentifier?: string): Promise<string | undefined> {
    try {
        const response = await fetchConfigContent(url);
        // Prefer resolveSubscriptionData so base64 / plain URI lists work even when
        // Rust leaves `data` null (or returns non-proxy JSON).
        const resolved = resolveSubscriptionData(response.data, response.rawBody);
        if (response.status !== 200 || !resolved) {
            console.warn(
                `[import] abort status=${response.status} hasData=${!!response.data} hasRaw=${!!response.rawBody} url=${url}`
            );
            return undefined;
        }
        const data = resolved;
        console.info(`[import] subscription decoded, ${data.outbounds.length} outbounds url=${url}`);

        const db = await getDataBaseInstance();
        const resolvedName = (!name || name === '默认配置')
            ? getRemoteNameByContentDisposition(response.headers['content-disposition'] || '') || '配置'
            : name;
        const { upload, download, total, expire } = getRemoteInfoBySubscriptionUserinfo(
            response.headers['subscription-userinfo'] || ''
        );
        const usedTraffic = parseInt(upload) + parseInt(download);
        const totalTraffic = parseInt(total) || 1;
        const expireTime = parseInt(expire) * 1000 || (Date.now() + 100 * 365 * 24 * 3600 * 1000);
        const officialWebsite = response.headers['official-website'] || GITHUB_URL;
        const configJson = JSON.stringify(data);
        const lastUpdate = Math.floor(Date.now() / 1000);

        // Prefer API id when provided so SSI / remote sync stay aligned.
        if (customIdentifier) {
            const byUrl: { identifier: string }[] = await db.select(
                'SELECT identifier FROM subscriptions WHERE subscription_url = ? ORDER BY id DESC LIMIT 1',
                [url]
            );
            if (byUrl.length > 0 && byUrl[0].identifier !== customIdentifier) {
                await rekeySubscriptionIdentifier(db, byUrl[0].identifier, customIdentifier);
            }
            await upsertSubscriptionRow(db, customIdentifier, {
                name: resolvedName,
                url,
                officialWebsite,
                usedTraffic,
                totalTraffic,
                expireTime,
                configJson,
            });
            return customIdentifier;
        }

        const existing: { identifier: string }[] = await db.select(
            'SELECT identifier FROM subscriptions WHERE subscription_url = ? ORDER BY id DESC LIMIT 1',
            [url]
        );

        if (existing.length > 0) {
            const identifier = existing[0].identifier;
            await db.execute(
                'UPDATE subscriptions SET name = ?, used_traffic = ?, total_traffic = ?, expire_time = ?, last_update_time = ? WHERE identifier = ?',
                [resolvedName, usedTraffic, totalTraffic, expireTime, lastUpdate, identifier]
            );
            await db.execute(
                'UPDATE subscription_configs SET config_content = ? WHERE identifier = ?',
                [configJson, identifier]
            );
            return identifier;
        }

        const identifier = crypto.randomUUID().toString().replace(/-/g, '');
        await upsertSubscriptionRow(db, identifier, {
            name: resolvedName,
            url,
            officialWebsite,
            usedTraffic,
            totalTraffic,
            expireTime,
            configJson,
        });
        return identifier;
    } catch (err) {
        console.error(`[import] error url=${url}`, err);
        return undefined;
    }
}

export async function updateSubscription(identifier: string): Promise<boolean> {
    try {
        const db = await getDataBaseInstance();
        const result: Subscription[] = await db.select('SELECT subscription_url FROM subscriptions WHERE identifier = ?', [identifier]);
        if (result.length === 0) {
            return false;
        }
        const url = result[0].subscription_url;
        const response = await fetchConfigContent(url);
        const resolved = resolveSubscriptionData(response.data, response.rawBody);
        if (response.status !== 200 || !resolved) {
            return false;
        }

        const { upload, download, total, expire } = getRemoteInfoBySubscriptionUserinfo(response.headers['subscription-userinfo'] || '');
        const officialWebsite = response.headers['official-website'] || GITHUB_URL;
        const used_traffic = parseInt(upload) + parseInt(download);
        const total_traffic = parseInt(total) || 1;
        const expire_time = parseInt(expire) * 1000 || (Date.now() + 100 * 365 * 24 * 3600 * 1000);
        const last_update_time = Math.floor(Date.now() / 1000);

        await db.execute(
            'UPDATE subscriptions SET official_website = ?, used_traffic = ?, total_traffic = ?, expire_time = ?, last_update_time = ? WHERE identifier = ?',
            [officialWebsite, used_traffic, total_traffic, expire_time, last_update_time, identifier]
        );
        await db.execute('UPDATE subscription_configs SET config_content = ? WHERE identifier = ?', [JSON.stringify(resolved), identifier]);
        return true;
    } catch (error) {
        console.error('Error updating subscription:', error);
        return false;
    }
}

export async function deleteSubscription(identifier: string): Promise<void> {
    try {
        const db = await getDataBaseInstance();
        await db.execute('DELETE FROM subscriptions WHERE identifier = ?', [identifier]);
        await db.execute('DELETE FROM subscription_configs WHERE identifier = ?', [identifier]);
    } catch (error) {
        console.error('Error deleting subscription:', error);
    }
}

export async function clearAllLocalSubscriptionData(): Promise<void> {
    try {
        const db = await getDataBaseInstance();
        await db.execute('DELETE FROM subscriptions');
        await db.execute('DELETE FROM subscription_configs');
        await db.execute('DELETE FROM node_latencies');
    } catch (error) {
        console.error('Error clearing all local subscription and latency data:', error);
    }
}

/** Lightweight revision for config-merge cache invalidation. */
export async function getSubscriptionMergeRevision(
  identifier: string
): Promise<string> {
  try {
    const db = await getDataBaseInstance();
    const rows = await db.select<
      { last_update_time: number; content_len: number }[]
    >(
      `SELECT s.last_update_time, LENGTH(sc.config_content) AS content_len
       FROM subscriptions s
       JOIN subscription_configs sc ON s.identifier = sc.identifier
       WHERE s.identifier = ?`,
      [identifier]
    );
    if (rows.length === 0) {
      return "missing";
    }
    const { last_update_time, content_len } = rows[0];
    return `${last_update_time}:${content_len}`;
  } catch (error) {
    console.error("Error reading subscription merge revision:", error);
    return `error:${Date.now()}`;
  }
}

/** Returns parsed subscription JSON, or null when missing/invalid (no silent mock data). */
export async function getSubscriptionConfig(identifier: string): Promise<any | null> {
    try {
        if (!identifier) {
            console.warn('[DB] identifier is empty');
            return null;
        }
        const db = await getDataBaseInstance();
        const result: SubscriptionConfig[] = await db.select(
            'SELECT config_content FROM subscription_configs WHERE identifier = ?',
            [identifier]
        );
        if (result.length === 0) {
            console.warn(`[DB] subscription config not found for identifier=${identifier}`);
            return null;
        }
        const parsed = JSON.parse(result[0].config_content);
        if (!parsed || !Array.isArray(parsed.outbounds) || parsed.outbounds.length === 0) {
            console.warn(`[DB] subscription outbounds empty for identifier=${identifier}`);
            return null;
        }
        return parsed;
    } catch (error) {
        console.error('Error getting subscription config:', error);
        return null;
    }
}

export async function getLocalSubscriptions(): Promise<any[]> {
    try {
        const db = await getDataBaseInstance();
        const rows: any[] = await db.select(
            'SELECT identifier, name, subscription_url, used_traffic, total_traffic, expire_time, last_update_time FROM subscriptions'
        );
        return rows.map(row => ({
            id: row.identifier,
            name: row.name,
            url: row.subscription_url,
            traffic_used: row.used_traffic,
            traffic_total: row.total_traffic,
            expire_time: Math.floor(row.expire_time / 1000),
            created_at: row.last_update_time
        }));
    } catch (err) {
        console.error('Error fetching local subscriptions:', err);
        return [];
    }
}

/** Update traffic/name/expiry from API list without re-downloading the subscription URL. */
export async function updateLocalSubscriptionMeta(sub: {
    id: string
    name: string
    traffic_used: number
    traffic_total: number
    expire_time: number
}): Promise<void> {
    try {
        const db = await getDataBaseInstance();
        const expireMs = sub.expire_time > 1e12 ? sub.expire_time : sub.expire_time * 1000;
        await db.execute(
            'UPDATE subscriptions SET name = ?, used_traffic = ?, total_traffic = ?, expire_time = ?, last_update_time = ? WHERE identifier = ?',
            [
                sub.name,
                sub.traffic_used,
                sub.traffic_total > 1 ? sub.traffic_total : 1,
                expireMs || (Date.now() + 100 * 365 * 24 * 3600 * 1000),
                Math.floor(Date.now() / 1000),
                sub.id,
            ]
        );
    } catch (err) {
        console.error('Error updating subscription metadata:', err);
    }
}

export async function accumulateUsedTraffic(
    identifier: string,
    uploadBytes: number,
    downloadBytes: number
): Promise<void> {
    try {
        const db = await getDataBaseInstance();
        const totalBytes = uploadBytes + downloadBytes;
        await db.execute(
            'UPDATE subscriptions SET used_traffic = used_traffic + ?, pending_upload = pending_upload + ?, pending_download = pending_download + ? WHERE identifier = ?',
            [totalBytes, uploadBytes, downloadBytes, identifier]
        );
    } catch (err) {
        console.error('Error accumulating used traffic:', err);
    }
}

export async function uploadPendingTraffic(): Promise<void> {
    try {
        const db = await getDataBaseInstance();
        const pendingSubs: any[] = await db.select(
            'SELECT identifier, pending_upload, pending_download FROM subscriptions WHERE pending_upload > 0 OR pending_download > 0'
        );
        
        for (const sub of pendingSubs) {
            const { identifier, pending_upload, pending_download } = sub;
            try {
                const res = await apiFetch(`/subscriptions/${identifier}/usage`, {
                    method: 'POST',
                    body: JSON.stringify({
                        upload: pending_upload,
                        download: pending_download
                    })
                });
                if (res.ok) {
                    await db.execute(
                        'UPDATE subscriptions SET pending_upload = pending_upload - ?, pending_download = pending_download - ? WHERE identifier = ?',
                        [pending_upload, pending_download, identifier]
                    );
                    console.info(`[Traffic Sync] Sync completed for subscription: ${identifier}`);
                } else {
                    console.warn(`[Traffic Sync] Cloud API rejected traffic submission for ${identifier}: ${res.status}`);
                }
            } catch (apiErr) {
                console.error(`[Traffic Sync] Cloud connection failed for ${identifier}:`, apiErr);
            }
        }
    } catch (dbErr) {
        console.error('[Traffic Sync] DB query failed:', dbErr);
    }
}

