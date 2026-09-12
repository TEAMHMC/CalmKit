#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(CalmKitAudioPlugin, "CalmKitAudio",
    CAP_PLUGIN_METHOD(configure, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(duck, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(unduck, CAPPluginReturnPromise);
)

CAP_PLUGIN(CalmKitLocationPlugin, "CalmKitLocation",
    CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(isRunning, CAPPluginReturnPromise);
)
