package clinic.healthmatters.calmkit.nativeplugins

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Android counterpart to the iOS audio session plugin.
 *
 * Android has no audio *session category*; it has audio *focus*. Requesting
 * AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK tells the system we are about to play a
 * short spoken cue and that whatever else is playing should duck rather than
 * stop. Abandoning focus afterwards restores it to full volume.
 *
 * USAGE_ASSISTANCE_NAVIGATION_GUIDANCE is deliberate: it is the usage every
 * turn-by-turn and coaching app declares, and it is what makes music players
 * duck politely instead of pausing.
 */
@CapacitorPlugin(name = "CalmKitAudio")
class CalmKitAudioPlugin : Plugin() {

    private var focusRequest: AudioFocusRequest? = null
    private var ducking = false

    private val audioManager: AudioManager
        get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    @PluginMethod
    fun configure(call: PluginCall) {
        // Nothing to pre-configure on Android; focus is requested per cue.
        call.resolve(JSObject().put("ok", true))
    }

    @PluginMethod
    fun duck(call: PluginCall) {
        if (ducking) {
            call.resolve(JSObject().put("ok", true).put("alreadyDucking", true))
            return
        }

        val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val attributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            val request = AudioFocusRequest
                .Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(attributes)
                .setWillPauseWhenDucked(false)
                .build()
            focusRequest = request
            audioManager.requestAudioFocus(request)
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(
                null,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
            )
        }

        ducking = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        call.resolve(JSObject().put("ok", ducking))
    }

    @PluginMethod
    fun unduck(call: PluginCall) {
        if (!ducking) {
            call.resolve(JSObject().put("ok", true).put("alreadyIdle", true))
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
            focusRequest = null
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(null)
        }

        ducking = false
        call.resolve(JSObject().put("ok", true))
    }
}
