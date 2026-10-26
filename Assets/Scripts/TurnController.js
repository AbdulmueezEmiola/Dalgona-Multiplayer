//@component
// TurnController.js
//
// Turn-based counterpart to SinglePlayerController.js — same drop-in
// interface GameController.js expects (loseLife()/roundCompleted(success)),
// wired into GameController's `turnController` input slot instead.
//
// DESIGN — one turn = one shape attempt:
//   - Each turn gets a fresh set of `startingLives`. Running out of lives
//     ends the TURN (no score for that shape) — it does NOT eliminate the
//     player or skip-and-retry within the same turn. That's a deliberate
//     difference from both SinglePlayerController.js's soft-fail loop and
//     this project's old elimination-based TurnController.
//   - Score is cumulative shapes successfully traced by THIS player across
//     all of their turns, persisted via the Turn Based component's
//     per-user variable storage (setCurrentUserVariable/getCurrentUserVariable)
//     so it survives between turns and devices.
//   - Match length is controlled entirely by the Turn Based component's own
//     "Use Turn Limit" / "Turn Limit" Inspector fields on `script.turnBased`
//     — NOT reinvented here. It fires onGameOver (instead of onTurnEnd) on
//     each player's final turn, and auto-toggles whatever SceneObjects are
//     wired into its own "Game Over Scene Objects" input.
//   - Both players trace the SAME shape within a round (2 consecutive
//     turns), so cumulative scores are directly comparable — a "Trace-Off"
//     against a shared shape sequence, not two independent runs. Set
//     "Turn Limit" to an EVEN number so both players get equal turns.

//@input Component.ScriptComponent turnBased {"hint":"The Turn Based custom component (TurnBased.lsc). Configure on IT directly, in its own Inspector: Require Turn Submission = true, Use Turn Limit = true with an EVEN Turn Limit, and Game Over Scene Objects."}
//@input Component.ScriptComponent gameController
//@input Component.ScriptComponent shapeController
//@input Component.ScriptComponent turnFlowScreens {"hint":"Script exposing showTurnComplete(payload), hideTurnComplete(), and showMatchOver(outcome, payload). See TurnFlowScreens.js."}
//@input Component.Text myScoreText {"hint":"Optional — this device's cumulative score."}
//@input Component.Text myLivesText {"hint":"Optional — hearts for the lives remaining on the CURRENT shape attempt."}
//@input Component.Text opponentScoreText {"hint":"Optional — the other player's last-known cumulative score, for competitive context."}
//@input Component.Text roundText {"hint":"Optional — shows 'Round N' (or 'Round N / M' if the Turn Based component's own Turn Limit is set). A round is 2 turns — one per player on the same shape."}
//@input int startingLives = 3 {"hint":"Fresh lives granted at the start of EVERY turn — lives do NOT persist between turns, only the score does."}
//@input Component.ScriptComponent timerController {"hint":"Optional — TimerController.js driving the live 'Trace the Shape · 0:0X' stopwatch. Started at turn start, stopped once the turn ends."}

var HEART_CHAR = "❤️"; // keep in sync with SinglePlayerController.js if you reuse both

var myPlayerIndex = null;
var currentTurnCount = -1;

var myScore = 0;
var otherScore = 0;
var myTotalTime = 0; // cumulative seconds across all of THIS player's successful traces
var otherTotalTime = 0;
var lives = 0;

var shapeBag = [];
var currentShapeIndex = -1;
var shapeAssignedTurn = -999;

var turnStartTime = 0;
var otherPlayerRoundTime = null; // this round's time from whoever traced it first, if they succeeded

var turnIsOver = false;

// onTurnStart hands us currentUserIndex/turnCount directly — no need for a
// separate getCurrentUserIndex()/getTurnCount() call.
script.turnBased.onTurnStart.add(function (e) {
    turnStarted(e);
});

script.turnBased.onGameOver.add(handleGameOver);

if (script.turnBased.onError) {
    script.turnBased.onError.add(function (err) {
        print("TurnBased onError: " + (err && err.description ? err.description : JSON.stringify(err)));
    });
}

function turnStarted(e) {
    turnIsOver = false;
    currentTurnCount = e.turnCount;
    myPlayerIndex = e.currentUserIndex;
    lives = script.startingLives;
    updateRoundDisplay();

    if (script.turnFlowScreens && script.turnFlowScreens.hideTurnComplete) {
        script.turnFlowScreens.hideTurnComplete();
    }

    loadPersistentState().then(function () {
        ensureRoundShape();
        updateScoreDisplay();
        updateLivesDisplay();
        turnStartTime = getTime();
        if (script.timerController && script.timerController.resetTimer) {
            script.timerController.resetTimer();
        }
        script.gameController.startRound(currentShapeIndex);
    });
}

// A round is 2 turns (one per player tracing the same shape) — shared with
// updateRoundDisplay()'s own round-number math so the two never drift apart.
function currentRoundNumber() {
    return Math.floor(currentTurnCount / 2) + 1;
}

// Global Variables for genuinely shared state (the round's shape, and
// whoever traces it first's time); Current/Other User Variables for
// everything scoped to an individual player — matches Snap's recommended
// storage split.
async function loadPersistentState() {
    myScore = (await script.turnBased.getCurrentUserVariable("score")) || 0;
    otherScore = (await script.turnBased.getOtherUserVariable("score")) || 0;
    myTotalTime = (await script.turnBased.getCurrentUserVariable("totalTime")) || 0;
    otherTotalTime = (await script.turnBased.getOtherUserVariable("totalTime")) || 0;

    var storedBag = await script.turnBased.getGlobalVariable("shapeBag");
    shapeBag = (storedBag === undefined) ? [] : storedBag;

    var storedShapeIndex = await script.turnBased.getGlobalVariable("currentShapeIndex");
    currentShapeIndex = (storedShapeIndex === undefined) ? -1 : storedShapeIndex;

    var storedAssignedTurn = await script.turnBased.getGlobalVariable("shapeAssignedTurn");
    shapeAssignedTurn = (storedAssignedTurn === undefined) ? -999 : storedAssignedTurn;

    // Whoever traces THIS round's shape first (if they succeed) leaves their
    // time here under a key scoped to this round, so whoever goes second
    // picks it up for free — no separate round-trip, and no stale-value
    // cleanup needed since every round owns its own key.
    var storedRoundTime = await script.turnBased.getGlobalVariable("roundTime_" + currentRoundNumber());
    otherPlayerRoundTime = (storedRoundTime === undefined) ? null : storedRoundTime;
}

// Fisher-Yates shuffle of 0..count-1
function shuffledIndices(count) {
    var arr = [];
    for (var i = 0; i < count; i++) arr.push(i);
    for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

// A "round" spans exactly 2 turns — one per player — tracing the SAME
// shape, so scores are comparable. If more than 1 turn has passed since
// the current shape was assigned, it's time to draw a new one and persist
// it so the other player's device picks up the same shape on their turn.
function ensureRoundShape() {
    var isNewRound = (currentShapeIndex < 0) || (currentTurnCount - shapeAssignedTurn >= 2);
    if (!isNewRound) return;

    if (shapeBag.length === 0) {
        shapeBag = shuffledIndices(script.shapeController.getPoolSize());
    }

    currentShapeIndex = shapeBag.pop();
    shapeAssignedTurn = currentTurnCount;

    script.turnBased.setGlobalVariable("shapeBag", shapeBag);
    script.turnBased.setGlobalVariable("currentShapeIndex", currentShapeIndex);
    script.turnBased.setGlobalVariable("shapeAssignedTurn", shapeAssignedTurn);
}

function updateScoreDisplay() {
    if (script.myScoreText) script.myScoreText.text = "" + myScore;
    if (script.opponentScoreText) script.opponentScoreText.text = "" + otherScore;
}

function heartsFor(count) {
    var hearts = "";
    for (var i = 0; i < count; i++) hearts += HEART_CHAR;
    return hearts;
}

function updateLivesDisplay() {
    if (script.myLivesText) script.myLivesText.text = heartsFor(lives);
}

// A "round" is 2 turns (one per player tracing the same shape), so round
// number is just turnCount halved. Shows a total too if the Turn Based
// component's own Turn Limit is set (it's read directly off the component,
// not persisted state, so it's available immediately — no need to wait on
// loadPersistentState()).
function updateRoundDisplay() {
    if (!script.roundText) return;

    var roundNumber = currentRoundNumber();
    var turnLimit = script.turnBased.turnLimit;

    script.roundText.text = turnLimit > 0
        ? "Round " + roundNumber + " / " + Math.ceil(turnLimit / 2)
        : "Round " + roundNumber;
}

// Called by GameController the instant the current player finishes tracing
// the whole shape.
function roundCompleted(success) {
    if (turnIsOver) return;
    turnIsOver = true;

    if (success) {
        myScore += 1;
        updateScoreDisplay();
    }

    finishTurn(success);
}

// Called by GameController each time the needle drifts off the shape long
// enough to count as a fail. The player keeps tracing the SAME shape on
// THIS turn until lives run out — running out just ends the turn with no
// score for this shape (no elimination, no skip-and-retry: that's
// SinglePlayerController.js's soft-fail behavior, not this mode's).
function loseLife() {
    if (turnIsOver) return { roundOver: true, livesRemaining: lives };

    lives -= 1;
    updateLivesDisplay();

    if (lives <= 0) {
        turnIsOver = true;
        finishTurn(false);
        return { roundOver: true, livesRemaining: 0 };
    }

    return { roundOver: false, livesRemaining: lives };
}

// Shared "my turn is done" path for both the success and out-of-lives
// cases — persists the updated score, surfaces the "sent to your friend"
// screen, then hands off via endTurn(). Fire-and-forget async:
// GameController doesn't wait on this.
async function finishTurn(success) {
    if (script.timerController && script.timerController.stopTimer) {
        script.timerController.stopTimer();
    }

    await script.turnBased.setCurrentUserVariable("score", myScore);
    script.turnBased.setScore(myScore); // native Snapchat score shown on the captured Snap

    // Only a successful trace produces a comparable time — a failed attempt
    // didn't finish, so there's nothing meaningful to time or persist.
    var mySeconds = null;
    if (success) {
        mySeconds = getTime() - turnStartTime;
        script.turnBased.setGlobalVariable("roundTime_" + currentRoundNumber(), mySeconds);

        myTotalTime += mySeconds;
        await script.turnBased.setCurrentUserVariable("totalTime", myTotalTime);
    }

    if (script.turnFlowScreens && script.turnFlowScreens.showTurnComplete) {
        script.turnFlowScreens.showTurnComplete({
            success: success,
            myScore: myScore,
            otherScore: otherScore,
            mySeconds: mySeconds,
            otherSeconds: otherPlayerRoundTime
        });
    }

    script.turnBased.endTurn();
}

// Fires once THIS device's endTurn() call completes as the final turn
// (requires "Require Turn Submission" enabled on the Turn Based
// component). No payload — myScore/otherScore already hold this player's
// final tally and the last-synced value for the other player, same as
// they were going into this last turn.
//
// This screen is what gets captured and sent as the Snap, so it's built
// around both players' names rather than "You"/"Them" — "You Lost the
// Match" only makes sense to whoever's device shows it, not to whoever
// later opens the Snap.
async function handleGameOver() {
    var outcome = myScore === otherScore ? "draw" : (myScore > otherScore ? "win" : "lose");
    var myName = await script.turnBased.getCurrentUserDisplayName();
    var otherName = await script.turnBased.getOtherUserDisplayName();

    if (script.turnFlowScreens && script.turnFlowScreens.showMatchOver) {
        // finishTurn() already showed the turn-complete interstitial for
        // this (final) turn — replace it with the match result instead of
        // layering the match-over screen on top of it.
        if (script.turnFlowScreens.hideTurnComplete) {
            script.turnFlowScreens.hideTurnComplete();
        }
        script.turnFlowScreens.showMatchOver(outcome, {
            myScore: myScore,
            otherScore: otherScore,
            myName: myName,
            otherName: otherName,
            myTotalTime: myTotalTime,
            otherTotalTime: otherTotalTime
        });
    } else {
        print("Match over: " + outcome + " (" + myName + ": " + myScore + ", " + otherName + ": " + otherScore + ")");
    }
}

script.roundCompleted = roundCompleted;
script.loseLife = loseLife;
