//@component
// TimerController.js
// Live "Trace the Shape · 0:0X" stopwatch shown in the Stage header while
// the current player is actively tracing. Counts up from 0 starting at
// resetTimer(), frozen at stopTimer() — called by TurnController.js at the
// start and end of each turn, so this script stays independent of the
// Turn Based flow itself.

//@input Component.Text timerText {"hint":"The Stage header Text — this script owns its full text (label + time) while a turn is active."}

var timeLeft = 0;
var isRunning = false;

var updateEvent = script.createEvent("UpdateEvent");
updateEvent.bind(function () {
    if (!isRunning) return;

    // getDeltaTime() = how many seconds passed since last frame
    timeLeft += getDeltaTime();

    updateDisplay();
});

function updateDisplay() {
    // Whole seconds, formatted as "0:04", "1:30" etc — fractional seconds
    // would just look jittery ticking every frame. (The exact time, to one
    // decimal place, is what actually gets shown once the turn finishes.)
    var seconds = Math.floor(timeLeft);
    var mins = Math.floor(seconds / 60);
    var secs = seconds % 60;
    var secsStr = secs < 10 ? "0" + secs : "" + secs;

    if (script.timerText) {
        script.timerText.text = "Trace the Shape · " + mins + ":" + secsStr;
    }
}

// Called by TurnController.js once the player's shape attempt ends
// (success or failure) — stops ticking, leaving the last value on screen.
script.stopTimer = function () {
    isRunning = false;
};

// Called by TurnController.js right as a turn starts.
script.resetTimer = function () {
    timeLeft = 0;
    isRunning = true;
    updateDisplay();
};
