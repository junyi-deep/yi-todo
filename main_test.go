package main

import (
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestWindowBackground(t *testing.T) {
	tests := []struct {
		goos       string
		wantType   application.BackgroundType
		wantColour application.RGBA
	}{
		{
			goos:       "windows",
			wantType:   application.BackgroundTypeSolid,
			wantColour: application.NewRGB(255, 255, 255),
		},
		{
			goos:       "darwin",
			wantType:   application.BackgroundTypeTransparent,
			wantColour: application.NewRGBA(0, 0, 0, 0),
		},
	}

	for _, test := range tests {
		t.Run(test.goos, func(t *testing.T) {
			backgroundType, colour := windowBackground(test.goos)
			if backgroundType != test.wantType {
				t.Fatalf("windowBackground(%q) type = %v, want %v", test.goos, backgroundType, test.wantType)
			}
			if colour != test.wantColour {
				t.Fatalf("windowBackground(%q) colour = %#v, want %#v", test.goos, colour, test.wantColour)
			}
		})
	}
}
