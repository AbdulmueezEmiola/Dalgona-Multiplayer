//@component
var tapEvent = script.createEvent("TapEvent");

tapEvent.bind(function () {
    print("✅ Restart tapped");
    // global.scene.reload();
});