#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

// Expand WebView to full screen and inject safe area values as CSS custom properties

@interface WebViewSetup : NSObject
@end

@implementation WebViewSetup

+ (void)load {
    [[NSNotificationCenter defaultCenter] addObserverForName:UISceneDidActivateNotification
                                                      object:nil
                                                       queue:[NSOperationQueue mainQueue]
                                                  usingBlock:^(NSNotification *note) {
        [self configureWebViews];
    }];

    for (int i = 1; i <= 10; i++) {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(i * 0.3 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            [self configureWebViews];
        });
    }
}

+ (void)configureWebViews {
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
        if ([scene isKindOfClass:[UIWindowScene class]]) {
            UIWindowScene *windowScene = (UIWindowScene *)scene;
            for (UIWindow *window in windowScene.windows) {
                WKWebView *webView = [self findWebViewInView:window];
                if (webView) {
                    [self configureWebView:webView inWindow:window];
                }
            }
        }
    }
}

+ (WKWebView *)findWebViewInView:(UIView *)view {
    if ([view isKindOfClass:[WKWebView class]]) {
        return (WKWebView *)view;
    }
    for (UIView *subview in view.subviews) {
        WKWebView *found = [self findWebViewInView:subview];
        if (found) return found;
    }
    return nil;
}

+ (void)configureWebView:(WKWebView *)webView inWindow:(UIWindow *)window {
    static BOOL viewConfigured = NO;

    // Get safe area BEFORE any modifications
    UIEdgeInsets safeArea = window.safeAreaInsets;

    // Configure view hierarchy only once
    if (!viewConfigured) {
        viewConfigured = YES;

        CGRect screenBounds = window.screen.bounds;

        // Make WebView fill entire screen
        UIView *current = webView;
        while (current && current != window) {
            current.translatesAutoresizingMaskIntoConstraints = YES;
            NSMutableArray *toRemove = [NSMutableArray array];
            for (NSLayoutConstraint *c in current.superview.constraints) {
                if (c.firstItem == current || c.secondItem == current) {
                    [toRemove addObject:c];
                }
            }
            [current.superview removeConstraints:toRemove];
            current.frame = screenBounds;
            current = current.superview;
        }

        // Expand layout to edges
        UIViewController *rootVC = window.rootViewController;
        if (rootVC) {
            rootVC.additionalSafeAreaInsets = UIEdgeInsetsMake(-safeArea.top, 0, -safeArea.bottom, 0);
        }

        webView.scrollView.bounces = NO;
        webView.scrollView.showsVerticalScrollIndicator = NO;
        webView.scrollView.showsHorizontalScrollIndicator = NO;

        NSLog(@"[WebViewSetup] Configured WebView. Safe area: top=%f, bottom=%f", safeArea.top, safeArea.bottom);
    }

    // Inject safe area as CSS custom properties (do this repeatedly to ensure it sticks)
    NSString *js = [NSString stringWithFormat:
        @"(function(){"
        @"var s=document.documentElement.style;"
        @"s.setProperty('--safe-area-inset-top','%fpx');"
        @"s.setProperty('--safe-area-inset-bottom','%fpx');"
        @"s.setProperty('--safe-area-inset-left','%fpx');"
        @"s.setProperty('--safe-area-inset-right','%fpx');"
        @"})();",
        safeArea.top, safeArea.bottom, safeArea.left, safeArea.right];

    [webView evaluateJavaScript:js completionHandler:nil];
}

@end
