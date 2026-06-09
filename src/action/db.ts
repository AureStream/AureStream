import { invoke } from '@tauri-apps/api/core';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { getDataBaseInstance } from '../single/db';
import { buildSubscriptionUserAgent, Subscription, SubscriptionConfig } from '../types/definition';
import { parseSubscriptionBody } from '../config/subscription-decoder';

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
                    'official-website': 'https://sing-box.net',
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
                'official-website': normalizedHeaders['official-website'] || 'https://sing-box.net',
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

export async function insertSubscription(url: string, name?: string): Promise<string | undefined> {
    try {
        const response = await fetchConfigContent(url);
        let data = response.data;
        if (!data && response.rawBody) {
            try {
                data = parseSubscriptionBody(response.rawBody);
                console.info(`[import] base64 subscription decoded, ${(data as any)?.outbounds?.length || 0} outbounds`);
            } catch (e) {
                console.warn(`[import] base64 decode failed for url=${url}:`, e);
            }
        }
        if (response.status !== 200 || !data) {
            console.warn(`[import] abort non-200 status=${response.status} url=${url}`);
            return undefined;
        }

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

        const existing: { identifier: string }[] = await db.select(
            'SELECT identifier FROM subscriptions WHERE subscription_url = ? ORDER BY id DESC LIMIT 1',
            [url]
        );

        if (existing.length > 0) {
            const identifier = existing[0].identifier;
            await db.execute(
                'UPDATE subscriptions SET name = ?, used_traffic = ?, total_traffic = ?, expire_time = ?, last_update_time = ? WHERE identifier = ?',
                [resolvedName, usedTraffic, totalTraffic, expireTime, Math.floor(Date.now() / 1000), identifier]
            );
            await db.execute(
                'UPDATE subscription_configs SET config_content = ? WHERE identifier = ?',
                [JSON.stringify(data), identifier]
            );
            return identifier;
        }

        const identifier = crypto.randomUUID().toString().replace(/-/g, '');
        await db.execute(
            'INSERT INTO subscriptions (identifier, name, subscription_url, official_website, used_traffic, total_traffic, expire_time, last_update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                identifier, resolvedName, url,
                response.headers['official-website'] || 'https://sing-box.net',
                usedTraffic, totalTraffic, expireTime, Math.floor(Date.now() / 1000),
            ]
        );
        await db.execute(
            'INSERT INTO subscription_configs (identifier, config_content) VALUES (?, ?)',
            [identifier, JSON.stringify(data)]
        );
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
        let data = response.data;
        if (!data && response.rawBody) {
            try {
                data = parseSubscriptionBody(response.rawBody);
            } catch (_) {
                // fall through
            }
        }
        if (response.status !== 200 || !data) {
            return false;
        }

        const { upload, download, total, expire } = getRemoteInfoBySubscriptionUserinfo(response.headers['subscription-userinfo'] || '');
        const officialWebsite = response.headers['official-website'] || 'https://sing-box.net';
        const used_traffic = parseInt(upload) + parseInt(download);
        const total_traffic = parseInt(total) || 1;
        const expire_time = parseInt(expire) * 1000 || (Date.now() + 100 * 365 * 24 * 3600 * 1000);
        const last_update_time = Math.floor(Date.now() / 1000);

        await db.execute(
            'UPDATE subscriptions SET official_website = ?, used_traffic = ?, total_traffic = ?, expire_time = ?, last_update_time = ? WHERE identifier = ?',
            [officialWebsite, used_traffic, total_traffic, expire_time, last_update_time, identifier]
        );
        await db.execute('UPDATE subscription_configs SET config_content = ? WHERE identifier = ?', [JSON.stringify(data), identifier]);
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

export async function getSubscriptionConfig(identifier: string): Promise<any> {
    try {
        const db = await getDataBaseInstance();
        const result: SubscriptionConfig[] = await db.select(
            'SELECT config_content FROM subscription_configs WHERE identifier = ?',
            [identifier]
        );
        if (result.length === 0) {
            throw new Error('subscription_not_exist');
        }
        return JSON.parse(result[0].config_content);
    } catch (error) {
        console.error('Error getting subscription config:', error);
        throw error;
    }
}
