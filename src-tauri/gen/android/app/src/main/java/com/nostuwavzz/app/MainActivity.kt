package com.nostuwavzz.app

import android.content.ComponentCallbacks2
import android.os.Bundle
import android.util.Log
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {

    companion object {
        private const val TAG = "NostuWavzz"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
    }

    /**
     * Always skip onPause to keep WebView alive for background audio.
     * The foreground service handles process lifecycle.
     */
    override fun onPause() {
        Log.d(TAG, "onPause: keeping activity alive for background playback")
        return
    }

    /**
     * Always skip onStop to keep WebView alive in background.
     */
    override fun onStop() {
        Log.d(TAG, "onStop: keeping activity alive for background playback")
        return
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        when {
            level >= ComponentCallbacks2.TRIM_MEMORY_COMPLETE -> {
                Log.w(TAG, "onTrimMemory: CRITICAL (level=$level) — app may be killed")
            }
            level >= ComponentCallbacks2.TRIM_MEMORY_MODERATE -> {
                Log.d(TAG, "onTrimMemory: MODERATE (level=$level)")
            }
            level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND -> {
                Log.d(TAG, "onTrimMemory: BACKGROUND (level=$level)")
            }
        }
    }
}
