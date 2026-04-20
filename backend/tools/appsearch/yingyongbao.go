package appsearch

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
)

// 应用宝 tRPC 动态卡片接口。逆向自 sj.qq.com 的 _app bundle。
// 该接口无签名，但 head 字段需严格对齐服务端期望的结构。
const yingyongbaoSearchURL = "https://yybadaccess.3g.qq.com/v2/dc_pcyyb_official"

type yybPayload struct {
	Head yybHead `json:"head"`
	Body yybBody `json:"body"`
}

type yybHead struct {
	Cmd         string         `json:"cmd"`
	AuthInfo    yybAuthInfo    `json:"authInfo"`
	DeviceInfo  yybDeviceInfo  `json:"deviceInfo"`
	UserInfo    yybUserInfo    `json:"userInfo"`
	ExpSceneIds string         `json:"expSceneIds"`
	HostAppInfo yybHostAppInfo `json:"hostAppInfo"`
}

type yybAuthInfo struct {
	BusinessID string `json:"businessId"`
}

type yybDeviceInfo struct {
	PlatformType int `json:"platformType"` // 1=DESKTOP 2=MOBILE
}

type yybUserInfo struct {
	GUID string `json:"guid"`
}

type yybHostAppInfo struct {
	Scene string `json:"scene"`
}

type yybBody struct {
	BID     string                    `json:"bid"`
	Offset  int                       `json:"offset"`
	Size    int                       `json:"size"`
	Preview bool                      `json:"preview"`
	ListS   map[string]yybRepStrValue `json:"listS"`
	Layout  string                    `json:"layout"`
}

type yybRepStrValue struct {
	RepStr []string `json:"repStr"`
}

type yybSearchItem struct {
	PkgName       string `json:"pkg_name"`
	Name          string `json:"name"`
	VersionName   string `json:"version_name"`
	AppID         string `json:"app_id"`
	IconURL       string `json:"icon"`
	Developer     string `json:"developer"`
	CateNameNew   string `json:"cate_name_new"`
	AverageRating string `json:"average_rating"`
	ApkSize       string `json:"apk_size"`
	EditorIntro   string `json:"editor_intro"`
	Tags          string `json:"tags"`
	IosURL        string `json:"ios_url"`
}

type yybSearchData struct {
	Components []struct {
		Data struct {
			ItemData []yybSearchItem `json:"itemData"`
		} `json:"data"`
	} `json:"components"`
}

type yybSearchResp struct {
	Ret  int           `json:"ret"`
	Msg  string        `json:"msg"`
	Data yybSearchData `json:"data"`
}

func searchYingYongBao(ctx context.Context, client *http.Client, keyword string, size int) ([]SearchResultItem, error) {
	if size <= 0 || size > 50 {
		size = 20
	}
	payload := yybPayload{
		Head: yybHead{
			Cmd:         "dc_pcyyb_official",
			AuthInfo:    yybAuthInfo{BusinessID: "AuthName"},
			DeviceInfo:  yybDeviceInfo{PlatformType: 1},
			UserInfo:    yybUserInfo{GUID: randomGUID()},
			ExpSceneIds: "",
			HostAppInfo: yybHostAppInfo{Scene: "search_result"},
		},
		Body: yybBody{
			BID:     "yybhome",
			Offset:  0,
			Size:    size,
			Preview: false,
			ListS: map[string]yybRepStrValue{
				"region":  {RepStr: []string{"CN"}},
				"keyword": {RepStr: []string{keyword}},
			},
			Layout: "yybn_search_result_list",
		},
	}
	buf, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, yingyongbaoSearchURL, bytes.NewReader(buf))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", defaultUA)
	req.Header.Set("Origin", "https://sj.qq.com")
	req.Header.Set("Referer", "https://sj.qq.com/")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		errMsg := resp.Header.Get("Trpc-Error-Msg")
		if errMsg != "" {
			return nil, fmt.Errorf("应用宝: http %d, %s", resp.StatusCode, errMsg)
		}
		return nil, fmt.Errorf("应用宝: http %d", resp.StatusCode)
	}
	var parsed yybSearchResp
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("应用宝: decode: %w", err)
	}
	if parsed.Ret != 0 {
		return nil, fmt.Errorf("应用宝: ret=%d msg=%s", parsed.Ret, parsed.Msg)
	}

	items := make([]SearchResultItem, 0, 16)
	for _, comp := range parsed.Data.Components {
		for _, it := range comp.Data.ItemData {
			if it.PkgName == "" {
				continue
			}
			rating := parseFloat(it.AverageRating)
			items = append(items, SearchResultItem{
				Source:    SourceYingYongBao,
				Platform:  PlatformAndroid,
				PkgName:   it.PkgName,
				Name:      it.Name,
				Developer: it.Developer,
				Icon:      it.IconURL,
				Version:   it.VersionName,
				Rating:    rating,
				Country:   "cn",
				Extra: map[string]string{
					"appId":    it.AppID,
					"genre":    it.CateNameNew,
					"fileSize": humanFileSize(it.ApkSize),
					"intro":    it.EditorIntro,
					"tags":     it.Tags,
					"iosUrl":   it.IosURL,
				},
			})
		}
	}
	return items, nil
}

func randomGUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// parseFloat 宽松解析，失败返回 0
func parseFloat(s string) float64 {
	if s == "" {
		return 0
	}
	var f float64
	if _, err := fmt.Sscanf(s, "%f", &f); err != nil {
		return 0
	}
	return f
}

// humanFileSize 将 "255119524"（字节字符串）转成 "243.3 MB"；非纯数字原样返回。
func humanFileSize(s string) string {
	if s == "" {
		return ""
	}
	var n int64
	if _, err := fmt.Sscanf(s, "%d", &n); err != nil || n <= 0 {
		return s
	}
	units := []string{"B", "KB", "MB", "GB"}
	f := float64(n)
	i := 0
	for f >= 1024 && i < len(units)-1 {
		f /= 1024
		i++
	}
	return fmt.Sprintf("%.1f %s", f, units[i])
}
