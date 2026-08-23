package main

import "testing"

func TestCloseDialogButtonLabels(t *testing.T) {
	tests := []struct {
		goos        string
		exitLabel   string
		cancelLabel string
	}{
		{goos: "windows", exitLabel: "Yes", cancelLabel: "No"},
		{goos: "darwin", exitLabel: "退出", cancelLabel: "取消"},
		{goos: "linux", exitLabel: "退出", cancelLabel: "取消"},
	}

	for _, test := range tests {
		t.Run(test.goos, func(t *testing.T) {
			exitLabel, cancelLabel := closeDialogButtonLabels(test.goos)
			if exitLabel != test.exitLabel || cancelLabel != test.cancelLabel {
				t.Fatalf("closeDialogButtonLabels(%q) = (%q, %q), want (%q, %q)", test.goos, exitLabel, cancelLabel, test.exitLabel, test.cancelLabel)
			}
		})
	}
}
