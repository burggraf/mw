#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>

// This Objective-C file configures the WKWebView to fill the entire screen
// by disabling automatic content inset adjustment - THIS FIXES THE BOTTOM GAP

@interface WebViewSetup : NSObject
@end

@implementation WebViewSetup

+ (void)load {
    NSLog(@"[WebViewSetup] Class loaded, setting up notification observers...");

    // Register for notifications when the scene becomes active
    [[NSNotificationCenter defaultCenter] addObserverForName:UISceneDidActivateNotification
                                                      object:nil
                                                       queue:[NSOperationQueue mainQueue]
                                                  usingBlock:^(NSNotification *note) {
        NSLog(@"[WebViewSetup] Scene activated, configuring webviews...");
        [self configureAllWebViews];
    }];

    // Also try multiple times with delays to catch the webview creation
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.1 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [self configureAllWebViews];
    });
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.3 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [self configureAllWebViews];
    });
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [self configureAllWebViews];
    });
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [self configureAllWebViews];
    });
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [self configureAllWebViews];
    });
}

static BOOL _configured = NO;

+ (void)configureAllWebViews {
    // Get all connected scenes
    NSSet<UIScene *> *scenes = [[UIApplication sharedApplication] connectedScenes];
    for (UIScene *scene in scenes) {
        if ([scene isKindOfClass:[UIWindowScene class]]) {
            UIWindowScene *windowScene = (UIWindowScene *)scene;
            for (UIWindow *window in windowScene.windows) {
                WKWebView *webView = [self findWebViewInView:window];
                if (webView) {
                    if (!_configured) {
                        NSLog(@"[WebViewSetup] Found webview, configuring...");
                    }
                    [self configureWebView:webView];
                    _configured = YES;
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
        WKWebView *webView = [self findWebViewInView:subview];
        if (webView) {
            return webView;
        }
    }
    return nil;
}

+ (void)configureWebView:(WKWebView *)webview {
    // KEY FIX: Disable automatic content inset adjustment
    webview.scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;

    // Ensure scrollview content insets are zero
    webview.scrollView.contentInset = UIEdgeInsetsZero;
    webview.scrollView.scrollIndicatorInsets = UIEdgeInsetsZero;

    // Disable vertical scroll indicator
    webview.scrollView.showsVerticalScrollIndicator = NO;
    webview.scrollView.showsHorizontalScrollIndicator = NO;

    // Disable bouncing
    webview.scrollView.bounces = NO;

    // Set background to white to match app theme
    webview.backgroundColor = [UIColor whiteColor];
    webview.scrollView.backgroundColor = [UIColor whiteColor];
    webview.opaque = NO;

    // Configure the root view controller and force full screen
    NSSet<UIScene *> *scenes = [[UIApplication sharedApplication] connectedScenes];
    for (UIScene *scene in scenes) {
        if ([scene isKindOfClass:[UIWindowScene class]]) {
            UIWindowScene *windowScene = (UIWindowScene *)scene;
            UIWindow *window = windowScene.windows.firstObject;
            if (window) {
                UIViewController *rootVC = window.rootViewController;
                if (rootVC) {
                    rootVC.edgesForExtendedLayout = UIRectEdgeAll;
                    rootVC.extendedLayoutIncludesOpaqueBars = YES;

                    // Force the webview to fill the entire view
                    CGRect fullFrame = rootVC.view.bounds;
                    NSLog(@"[WebViewSetup] Root view bounds: %@", NSStringFromCGRect(fullFrame));
                    NSLog(@"[WebViewSetup] WebView frame before: %@", NSStringFromCGRect(webview.frame));

                    // Set frame to fill the entire root view
                    webview.frame = fullFrame;
                    webview.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;

                    // Also check if webview has a superview and set constraints
                    if (webview.superview) {
                        webview.translatesAutoresizingMaskIntoConstraints = NO;
                        [NSLayoutConstraint activateConstraints:@[
                            [webview.topAnchor constraintEqualToAnchor:webview.superview.topAnchor],
                            [webview.bottomAnchor constraintEqualToAnchor:webview.superview.bottomAnchor],
                            [webview.leadingAnchor constraintEqualToAnchor:webview.superview.leadingAnchor],
                            [webview.trailingAnchor constraintEqualToAnchor:webview.superview.trailingAnchor]
                        ]];
                        [webview.superview layoutIfNeeded];
                        NSLog(@"[WebViewSetup] Added constraints to fill superview");
                    }

                    NSLog(@"[WebViewSetup] WebView frame after: %@", NSStringFromCGRect(webview.frame));
                }
                window.backgroundColor = [UIColor whiteColor];
            }
        }
    }

    NSLog(@"[WebViewSetup] WebView configured - contentInsetAdjustmentBehavior set to Never");
}

@end
