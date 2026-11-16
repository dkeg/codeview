//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>

// Port of Electron's trafficLightPosition: vertically centre the window buttons
// on CodeView's 38px toolbar and inset them from the left edge.
static CGFloat cvX = 16, cvBarHeight = 38;

static void cvLayout(NSWindow *w) {
	if (w.styleMask & NSWindowStyleMaskFullScreen) return; // buttons live in the menu-bar overlay
	NSButton *close = [w standardWindowButton:NSWindowCloseButton];
	NSButton *mini  = [w standardWindowButton:NSWindowMiniaturizeButton];
	NSButton *zoom  = [w standardWindowButton:NSWindowZoomButton];
	if (!close || !mini || !zoom) return;
	NSView *container = close.superview.superview; // NSTitlebarContainerView
	if (!container) return;

	NSRect cf = container.frame;
	cf.size.height = cvBarHeight;
	cf.origin.y = w.frame.size.height - cvBarHeight;
	[container setFrame:cf];

	CGFloat spacing = mini.frame.origin.x - close.frame.origin.x;
	if (spacing <= 0 || spacing > 40) spacing = 20;
	NSArray<NSButton *> *buttons = @[close, mini, zoom];
	for (NSUInteger i = 0; i < buttons.count; i++) {
		NSButton *b = buttons[i];
		CGFloat y = round((cvBarHeight - b.frame.size.height) / 2);
		// The titlebar view is flipped=NO: y is measured from the bottom of the container.
		[b setFrameOrigin:NSMakePoint(cvX + i * spacing, y)];
	}
}

// Right edge of the zoom button in window points (0 if unknown).
static double cvTrafficLightsRightEdge(void *win) {
	NSWindow *w = (__bridge NSWindow *)win;
	NSButton *zoom = [w standardWindowButton:NSWindowZoomButton];
	if (!zoom || !zoom.superview) return 0;
	NSRect r = [zoom.superview convertRect:zoom.frame toView:nil];
	return NSMaxX(r);
}

static void cvInstallTrafficLights(void *win) {
	NSWindow *w = (__bridge NSWindow *)win;
	if (!w) return;
	cvLayout(w);
	__weak NSWindow *weakW = w;
	NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
	NSArray *names = @[NSWindowDidResizeNotification, NSWindowDidEndLiveResizeNotification,
	                   NSWindowDidExitFullScreenNotification, NSWindowDidBecomeKeyNotification,
	                   NSWindowDidResignKeyNotification, NSWindowDidChangeBackingPropertiesNotification];
	for (NSNotificationName n in names) {
		[nc addObserverForName:n object:w queue:[NSOperationQueue mainQueue] usingBlock:^(NSNotification *note) {
			// Let AppKit finish its own titlebar layout first, then override it.
			dispatch_async(dispatch_get_main_queue(), ^{ NSWindow *sw = weakW; if (sw) cvLayout(sw); });
		}];
	}
}
*/
import "C"

import (
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// trafficLightsRightEdge reports where the window buttons end so the toolbar
// can keep clear of them (sizes differ between macOS releases).
func trafficLightsRightEdge(w *application.WebviewWindow) float64 {
	var edge float64
	application.InvokeSync(func() {
		if p := w.NativeWindow(); p != nil {
			edge = float64(C.cvTrafficLightsRightEdge(p))
		}
	})
	return edge
}

// positionTrafficLights installs the layout once the native NSWindow exists.
func positionTrafficLights(w *application.WebviewWindow) {
	var once sync.Once
	w.OnWindowEvent(events.Common.WindowShow, func(*application.WindowEvent) {
		once.Do(func() {
			application.InvokeAsync(func() {
				if p := w.NativeWindow(); p != nil {
					C.cvInstallTrafficLights(p)
				}
			})
		})
	})
}
