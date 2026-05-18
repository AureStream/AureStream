//! 地区/运营商元数据补全：从节点名称推测国家/地区。

use crate::models::Endpoint;

/// 国家/地区代码映射表（emoji、中文、英文缩写、英文全名 → ISO 代码）。
const COUNTRY_MAPPINGS: &[(&[&str], &str)] = &[
    (&["🇭🇰", "香港", "HK", "Hong Kong", "HongKong"], "HK"),
    (&["🇯🇵", "日本", "JP", "Japan"], "JP"),
    (&["🇺🇸", "美国", "US", "USA", "America"], "US"),
    (&["🇸🇬", "新加坡", "SG", "Singapore"], "SG"),
    (&["🇹🇼", "台湾", "台灣", "TW", "Taiwan"], "TW"),
    (&["🇰🇷", "韩国", "韓國", "KR", "Korea"], "KR"),
    (&["🇬🇧", "英国", "UK", "GB", "Britain", "England"], "GB"),
    (&["🇩🇪", "德国", "德國", "DE", "Germany"], "DE"),
    (&["🇫🇷", "法国", "法國", "FR", "France"], "FR"),
    (&["🇦🇺", "澳大利亚", "澳洲", "AU", "Australia"], "AU"),
    (&["🇨🇦", "加拿大", "CA", "Canada"], "CA"),
    (&["🇮🇳", "印度", "IN", "India"], "IN"),
    (&["🇧🇷", "巴西", "BR", "Brazil"], "BR"),
    (&["🇷🇺", "俄罗斯", "俄羅斯", "RU", "Russia"], "RU"),
    (&["🇳🇱", "荷兰", "荷蘭", "NL", "Netherlands", "Holland"], "NL"),
    (&["🇹🇷", "土耳其", "TR", "Turkey", "Türkiye"], "TR"),
    (&["🇮🇩", "印度尼西亚", "印尼", "ID", "Indonesia"], "ID"),
    (&["🇹🇭", "泰国", "泰國", "TH", "Thailand"], "TH"),
    (&["🇻🇳", "越南", "VN", "Vietnam"], "VN"),
    (&["🇲🇾", "马来西亚", "馬來西亞", "MY", "Malaysia"], "MY"),
    (&["🇵🇭", "菲律宾", "菲律賓", "PH", "Philippines"], "PH"),
    (&["🇦🇷", "阿根廷", "AR", "Argentina"], "AR"),
    (&["🇨🇱", "智利", "CL", "Chile"], "CL"),
    (&["🇲🇽", "墨西哥", "MX", "Mexico"], "MX"),
    (&["🇿🇦", "南非", "ZA", "South Africa"], "ZA"),
    (&["🇪🇬", "埃及", "EG", "Egypt"], "EG"),
    (&["🇳🇬", "尼日利亚", "NG", "Nigeria"], "NG"),
    (&["🇰🇪", "肯尼亚", "KE", "Kenya"], "KE"),
    (&["🇦🇪", "阿联酋", "阿聯酋", "AE", "UAE", "Dubai"], "AE"),
    (&["🇸🇦", "沙特", "SA", "Saudi"], "SA"),
    (&["🇮🇱", "以色列", "IL", "Israel"], "IL"),
    (&["🇵🇱", "波兰", "波蘭", "PL", "Poland"], "PL"),
    (&["🇸🇪", "瑞典", "SE", "Sweden"], "SE"),
    (&["🇳🇴", "挪威", "NO", "Norway"], "NO"),
    (&["🇫🇮", "芬兰", "芬蘭", "FI", "Finland"], "FI"),
    (&["🇩🇰", "丹麦", "丹麥", "DK", "Denmark"], "DK"),
    (&["🇨🇭", "瑞士", "CH", "Switzerland"], "CH"),
    (&["🇦🇹", "奥地利", "奧地利", "AT", "Austria"], "AT"),
    (&["🇧🇪", "比利时", "比利時", "BE", "Belgium"], "BE"),
    (&["🇮🇪", "爱尔兰", "愛爾蘭", "IE", "Ireland"], "IE"),
    (&["🇵🇹", "葡萄牙", "PT", "Portugal"], "PT"),
    (&["🇪🇸", "西班牙", "ES", "Spain"], "ES"),
    (&["🇮🇹", "意大利", "IT", "Italy"], "IT"),
    (&["🇨🇿", "捷克", "CZ", "Czech"], "CZ"),
    (&["🇷🇴", "罗马尼亚", "RO", "Romania"], "RO"),
    (&["🇺🇦", "乌克兰", "UA", "Ukraine"], "UA"),
    (&["🇬🇷", "希腊", "希臘", "GR", "Greece"], "GR"),
    (&["🇭🇺", "匈牙利", "HU", "Hungary"], "HU"),
];

/// 从节点名称推测国家/地区代码。
fn detect_country(name: &str) -> Option<&'static str> {
    let lower = name.to_lowercase();
    for &(patterns, code) in COUNTRY_MAPPINGS {
        for &pat in patterns {
            if lower.contains(&pat.to_lowercase()) {
                return Some(code);
            }
        }
    }
    None
}

/// 补全 Endpoint 的 metadata.country（如果尚未设置）。
pub fn normalize_endpoint(ep: &mut Endpoint) {
    if ep.metadata.country.is_some() {
        return;
    }
    if let Some(code) = detect_country(&ep.name) {
        ep.metadata.country = Some(code.to_string());
    }
}
