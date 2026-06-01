import { type } from '@tauri-apps/plugin-os';
import { getDirectDNS, getProxyPort, getStoreValue, getUseDHCP } from "../../single/store";
import { TUN_INTERFACE_NAME, TUN_STACK_STORE_KEY } from "../../types/definition";
import { writeConfigFile } from "../helper";

type Item = {
    tag: string;
    type: string;
    platform?: any;
    stack?: string;
    interface_name?: string;
    route_exclude_address?: string[];
}

export async function updateDHCPSettings2Config(newConfig: any) {
    const useDHCP = await getUseDHCP();
    for (let i = 0; i < newConfig.dns.servers.length; i++) {
        const server = newConfig.dns.servers[i];
        if (server.tag === "system") {
            if (useDHCP) {
                server.type = "dhcp";
                delete server.server;
                delete server.server_port;
                console.log("启用 DHCP DNS 模式");
            } else {
                let directDNS = await getDirectDNS();
                console.log("当前使用直连 DNS 地址：", directDNS);
                server.type = "udp";
                server.server = directDNS.trim();
                server.server_port = 53;
                console.log("启用 UDP DNS 模式, 服务器地址：", server.server);
            }
        }
    }
}

export async function updateVPNServerConfigFromDB(fileName: string, dbConfigData: any, newConfig: any) {
    if (!dbConfigData?.outbounds) {
        throw new Error('subscription_config_missing');
    }

    const outboundsSelectorIndex = 1;
    const outboundsUrltestIndex = 2;

    const outbound_groups = newConfig["outbounds"];
    const outboundsSelector = outbound_groups[outboundsSelectorIndex]["outbounds"];
    const outboundsUrltest = outbound_groups[outboundsUrltestIndex]["outbounds"];

    const seenTags = new Set<string>();
    const vpnServerList = dbConfigData.outbounds.filter((item: any) => {
        let flag = item.type !== "selector" && item.type !== "urltest" && item.type !== "direct" && item.type !== "block";
        flag = flag && item.type !== "dns";

        if (flag && seenTags.has(item.tag)) {
            console.warn(`[CONFIG] Skipping duplicate outbound tag: ${item.tag}`);
            return false;
        }
        if (flag) seenTags.add(item.tag);
        return flag;
    });

    for (let i = 0; i < vpnServerList.length; i++) {
        vpnServerList[i]["domain_resolver"] = "system";
        outboundsSelector.push(vpnServerList[i].tag);
    }

    const urltestNameList: string[] = vpnServerList.map((item: any) => item.tag);
    outboundsUrltest.push(...urltestNameList);
    outbound_groups.push(...vpnServerList);

    await writeConfigFile(fileName, new TextEncoder().encode(JSON.stringify(newConfig)));
}

export async function configureTunInbound(newConfig: any, bypassRouter: boolean = false): Promise<void> {
    const tunInbound = newConfig.inbounds.find((ib: Item) => ib.type === "tun" && ib.tag === "tun");
    if (!tunInbound) return;
    const proxyPort = await getProxyPort();

    if (tunInbound.platform?.http_proxy) {
        tunInbound.platform.http_proxy.server_port = proxyPort;
    }

    const osType = type();
    if (osType === "linux") {
        tunInbound.stack = "system";
    }
    if (osType !== "macos" && await getStoreValue(TUN_STACK_STORE_KEY)) {
        tunInbound.stack = await getStoreValue(TUN_STACK_STORE_KEY);
    }
    if (osType === "macos") {
        tunInbound.interface_name = TUN_INTERFACE_NAME;
    }

    if (bypassRouter && Array.isArray(tunInbound.route_exclude_address)) {
        const lanRanges = new Set(["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]);
        tunInbound.route_exclude_address = tunInbound.route_exclude_address.filter(
            (cidr: string) => !lanRanges.has(cidr),
        );
        tunInbound.route_exclude_address.push("10.0.0.1/32");
    }

    if (bypassRouter) {
        const hasDnsIn = newConfig.inbounds.some((ib: Item) => ib.tag === "dns-in");
        if (!hasDnsIn) {
            newConfig.inbounds.push({
                tag: "dns-in",
                type: "direct",
                listen: "::",
                listen_port: 53,
            });
            console.log("旁路由模式：注入 dns-in inbound ([::]:53)");
        }
    }

    console.log("当前 TUN Stack:", tunInbound.stack);
}

export async function configureMixedInbound(newConfig: any, allowLan: boolean, bypassRouter: boolean = false): Promise<void> {
    const mixedInbound = newConfig.inbounds.find((ib: Item) => ib.type === "mixed" && ib.tag === "mixed");
    if (mixedInbound) {
        mixedInbound.listen = (allowLan || bypassRouter) ? "0.0.0.0" : "127.0.0.1";
        mixedInbound.listen_port = await getProxyPort();
    }
}
