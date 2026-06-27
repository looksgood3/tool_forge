package netenvcheck

// 嵌入 IANA 时区库,保证 time.LoadLocation 在任何平台(尤其 Windows 无系统 zoneinfo)
// 都能解析 IP 归属返回的时区(如 America/Los_Angeles),用于时区一致性比对。
import _ "time/tzdata"
