import Foundation
import Capacitor
import AVFoundation

/**
 * Owns the iOS audio session so coaching cues play *over* the user's own music
 * instead of stopping it.
 *
 * Category .playback with [.mixWithOthers, .duckOthers] is the configuration
 * fitness apps use: other audio keeps playing, and dips only while our session
 * is active. So the session is activated immediately before a cue and
 * deactivated after it, which is what produces "music dips, coach speaks, music
 * comes back up".
 *
 * Mode .spokenAudio tells iOS this is speech, which gives a deeper, cleaner duck
 * than the default and is the correct mode for voice guidance.
 *
 * The app is kept alive in the background by the `location` background mode, not
 * by audio, so there is no need to hold the session open between cues and no
 * need for the silent-WAV keepalive the web build uses.
 */
@objc(CalmKitAudioPlugin)
public class CalmKitAudioPlugin: CAPPlugin {

    private var ducking = false

    @objc func configure(_ call: CAPPluginCall) {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playback,
                mode: .spokenAudio,
                options: [.mixWithOthers, .duckOthers]
            )
            call.resolve(["ok": true])
        } catch {
            call.reject("Could not configure the audio session: \(error.localizedDescription)")
        }
    }

    /// Activate the session so other audio ducks. Called just before a cue plays.
    @objc func duck(_ call: CAPPluginCall) {
        if ducking {
            call.resolve(["ok": true, "alreadyDucking": true])
            return
        }
        do {
            try AVAudioSession.sharedInstance().setActive(true)
            ducking = true
            call.resolve(["ok": true])
        } catch {
            call.reject("Could not activate the audio session: \(error.localizedDescription)")
        }
    }

    /// Deactivate the session so other audio returns to full volume.
    @objc func unduck(_ call: CAPPluginCall) {
        if !ducking {
            call.resolve(["ok": true, "alreadyIdle": true])
            return
        }
        do {
            try AVAudioSession.sharedInstance().setActive(
                false,
                options: .notifyOthersOnDeactivation
            )
            ducking = false
            call.resolve(["ok": true])
        } catch {
            // Deactivation can fail if something else is still using the session.
            // Never surface this: the cue already played and the walk must continue.
            ducking = false
            call.resolve(["ok": false, "reason": error.localizedDescription])
        }
    }
}
