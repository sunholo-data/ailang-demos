package main

import (
	"os"
	"strings"
	"testing"
)

func TestScenarios(t *testing.T) {
	for _, tc := range []struct {
		name, status string
		authority    bool
	}{
		{"direct", "blocked", false}, {"url", "blocked", false}, {"helper", "blocked", false},
		{"record", "blocked", false}, {"relabel", "blocked", false}, {"redact", "allowed", true}, {"authority", "allowed", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b, err := os.ReadFile("../examples/" + tc.name + ".ail")
			if err != nil {
				t.Fatal(err)
			}
			result := Check(string(b))
			if result.Status != tc.status || result.Declassify != tc.authority {
				t.Fatalf("%+v", result)
			}
			if tc.status == "blocked" && !strings.Contains(strings.Join(result.Diagnostics, " "), "information-flow") && !strings.Contains(strings.Join(result.Diagnostics, " "), "declass") {
				t.Fatalf("Not an IFC diagnostic: %+v", result)
			}
		})
	}
}

func TestInvalidIsNotBlocked(t *testing.T) {
	for _, source := range []string{"not AILANG", "module test\nlet value = 42", "module test\nexport func f() -> int { true }", strings.Repeat("a", 16001), "module test\nimport std/net (httpGet)"} {
		if result := Check(source); result.Status != "invalid" {
			t.Fatalf("%+v", result)
		}
	}
}
