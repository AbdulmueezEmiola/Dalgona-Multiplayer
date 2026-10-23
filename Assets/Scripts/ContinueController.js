//@component
// @input Component.ScriptComponent controller

function onTap() {
    script.controller.hide()
}
script.createEvent("TapEvent").bind(onTap);

