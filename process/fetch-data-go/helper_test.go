package main

import (
	"testing"
)

func TestSanitizeName(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "normal name",
			input:    "XCTrack",
			expected: "XCTrack",
		},
		{
			name:     "name with spaces",
			input:    "Fly Sky High",
			expected: "Fly_Sky_High",
		},
		{
			name:     "name with special characters",
			input:    "App 2.0 (Beta!)",
			expected: "App_2_0_Beta_",
		},
		{
			name:     "multiple consecutive special characters",
			input:    "App  --  Name",
			expected: "App_Name",
		},
		{
			name:     "empty string",
			input:    "",
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := SanitizeName(tt.input)
			if result != tt.expected {
				t.Errorf("SanitizeName(%q) = %q, expected %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestEnsureURLHasProtocol(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "url with https",
			input:    "https://example.com",
			expected: "https://example.com",
		},
		{
			name:     "url with http",
			input:    "http://example.com",
			expected: "http://example.com",
		},
		{
			name:     "url without protocol",
			input:    "example.com",
			expected: "https://example.com",
		},
		{
			name:     "empty string",
			input:    "",
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := EnsureURLHasProtocol(tt.input)
			if result != tt.expected {
				t.Errorf("EnsureURLHasProtocol(%q) = %q, expected %q", tt.input, result, tt.expected)
			}
		})
	}
}
