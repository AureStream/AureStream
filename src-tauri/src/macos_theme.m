#import <Cocoa/Cocoa.h>

// Force NSWindow.appearance on the main thread.
// theme values:
//   0 → nil      → inherit from NSApp (follows OS prefers-color-scheme)
//   1 → Aqua     → force light
//   2 → DarkAqua → force dark
void aurestream_set_window_appearance(void* ns_window_ptr, int theme) {
    if (ns_window_ptr == NULL) {
        return;
    }
    NSWindow* window = (__bridge NSWindow*)ns_window_ptr;

    NSAppearance* appearance = nil;
    if (theme == 1) {
        appearance = [NSAppearance appearanceNamed:NSAppearanceNameAqua];
    } else if (theme == 2) {
        if (@available(macOS 10.14, *)) {
            appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
        }
    }

    dispatch_async(dispatch_get_main_queue(), ^{
        window.appearance = appearance;
        [window displayIfNeeded];
    });
}
