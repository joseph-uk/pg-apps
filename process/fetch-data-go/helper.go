package main

import (
	"regexp"
	"strings"
)

// SanitizeName cleans up a name for use as a filename
func SanitizeName(name string) string {
	// Replace non-alphanumeric characters with underscores
	reg := regexp.MustCompile(`[^a-zA-Z0-9]`)
	sanitized := reg.ReplaceAllString(name, "_")
	
	// Replace multiple consecutive underscores with a single one
	multipleUnderscores := regexp.MustCompile(`_+`)
	return multipleUnderscores.ReplaceAllString(sanitized, "_")
}

// EnsureURLHasProtocol makes sure a URL has http:// or https:// prefix
func EnsureURLHasProtocol(url string) string {
	if url == "" {
		return ""
	}
	
	if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
		return "https://" + url
	}
	
	return url
}