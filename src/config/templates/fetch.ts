// Use native browser fetch instead of Tauri's plugin-http to bypass scope restrictions
import { parse } from "jsonc-parser";
import { configType } from "@/config/common";
import { getConfigTemplateURL } from "@/single/store";

export async function fetchRemoteTemplate(mode: configType): Promise<string> {
    const url = await getConfigTemplateURL(mode);
    if (!url.startsWith("https://")) {
        throw new Error(`[fetchRemoteTemplate] Template URL for mode=${mode} is not HTTPS: ${url}`);
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 seconds timeout
    try {
        const response = await fetch(`${url}?_=${Date.now()}`, {
            signal: controller.signal,
            cache: "no-store",
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch template (HTTP ${response.status} ${response.statusText})`);
        }
        const text = await response.text();
        const jsonRes = parse(text);
        if (!jsonRes || typeof jsonRes !== 'object') {
            throw new Error(`Failed to parse remote template for mode=${mode}`);
        }
        return JSON.stringify(jsonRes);
    } catch (e: any) {
        const errMsg = e instanceof Error ? e.message : String(e);
        throw new Error(`Network error or timeout while fetching template: ${errMsg}`);
    } finally {
        clearTimeout(timeoutId);
    }
}
