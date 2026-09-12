import Foundation
import Capacitor
import CoreLocation

/**
 * Background-capable GPS.
 *
 * The web build calls navigator.geolocation.watchPosition from inside the
 * WKWebView. iOS suspends that when the screen locks, which is why a locked-phone
 * run came back with a route full of holes. A native CLLocationManager with
 * allowsBackgroundLocationUpdates keeps delivering fixes with the screen off, and
 * keeps the whole app alive in the background so coaching continues too.
 *
 * allowsBackgroundLocationUpdates REQUIRES `location` in UIBackgroundModes in
 * Info.plist. Setting it without that key throws.
 *
 * Positions are forwarded to JS in the same shape as the browser Geolocation API
 * so GuidedWalk's existing filtering, pace maths and path tracking are unchanged.
 */
@objc(CalmKitLocationPlugin)
public class CalmKitLocationPlugin: CAPPlugin, CLLocationManagerDelegate {

    private let manager = CLLocationManager()
    private var running = false

    public override func load() {
        manager.delegate = self
        // BestForNavigation is the highest accuracy tier and the right one for
        // route tracking. GuidedWalk still discards fixes worse than 30 m.
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.activityType = .fitness
        manager.distanceFilter = kCLDistanceFilterNone
        // iOS will otherwise pause updates when it thinks movement stopped, and
        // it does not reliably resume. A walk must never be silently dropped.
        manager.pausesLocationUpdatesAutomatically = false
    }

    @objc func start(_ call: CAPPluginCall) {
        let status: CLAuthorizationStatus
        if #available(iOS 14.0, *) {
            status = manager.authorizationStatus
        } else {
            status = CLLocationManager.authorizationStatus()
        }

        if status == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else if status == .denied || status == .restricted {
            call.reject("Location permission is denied. Enable it in Settings to track your route.")
            return
        }

        do {
            manager.allowsBackgroundLocationUpdates = true
            if #available(iOS 11.0, *) {
                // The blue status bar pill. Required by Apple when tracking in the
                // background, and it is the honest thing to show the user anyway.
                manager.showsBackgroundLocationIndicator = true
            }
            manager.startUpdatingLocation()
            running = true
            call.resolve(["ok": true])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false
        running = false
        call.resolve(["ok": true])
    }

    @objc func isRunning(_ call: CAPPluginCall) {
        call.resolve(["running": running])
    }

    public func locationManager(_ mgr: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        notifyListeners("position", data: [
            "latitude": loc.coordinate.latitude,
            "longitude": loc.coordinate.longitude,
            // horizontalAccuracy is negative when the fix is invalid. Pass a large
            // number so the existing <= 30 m filter rejects it like any bad fix.
            "accuracy": loc.horizontalAccuracy >= 0 ? loc.horizontalAccuracy : 9999,
            "altitude": loc.verticalAccuracy >= 0 ? loc.altitude : NSNull(),
            "speed": loc.speed >= 0 ? loc.speed : NSNull(),
            "timestamp": loc.timestamp.timeIntervalSince1970 * 1000
        ])
    }

    public func locationManager(_ mgr: CLLocationManager, didFailWithError error: Error) {
        notifyListeners("locationError", data: ["message": error.localizedDescription])
    }
}
