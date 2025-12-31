package com.mobileworship.app

import android.os.Bundle
import android.webkit.WebView
import android.webkit.JavascriptInterface
import android.view.KeyEvent
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // Store WebView reference when it's created
  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    // Add JavaScript interface for app control
    webView.addJavascriptInterface(AppInterface(), "AndroidApp")
    super.onWebViewCreate(webView)
  }

  // Request focus on WebView when window gains focus
  // This fixes the issue where D-pad SELECT doesn't work until arrow keys are pressed
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      webView?.let { wv ->
        wv.requestFocus()
        // Also ensure the WebView can receive focus
        wv.isFocusable = true
        wv.isFocusableInTouchMode = true
      }
    }
  }

  // Forward D-pad key events to WebView for Android TV support
  override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
    // Handle D-pad center (SELECT) button - keyCode 23
    // This ensures the WebView receives the Enter key event
    if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER) {
      webView?.let { wv ->
        // Dispatch as Enter key to WebView
        val enterEvent = KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER)
        wv.dispatchKeyEvent(enterEvent)
        return true
      }
    }

    // Handle Back button - forward to WebView as Escape instead of exiting app
    if (keyCode == KeyEvent.KEYCODE_BACK) {
      webView?.let { wv ->
        // Dispatch as Escape key to WebView so JavaScript can handle it
        val escapeEvent = KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ESCAPE)
        wv.dispatchKeyEvent(escapeEvent)
        return true // Consume the event, don't let Android exit the app
      }
    }

    return super.onKeyDown(keyCode, event)
  }

  override fun onKeyUp(keyCode: Int, event: KeyEvent?): Boolean {
    if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER) {
      webView?.let { wv ->
        val enterEvent = KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER)
        wv.dispatchKeyEvent(enterEvent)
        return true
      }
    }

    if (keyCode == KeyEvent.KEYCODE_BACK) {
      webView?.let { wv ->
        val escapeEvent = KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ESCAPE)
        wv.dispatchKeyEvent(escapeEvent)
        return true
      }
    }

    return super.onKeyUp(keyCode, event)
  }

  // JavaScript interface for app control
  inner class AppInterface {
    @JavascriptInterface
    fun exitApp() {
      // Run on UI thread to properly finish the activity
      runOnUiThread {
        finishAffinity()
      }
    }
  }
}
