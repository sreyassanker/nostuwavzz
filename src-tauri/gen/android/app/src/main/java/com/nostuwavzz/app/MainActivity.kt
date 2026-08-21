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
     * When the app goes to background, prevent the WebView from pausing
     * if audio is playing. The media-session plugin's foreground service
     * keeps the process alive, but we also need the WebView's JS to keep
     * running so the audio element doesn't stop.
     */
    override fun onPause() {
        // Check if a foreground media service is running — if so,
        // the media session is active and audio should keep playing.
        // We skip super.onPause() to prevent WebView JS from being suspended.
        if (app.tauri.mediasession.MediaSessionPlugin.isCurrentlyPlaying()) {
            Log.d(TAG, "onPause: audio is playing — keeping activity alive")
            // Do NOT call super.onPause() — this prevents the WebView from pausing.
            // The foreground service keeps the process alive regardless.
            return
        }
        super.onPause()
    }

    /**
     * Only stop the activity when the user explicitly navigates away
     * (back button), not when they just switch apps.
     */
    override fun onStop() {
        if (app.tauri.mediasession.MediaSessionPlugin.isCurrentlyPlaying()) {
            Log.d(TAG, "onStop: audio is playing — not stopping activity")
            // Skip super.onStop() to keep WebView alive in background
            return
        }
        super.onStop()
    }

    /**
     * Handle memory pressure gracefully — don't kill audio for moderate trim levels.
     */
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
