package com.mobileworship.display

import android.os.Bundle
import android.view.KeyEvent
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
  }

  // Map Android key codes to JavaScript key names
  private fun getJsKeyName(keyCode: Int): String? {
    return when (keyCode) {
      KeyEvent.KEYCODE_DPAD_CENTER -> "Enter"
      KeyEvent.KEYCODE_ENTER -> "Enter"
      KeyEvent.KEYCODE_NUMPAD_ENTER -> "Enter"
      KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
      KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
      KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
      KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
      KeyEvent.KEYCODE_BACK -> "Escape"
      KeyEvent.KEYCODE_ESCAPE -> "Escape"
      else -> null
    }
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
    val jsKeyName = getJsKeyName(keyCode)

    if (jsKeyName != null && webView != null) {
      // Dispatch a KeyboardEvent to JavaScript
      // This works even when WebView doesn't have focus
      val js = """
        (function() {
          var event = new KeyboardEvent('keydown', {
            key: '$jsKeyName',
            code: '$jsKeyName',
            keyCode: $keyCode,
            which: $keyCode,
            bubbles: true,
            cancelable: true
          });
          document.dispatchEvent(event);
        })();
      """.trimIndent()

      webView?.evaluateJavascript(js, null)

      // For Back key, let the default behavior happen too (so user can exit)
      // For other keys, we've handled it
      return if (keyCode == KeyEvent.KEYCODE_BACK) {
        super.onKeyDown(keyCode, event)
      } else {
        true
      }
    }

    return super.onKeyDown(keyCode, event)
  }

  override fun onKeyUp(keyCode: Int, event: KeyEvent?): Boolean {
    val jsKeyName = getJsKeyName(keyCode)

    if (jsKeyName != null && webView != null) {
      val js = """
        (function() {
          var event = new KeyboardEvent('keyup', {
            key: '$jsKeyName',
            code: '$jsKeyName',
            keyCode: $keyCode,
            which: $keyCode,
            bubbles: true,
            cancelable: true
          });
          document.dispatchEvent(event);
        })();
      """.trimIndent()

      webView?.evaluateJavascript(js, null)

      return if (keyCode == KeyEvent.KEYCODE_BACK) {
        super.onKeyUp(keyCode, event)
      } else {
        true
      }
    }

    return super.onKeyUp(keyCode, event)
  }
}
