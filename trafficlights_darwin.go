//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>

// Port of Electron's trafficLightPosition: inset the window buttons from the
// left edge and centre them on the toolbar. The toolbar's centre line is
// measured by the page (cvCenterY, in points from the top of the window) so
// the buttons line up with the HTML toolbar icons exactly.
static CGFloat cvX = 16, cvCenterY = 19;

static void cvLayout(NSWindow *w) {
	if (w.styleMask & NSWindowStyleMaskFullScreen) return; // buttons live in the menu-bar overlay
	NSButton *close = [w standardWindowButton:NSWindowCloseButton];
	NSButton *mini  = [w standardWindowButton:NSWindowMiniaturizeButton];
	NSButton *zoom  = [w standardWindowButton:NSWindowZoomButton];
	if (!close || !mini || !zoom) return;
	NSView *titlebar = close.superview;     // NSTitlebarView
	NSView *container = titlebar.superview; // NSTitlebarContainerView
	if (!container) return;

	// Make the titlebar area tall enough to hold buttons centred at cvCenterY.
	CGFloat barHeight = ceil(cvCenterY * 2);
	NSRect cf = container.frame;
	cf.size.height = barHeight;
	cf.origin.y = w.frame.size.height - barHeight;
	[container setFrame:cf];
	[titlebar setFrame:container.bounds];

	CGFloat spacing = mini.frame.origin.x - close.frame.origin.x;
	if (spacing <= 0 || spacing > 40) spacing = 20;
	// Window coordinates have their origin at the bottom-left of the frame.
	NSPoint centre = [titlebar convertPoint:NSMakePoint(0, w.frame.size.height - cvCenterY) fromView:nil];
	NSArray<NSButton *> *buttons = @[close, mini, zoom];
	for (NSUInteger i = 0; i < buttons.count; i++) {
		NSButton *b = buttons[i];
		CGFloat y = round(centre.y - b.frame.size.height / 2); // correct for flipped or unflipped views
		[b setFrameOrigin:NSMakePoint(cvX + i * spacing, y)];
	}
}

static void cvSetCenterY(void *win, double y) {
	if (y <= 0) return;
	cvCenterY = y;
	NSWindow *w = (__bridge NSWindow *)win;
	if (w) cvLayout(w);
}

// Vertical centre of the close button, in points from the top of the window.
static double cvTrafficLightsCenterY(void *win) {
	NSWindow *w = (__bridge NSWindow *)win;
	NSButton *close = [w standardWindowButton:NSWindowCloseButton];
	if (!close || !close.superview) return 0;
	NSRect r = [close.superview convertRect:close.frame toView:nil];
	return w.frame.size.height - NSMidY(r);
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

// alignTrafficLights centres the buttons on y (CSS px from the window top)
// and returns where they ended up: {centerY, rightEdge}.
func alignTrafficLights(w *application.WebviewWindow, y float64) (float64, float64) {
	var cy, edge float64
	application.InvokeSync(func() {
		if p := w.NativeWindow(); p != nil {
			C.cvSetCenterY(p, C.double(y))
			cy = float64(C.cvTrafficLightsCenterY(p))
			edge = float64(C.cvTrafficLightsRightEdge(p))
		}
	})
	return cy, edge
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
