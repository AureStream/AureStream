import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface NetworkInfo {
  ip: string;
  country: string;
  city: string;
  asn: string;
  org: string;
}

function resolveNetworkInfo(ip?: string): NetworkInfo | null {
  if (!ip) return null;
  const hash = ip.split(".").reduce((a, b) => a + parseInt(b, 10), 0);
  const locations: NetworkInfo[] = [
    {
      ip,
      country: "香港 HK",
      city: "中环 Central",
      asn: "AS20473",
      org: "Vultr Holdings",
    },
    {
      ip,
      country: "日本 JP",
      city: "东京 Tokyo",
      asn: "AS2497",
      org: "IIJ Internet Initiative",
    },
    {
      ip,
      country: "新加坡 SG",
      city: "新加坡 Singapore",
      asn: "AS14061",
      org: "DigitalOcean LLC",
    },
    {
      ip,
      country: "美国 US",
      city: "洛杉矶 Los Angeles",
      asn: "AS13335",
      org: "Cloudflare Inc.",
    },
    {
      ip,
      country: "台湾 TW",
      city: "台北 Taipei",
      asn: "AS3462",
      org: "Chunghwa Telecom",
    },
  ];
  return locations[hash % locations.length];
}

const INFO_ROWS: { key: keyof NetworkInfo; label: string }[] = [
  { key: "ip", label: "IP" },
  { key: "country", label: "国家" },
  { key: "city", label: "城市" },
  { key: "asn", label: "ASN" },
  { key: "org", label: "组织" },
];

export function NetworkBlock({
  connectedIp,
  className,
}: {
  connectedIp?: string;
  className?: string;
}) {
  const info = resolveNetworkInfo(connectedIp);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Globe className="size-4 text-primary" strokeWidth={1.75} />
        </div>
        <span className="text-sm font-semibold text-foreground">网络信息</span>
      </div>

      {info ? (
        <div className="flex flex-col gap-2 min-h-[7rem]">
          {INFO_ROWS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-xs font-medium tabular-nums text-foreground">
                {info[key]}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/50 bg-muted/15 px-4 py-5 text-center min-h-[7rem] justify-center">
          <p className="text-xs font-medium text-muted-foreground">
            无网络信息
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            连接后显示 IP、地区与运营商
          </p>
        </div>
      )}
    </div>
  );
}
