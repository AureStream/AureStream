use crate::{Error, Result};

/// Convert IPv4 CIDR notation to wildcard patterns.
///
/// # Example
/// ```
/// use onebox_sysproxy_rs::utils::ipv4_cidr_to_wildcard;
/// assert_eq!(ipv4_cidr_to_wildcard("127.0.0.1/8").unwrap(), vec!["127.*".to_string()]);
/// ```
pub fn ipv4_cidr_to_wildcard(cidr: &str) -> Result<Vec<String>> {
    let (ip_str, prefix_str) = cidr
        .split_once('/')
        .ok_or_else(|| Error::ParseStr(cidr.into()))?;

    let prefix: u32 = prefix_str
        .parse()
        .map_err(|_| Error::ParseStr(cidr.into()))?;

    if prefix > 32 {
        return Err(Error::ParseStr(cidr.into()));
    }

    let octets: Vec<u8> = ip_str
        .split('.')
        .map(|s| s.parse::<u8>().map_err(|_| Error::ParseStr(cidr.into())))
        .collect::<Result<Vec<_>>>()?;

    if octets.len() != 4 {
        return Err(Error::ParseStr(cidr.into()));
    }

    let ip: u32 = (octets[0] as u32) << 24
        | (octets[1] as u32) << 16
        | (octets[2] as u32) << 8
        | (octets[3] as u32);

    let mask = if prefix == 0 {
        0u32
    } else {
        !((1u32 << (32 - prefix)) - 1)
    };

    let start = ip & mask;
    let end = start | !mask;

    let start_octets = [
        (start >> 24) as u8,
        (start >> 16) as u8,
        (start >> 8) as u8,
        start as u8,
    ];
    let end_octets = [
        (end >> 24) as u8,
        (end >> 16) as u8,
        (end >> 8) as u8,
        end as u8,
    ];

    let mut results = vec![];
    let mut prefix_parts = String::new();

    for i in 0..4 {
        if start_octets[i] == end_octets[i] {
            if !prefix_parts.is_empty() {
                prefix_parts.push('.');
            }
            prefix_parts.push_str(&start_octets[i].to_string());
            if i == 3 {
                results.push(prefix_parts.clone());
            }
            continue;
        }

        if start_octets[i] == 0 && end_octets[i] == 255 {
            if !prefix_parts.is_empty() {
                prefix_parts.push('.');
            }
            prefix_parts.push('*');
            results.push(prefix_parts);
            break;
        }

        for j in start_octets[i]..=end_octets[i] {
            let mut entry = prefix_parts.clone();
            if !entry.is_empty() {
                entry.push('.');
            }
            entry.push_str(&j.to_string());
            if i != 3 {
                entry.push_str(".*");
            }
            results.push(entry);
        }
        break;
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ipv4_cidr_class_a() {
        assert_eq!(ipv4_cidr_to_wildcard("127.0.0.1/8").unwrap(), vec!["127.*"]);
    }

    #[test]
    fn test_ipv4_cidr_class_c() {
        assert_eq!(
            ipv4_cidr_to_wildcard("192.168.1.0/24").unwrap(),
            vec!["192.168.1.*"]
        );
    }

    #[test]
    fn test_ipv4_cidr_class_b() {
        assert_eq!(
            ipv4_cidr_to_wildcard("10.0.0.0/16").unwrap(),
            vec!["10.0.*"]
        );
    }
}
