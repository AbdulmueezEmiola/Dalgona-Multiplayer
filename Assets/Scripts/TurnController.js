//@component
// TurnController.js

// @input Component.ScriptComponent turnBased
//@input Component.ScriptComponent gameController
//@input Component.ScriptComponent shapeController
//@input Component.ScriptComponent matchEndScreen {"hint":"Script on your win/lose/draw popup object exposing show(outcome), where outcome is 'win' | 'lose' | 'draw'."}
//@input Component.Text player1ScoreText
//@input Component.Text player2ScoreText
//@input Component.Text player1LivesText
//@input Component.Text player2LivesText
//@input int roundCap = 10 {"hint":"Max rounds each player gets. If nobody's eliminated by the time both players reach this, the higher score wins (equal score = draw). NOTE: the Turn Based component also has its own built-in 'Use Turn Limit' — that counts TOTAL turns across both players (so roundCap*2), and could replace this for the no-elimination case, but doesn't know about elimination/fairness, so we track it ourselves here."}

var STARTING_LIVES = 3;
var HEART_CHAR = "❤️"; // swap for "♥" if emoji don't render on your font

var currentPlayer;
var otherPlayer;
var currentTurn;
var myPlayerIndex = null; // this DEVICE's own player slot — set from currentUserIndex the first time turnStarted runs on it

var score = [0, 0];
var lives = [STARTING_LIVES, STARTING_LIVES];
var roundsPlayed = [0, 0];
var eliminated = [false, false];
var oweExtraRound = [false, false];

var shapeBag = [];
var currentShapeIndex = -1;
var shapeAssignedTurn = -999;

var turnIsOver = false;
var matchIsOver = false;

// onTurnStart hands us currentUserIndex/turnCount directly — no need for
// separate getCurrentUserIndex()/getTurnCount() calls.
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
    currentTurn = e.turnCount;
    currentPlayer = e.currentUserIndex;
    myPlayerIndex = currentPlayer;

    getOtherPlayer()
        .then(loadPersistentState)
        .then(function () {
            if (matchIsOver) {
                print("turnStarted() fired after match over — skipping round setup");
                return;
            }

            var iAmDone = eliminated[currentPlayer] || roundsPlayed[currentPlayer] >= script.roundCap;
            var oweMeRound = oweExtraRound[currentPlayer];

            if (iAmDone && !oweMeRound) {
                print("turnStarted() fired for a player with no rounds remaining — skipping");
                return;
            }

            if (oweMeRound) {
                oweExtraRound[currentPlayer] = false;
                script.turnBased.setUserVariable(currentPlayer, "oweExtraRound", false);
            }

            ensureRoundShape();
            updateScoreDisplay();
            updateLivesDisplay();
            startRoundForThisTurn();
        });
}

async function getOtherPlayer() {
    otherPlayer = await script.turnBased.getOtherUserIndex();
}

// Global Variables for genuinely shared state; User Variables (per player
// index) for everything scoped to an individual player — matches Snap's
// recommended storage split.
async function loadPersistentState() {
    var p0 = await script.turnBased.getUserVariables(0);
    var p1 = await script.turnBased.getUserVariables(1);

    score = [p0.score || 0, p1.score || 0];
    // lives needs an explicit undefined-check, not `||` — a player at 0
    // lives is falsy and would otherwise incorrectly reset to full lives.
    lives = [
        p0.lives !== undefined ? p0.lives : STARTING_LIVES,
        p1.lives !== undefined ? p1.lives : STARTING_LIVES
    ];
    roundsPlayed = [p0.roundsPlayed || 0, p1.roundsPlayed || 0];
    eliminated = [!!p0.eliminated, !!p1.eliminated];
    oweExtraRound = [!!p0.oweExtraRound, !!p1.oweExtraRound];

    var storedMatchOver = await script.turnBased.getGlobalVariable("matchIsOver");
    matchIsOver = (storedMatchOver === undefined) ? false : storedMatchOver;

    var storedBag = await script.turnBased.getGlobalVariable("shapeBag");
    shapeBag = (storedBag === undefined) ? [] : storedBag;

    var storedShapeIndex = await script.turnBased.getGlobalVariable("currentShapeIndex");
    currentShapeIndex = (storedShapeIndex === undefined) ? -1 : storedShapeIndex;

    var storedAssignedTurn = await script.turnBased.getGlobalVariable("shapeAssignedTurn");
    shapeAssignedTurn = (storedAssignedTurn === undefined) ? -999 : storedAssignedTurn;
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
    var isNewRound = (currentShapeIndex < 0) || (currentTurn - shapeAssignedTurn >= 2);
    if (!isNewRound) return;

    if (shapeBag.length === 0) {
        shapeBag = shuffledIndices(script.shapeController.getPoolSize());
    }

    currentShapeIndex = shapeBag.pop();
    shapeAssignedTurn = currentTurn;

    script.turnBased.setGlobalVariable("shapeBag", shapeBag);
    script.turnBased.setGlobalVariable("currentShapeIndex", currentShapeIndex);
    script.turnBased.setGlobalVariable("shapeAssignedTurn", shapeAssignedTurn);
}

function startRoundForThisTurn() {
    script.gameController.startRound(currentShapeIndex);
}

function updateScoreDisplay() {
    if (script.player1ScoreText) script.player1ScoreText.text = "" + score[0];
    if (script.player2ScoreText) script.player2ScoreText.text = "" + score[1];
}

function heartsFor(count) {
    var hearts = "";
    for (var i = 0; i < count; i++) hearts += HEART_CHAR;
    return hearts;
}

function updateLivesDisplay() {
    if (script.player1LivesText) script.player1LivesText.text = heartsFor(lives[0]);
    if (script.player2LivesText) script.player2LivesText.text = heartsFor(lives[1]);
}

// Called by GameController when the current player successfully finishes
// tracing the whole shape.
function roundCompleted(success) {
    if (turnIsOver) return;
    turnIsOver = true;

    if (success) {
        score[currentPlayer] += 1;
        script.turnBased.setUserVariable(currentPlayer, "score", score[currentPlayer]);
    }

    updateScoreDisplay();
    updateLivesDisplay();

    completeCurrentPlayerTurn(); // fire-and-forget async — GameController doesn't need to wait on this
}

// Called by GameController each time the needle drifts off the shape long
// enough to count as a fail. Decrements a life but does NOT end the turn
// on its own — the player keeps tracing the same shape UNLESS this was
// their last life.
function loseLife() {
    if (turnIsOver) return { roundOver: true, livesRemaining: lives[currentPlayer] };

    lives[currentPlayer] -= 1;
    script.turnBased.setUserVariable(currentPlayer, "lives", lives[currentPlayer]);
    updateLivesDisplay();

    if (lives[currentPlayer] <= 0) {
        turnIsOver = true;
        eliminated[currentPlayer] = true;
        script.turnBased.setUserVariable(currentPlayer, "eliminated", true);

        completeCurrentPlayerTurn(); // fire-and-forget
        return { roundOver: true, livesRemaining: 0 };
    }

    return { roundOver: false, livesRemaining: lives[currentPlayer] };
}

// Shared "end of this player's turn" logic for both the success path and
// the elimination path — increments their round count, then either hands
// off to the other player (possibly granting them a one-time fairness
// round) or concludes the match.
async function completeCurrentPlayerTurn() {
    roundsPlayed[currentPlayer] += 1;
    await script.turnBased.setUserVariable(currentPlayer, "roundsPlayed", roundsPlayed[currentPlayer]);

    var iAmDone = eliminated[currentPlayer] || roundsPlayed[currentPlayer] >= script.roundCap;

    if (!iAmDone) {
        script.turnBased.setScore(score[currentPlayer]); // native Snapchat score shown on the captured Snap
        script.turnBased.endTurn();
        return;
    }

    var otherIsBehind = roundsPlayed[otherPlayer] < roundsPlayed[currentPlayer];

    if (otherIsBehind) {
        // Grant them exactly one equalizing round, even if they were
        // already eliminated or capped themselves.
        oweExtraRound[otherPlayer] = true;
        await script.turnBased.setUserVariable(otherPlayer, "oweExtraRound", true);
        script.turnBased.setScore(score[currentPlayer]);
        script.turnBased.endTurn();
    } else {
        await concludeMatch();
    }
}

function determineWinnerIndex() {
    var p0Eliminated = eliminated[0];
    var p1Eliminated = eliminated[1];

    if (p0Eliminated && !p1Eliminated) return 1;
    if (p1Eliminated && !p0Eliminated) return 0;

    // Both eliminated, or both survived to the round cap — score decides.
    if (score[0] > score[1]) return 0;
    if (score[1] > score[0]) return 1;
    return -1; // draw
}

function determineOutcome(viewerIndex, winnerIdx) {
    if (winnerIdx === -1 || winnerIdx === undefined || winnerIdx === null) return "draw";
    return winnerIdx === viewerIndex ? "win" : "lose";
}

function showMatchEndScreen(outcome) {
    if (script.matchEndScreen && script.matchEndScreen.show) {
        script.matchEndScreen.show(outcome);
    } else {
        print("Match ended: " + outcome + " (no matchEndScreen wired up)");
    }
}

// Following Snap's own Turn Loop Example pattern: persist the winner as a
// Global Variable, then mark this the final turn and end it. onGameOver
// fires locally once THIS device's endTurn() call completes as the final
// turn — the other player gets their own onGameOver the same way, once
// THEY finish their own final/equalizing turn.
async function concludeMatch() {
    matchIsOver = true;
    var winnerIdx = determineWinnerIndex();

    await script.turnBased.setGlobalVariable("matchIsOver", true);
    await script.turnBased.setGlobalVariable("winnerIdx", winnerIdx);

    showMatchEndScreen(determineOutcome(myPlayerIndex, winnerIdx));

    script.turnBased.setScore(score[currentPlayer]);
    script.turnBased.setIsFinalTurn(true);
    script.turnBased.endTurn();
}

// Fires after THIS device calls endTurn() on what turns out to be the
// final turn (requires "Require Turn Submission" enabled on the Turn
// Based component). No payload — read the winner back from the Global
// Variable we set in concludeMatch().
async function handleGameOver() {
    var winnerIdx = await script.turnBased.getGlobalVariable("winnerIdx");
    if (myPlayerIndex === null) return;
    showMatchEndScreen(determineOutcome(myPlayerIndex, winnerIdx));
}

// TESTING ONLY — manually resets all match state. Prefer Lens Studio's
// own "Clear Turn Based State" option (Preview → Additional Options) when
// using Debug Mode = Simulate Turns; this is a fallback for other cases.
async function resetMatchState() {
    score = [0, 0];
    lives = [STARTING_LIVES, STARTING_LIVES];
    roundsPlayed = [0, 0];
    eliminated = [false, false];
    oweExtraRound = [false, false];
    matchIsOver = false;
    shapeBag = [];
    currentShapeIndex = -1;
    shapeAssignedTurn = -999;

    for (var i = 0; i < 2; i++) {
        await script.turnBased.setUserVariable(i, "score", 0);
        await script.turnBased.setUserVariable(i, "lives", STARTING_LIVES);
        await script.turnBased.setUserVariable(i, "roundsPlayed", 0);
        await script.turnBased.setUserVariable(i, "eliminated", false);
        await script.turnBased.setUserVariable(i, "oweExtraRound", false);
    }
    await script.turnBased.setGlobalVariable("matchIsOver", false);
    await script.turnBased.setGlobalVariable("shapeBag", []);
    await script.turnBased.setGlobalVariable("currentShapeIndex", -1);
    await script.turnBased.setGlobalVariable("shapeAssignedTurn", -999);

    updateScoreDisplay();
    updateLivesDisplay();
    print("Match state reset: score [0,0], lives [3,3], rounds [0,0]");
}

script.roundCompleted = roundCompleted;
script.loseLife = loseLife;
script.resetMatchState = resetMatchState;