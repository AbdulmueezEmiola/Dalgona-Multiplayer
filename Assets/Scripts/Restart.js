//@component
// Restart.js
// Tapped from the Match Over screen. Turn-based matches are driven by the
// paired Snap send/receive flow, not by this Lens — there's no in-Lens
// "play again" the way SinglePlayerController.js has. This just resets the
// local view (useful for dismissing Match Over in Preview/testing); a real
// new match starts by reopening the Lens from a fresh Snap.
var tapEvent = script.createEvent("TapEvent");

tapEvent.bind(function () {
    print("✅ Restart tapped");
    global.scene.reload();
});