package appsearch

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

const (
	itunesSearchURL = "https://itunes.apple.com/search"
	itunesLookupURL = "https://itunes.apple.com/lookup"
)

type itunesEntry struct {
	BundleID          string  `json:"bundleId"`
	TrackID           int64   `json:"trackId"`
	TrackName         string  `json:"trackName"`
	ArtistName        string  `json:"artistName"`
	SellerName        string  `json:"sellerName"`
	Version           string  `json:"version"`
	ArtworkURL100     string  `json:"artworkUrl100"`
	ArtworkURL512     string  `json:"artworkUrl512"`
	AverageUserRating float64 `json:"averageUserRating"`
	PrimaryGenreName  string  `json:"primaryGenreName"`
	TrackViewURL      string  `json:"trackViewUrl"`
}

type itunesResp struct {
	ResultCount int           `json:"resultCount"`
	Results     []itunesEntry `json:"results"`
}

func searchITunes(ctx context.Context, client *http.Client, keyword, country string, limit int) ([]SearchResultItem, error) {
	if country == "" {
		country = "cn"
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	q := url.Values{}
	q.Set("term", keyword)
	q.Set("country", country)
	q.Set("media", "software")
	q.Set("entity", "software,iPadSoftware")
	q.Set("limit", strconv.Itoa(limit))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, itunesSearchURL+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", defaultUA)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("iTunes: http %d", resp.StatusCode)
	}

	var parsed itunesResp
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("iTunes: decode: %w", err)
	}

	return convertITunesEntries(parsed.Results, country), nil
}

// itunesLookupBundleIDs 批量按 trackId 反查 bundleId，返回 trackId→bundleId 映射。
// 任何错误都返回空 map（降级为不补充 bundleId，不影响主流程）。
func itunesLookupBundleIDs(ctx context.Context, client *http.Client, trackIDs []string, country string) map[string]string {
	out := map[string]string{}
	if len(trackIDs) == 0 {
		return out
	}
	if country == "" {
		country = "cn"
	}
	q := url.Values{}
	q.Set("id", joinCSV(trackIDs))
	q.Set("country", country)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, itunesLookupURL+"?"+q.Encode(), nil)
	if err != nil {
		return out
	}
	req.Header.Set("User-Agent", defaultUA)

	resp, err := client.Do(req)
	if err != nil {
		return out
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return out
	}
	var parsed itunesResp
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return out
	}
	for _, e := range parsed.Results {
		if e.TrackID == 0 || e.BundleID == "" {
			continue
		}
		out[strconv.FormatInt(e.TrackID, 10)] = e.BundleID
	}
	return out
}

func joinCSV(parts []string) string {
	b := strings.Builder{}
	for i, p := range parts {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(p)
	}
	return b.String()
}

func convertITunesEntries(entries []itunesEntry, country string) []SearchResultItem {
	items := make([]SearchResultItem, 0, len(entries))
	for _, e := range entries {
		icon := e.ArtworkURL512
		if icon == "" {
			icon = e.ArtworkURL100
		}
		seller := e.SellerName
		if seller == "" {
			seller = e.ArtistName
		}
		items = append(items, SearchResultItem{
			Source:    SourceITunes,
			Platform:  PlatformIOS,
			PkgName:   e.BundleID,
			Name:      e.TrackName,
			Developer: seller,
			Icon:      icon,
			Version:   e.Version,
			Rating:    e.AverageUserRating,
			Country:   country,
			Extra: map[string]string{
				"trackId": strconv.FormatInt(e.TrackID, 10),
				"genre":   e.PrimaryGenreName,
				"url":     e.TrackViewURL,
			},
		})
	}
	return items
}
