package netenvcheck

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
)

const probeUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Tool-Forge NetEnvCheck"

// getJSON GET 一个 URL 并把 body 反序列化到 out。限制 1MB 防 OOM。
func getJSON(ctx context.Context, client *http.Client, url string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", probeUA)
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return json.Unmarshal(body, out)
}

// fetchEgressIP 用 ipify 拿出口 IPv4。
func fetchEgressIP(ctx context.Context, client *http.Client) (string, error) {
	var v struct {
		IP string `json:"ip"`
	}
	if err := getJSON(ctx, client, "https://api.ipify.org/?format=json", &v); err != nil {
		return "", err
	}
	if v.IP == "" {
		return "", fmt.Errorf("空响应")
	}
	return v.IP, nil
}

// fetchIPWhoIs 归属 + ASN(无需 key)。
func fetchIPWhoIs(ctx context.Context, client *http.Client, ip string) (probeResult, error) {
	var v struct {
		Success     bool    `json:"success"`
		Message     string  `json:"message"`
		IP          string  `json:"ip"`
		Country     string  `json:"country"`
		CountryCode string  `json:"country_code"`
		Region      string  `json:"region"`
		City        string  `json:"city"`
		Latitude    float64 `json:"latitude"`
		Longitude   float64 `json:"longitude"`
		Connection  struct {
			ASN int    `json:"asn"`
			Org string `json:"org"`
			ISP string `json:"isp"`
		} `json:"connection"`
		Timezone struct {
			ID string `json:"id"`
		} `json:"timezone"`
	}
	url := "https://ipwho.is/" + ip
	if err := getJSON(ctx, client, url, &v); err != nil {
		return probeResult{}, err
	}
	if !v.Success {
		msg := v.Message
		if msg == "" {
			msg = "查询失败"
		}
		return probeResult{}, fmt.Errorf("%s", msg)
	}
	org := v.Connection.Org
	if org == "" {
		org = v.Connection.ISP
	}
	asn := ""
	if v.Connection.ASN > 0 {
		asn = "AS" + strconv.Itoa(v.Connection.ASN)
	}
	return probeResult{ip: v.IP, geo: GeoInfo{
		Country:     v.Country,
		CountryCode: v.CountryCode,
		Region:      v.Region,
		City:        v.City,
		Timezone:    v.Timezone.ID,
		ASN:         asn,
		Org:         org,
		Latitude:    v.Latitude,
		Longitude:   v.Longitude,
	}}, nil
}

// fetchIfconfig 归属 + ASN 备用源(报告调用方自身 IP)。
func fetchIfconfig(ctx context.Context, client *http.Client) (probeResult, error) {
	var v struct {
		IP         string  `json:"ip"`
		Country    string  `json:"country"`
		CountryISO string  `json:"country_iso"`
		RegionName string  `json:"region_name"`
		City       string  `json:"city"`
		Latitude   float64 `json:"latitude"`
		Longitude  float64 `json:"longitude"`
		TimeZone   string  `json:"time_zone"`
		ASN        string  `json:"asn"`
		ASNOrg     string  `json:"asn_org"`
	}
	if err := getJSON(ctx, client, "https://ifconfig.co/json", &v); err != nil {
		return probeResult{}, err
	}
	return probeResult{ip: v.IP, geo: GeoInfo{
		Country:     v.Country,
		CountryCode: v.CountryISO,
		Region:      v.RegionName,
		City:        v.City,
		Timezone:    v.TimeZone,
		ASN:         v.ASN,
		Org:         v.ASNOrg,
		Latitude:    v.Latitude,
		Longitude:   v.Longitude,
	}}, nil
}

// fetchIPApiIs 风险标记(机房/代理/VPN/Tor/滥用)+ 归属。免费额度 ~1000/天。
func fetchIPApiIs(ctx context.Context, client *http.Client, ip string) (probeResult, error) {
	var v struct {
		IP           string `json:"ip"`
		IsMobile     bool   `json:"is_mobile"`
		IsDatacenter bool   `json:"is_datacenter"`
		IsTor        bool   `json:"is_tor"`
		IsProxy      bool   `json:"is_proxy"`
		IsVPN        bool   `json:"is_vpn"`
		IsAbuser     bool   `json:"is_abuser"`
		Company      struct {
			Name string `json:"name"`
			Type string `json:"type"`
		} `json:"company"`
		Datacenter struct {
			Datacenter string `json:"datacenter"`
		} `json:"datacenter"`
		ASN struct {
			ASN  int    `json:"asn"`
			Org  string `json:"org"`
			Type string `json:"type"`
		} `json:"asn"`
		Location struct {
			Country     string  `json:"country"`
			CountryCode string  `json:"country_code"`
			State       string  `json:"state"`
			City        string  `json:"city"`
			Latitude    float64 `json:"latitude"`
			Longitude   float64 `json:"longitude"`
			Timezone    string  `json:"timezone"`
		} `json:"location"`
	}
	url := "https://api.ipapi.is/?q=" + ip
	if err := getJSON(ctx, client, url, &v); err != nil {
		return probeResult{}, err
	}
	hosting := v.Datacenter.Datacenter
	if hosting == "" && v.Company.Type == "hosting" {
		hosting = v.Company.Name
	}
	asn := ""
	if v.ASN.ASN > 0 {
		asn = "AS" + strconv.Itoa(v.ASN.ASN)
	}
	rawType := v.ASN.Type
	if rawType == "" {
		rawType = v.Company.Type
	}
	r := probeResult{
		ip:     v.IP,
		ipType: rawType,
		geo: GeoInfo{
			Country:     v.Location.Country,
			CountryCode: v.Location.CountryCode,
			Region:      v.Location.State,
			City:        v.Location.City,
			Timezone:    v.Location.Timezone,
			ASN:         asn,
			Org:         v.ASN.Org,
			Latitude:    v.Location.Latitude,
			Longitude:   v.Location.Longitude,
		},
		risk: RiskFlags{
			IsDatacenter: v.IsDatacenter,
			IsProxy:      v.IsProxy,
			IsVPN:        v.IsVPN,
			IsTor:        v.IsTor,
			IsAbuser:     v.IsAbuser,
			IsMobile:     v.IsMobile,
			Hosting:      hosting,
		},
		hasRisk: true,
	}
	return r, nil
}

// fetchIPInfo 选填高级源:基础归属;若账号有 privacy 字段(付费档)则带代理/VPN/Tor/托管判定。
func fetchIPInfo(ctx context.Context, client *http.Client, ip, token string) (probeResult, error) {
	var v struct {
		IP       string `json:"ip"`
		City     string `json:"city"`
		Region   string `json:"region"`
		Country  string `json:"country"`
		Loc      string `json:"loc"`
		Org      string `json:"org"`
		Timezone string `json:"timezone"`
		Privacy  *struct {
			VPN     bool `json:"vpn"`
			Proxy   bool `json:"proxy"`
			Tor     bool `json:"tor"`
			Relay   bool `json:"relay"`
			Hosting bool `json:"hosting"`
		} `json:"privacy"`
		ASN *struct {
			ASN  string `json:"asn"`
			Name string `json:"name"`
		} `json:"asn"`
	}
	url := "https://ipinfo.io/" + ip + "/json?token=" + token
	if err := getJSON(ctx, client, url, &v); err != nil {
		return probeResult{}, err
	}
	// org 形如 "AS15169 Google LLC";拆出 ASN 与名称
	asn, org := "", v.Org
	if v.ASN != nil && v.ASN.ASN != "" {
		asn = v.ASN.ASN
		if v.ASN.Name != "" {
			org = v.ASN.Name
		}
	} else if v.Org != "" {
		if fields := strings.SplitN(v.Org, " ", 2); len(fields) == 2 && strings.HasPrefix(fields[0], "AS") {
			asn, org = fields[0], fields[1]
		}
	}
	lat, lng := 0.0, 0.0
	if parts := strings.SplitN(v.Loc, ",", 2); len(parts) == 2 {
		lat, _ = strconv.ParseFloat(parts[0], 64)
		lng, _ = strconv.ParseFloat(parts[1], 64)
	}
	r := probeResult{ip: v.IP, geo: GeoInfo{
		Country:     v.Country,
		CountryCode: v.Country,
		Region:      v.Region,
		City:        v.City,
		Timezone:    v.Timezone,
		ASN:         asn,
		Org:         org,
		Latitude:    lat,
		Longitude:   lng,
	}}
	if v.Privacy != nil {
		r.hasRisk = true
		r.risk = RiskFlags{
			IsVPN:        v.Privacy.VPN,
			IsProxy:      v.Privacy.Proxy || v.Privacy.Relay,
			IsTor:        v.Privacy.Tor,
			IsDatacenter: v.Privacy.Hosting,
		}
	}
	return r, nil
}

// probeResult 单源返回的部分结果,由 service 合并。
type probeResult struct {
	source  string // 源名(service 填),用于风险置信度与明细
	ip      string // 该源回显的出口 IP(用于 ipify 失败时兜底)
	ipType  string // ipapi.is 给的原始类型(hosting/isp/business/education...),供推导中文标签
	geo     GeoInfo
	risk    RiskFlags
	hasRisk bool // 该源是否给出了风险判定(仅 ipapi.is / ipinfo-privacy)
}
