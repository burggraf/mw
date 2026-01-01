# THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!!

# Copyright 2020-2023 Tauri Programme within The Commons Conservancy
# SPDX-License-Identifier: Apache-2.0
# SPDX-License-Identifier: MIT

-keep class com.mobileworship.display.* {
  native <methods>;
}

-keep class com.mobileworship.display.WryActivity {
  public <init>(...);

  void setWebView(com.mobileworship.display.RustWebView);
  java.lang.Class getAppClass(...);
  java.lang.String getVersion();
}

-keep class com.mobileworship.display.Ipc {
  public <init>(...);

  @android.webkit.JavascriptInterface public <methods>;
}

-keep class com.mobileworship.display.RustWebView {
  public <init>(...);

  void loadUrlMainThread(...);
  void loadHTMLMainThread(...);
  void evalScript(...);
}

-keep class com.mobileworship.display.RustWebChromeClient,com.mobileworship.display.RustWebViewClient {
  public <init>(...);
}
