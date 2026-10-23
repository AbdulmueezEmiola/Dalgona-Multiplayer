//@component
// Timer.js

// @input Component.Text timerText
// @input float startTime = 30.0
// @input Component.ScriptComponent crackScript


var timeLeft = 0;
var isRunning = true;

var updateEvent = script.createEvent("UpdateEvent");
updateEvent.bind(function() {
    if (!isRunning) return;

    // getDeltaTime() = how many seconds passed since last frame
    timeLeft += getDeltaTime();

    updateDisplay();
});

function updateDisplay() {
    // Convert to whole seconds and format as "0:30", "0:09" etc
    var seconds = Math.ceil(timeLeft);
    var mins = Math.floor(seconds / 60);
    var secs = seconds % 60;

    // Pad single digit seconds with a leading zero
    var secsStr = secs < 10 ? "0" + secs : "" + secs;
    script.timerText.text = mins + ":" + secsStr;
}

// Call this from GameLogic.js to stop the timer when game ends
script.stopTimer = function() {
    isRunning = false;
};

// Call this to reset and restart
script.resetTimer = function() {
    timeLeft = 0;
    isRunning = true;
};