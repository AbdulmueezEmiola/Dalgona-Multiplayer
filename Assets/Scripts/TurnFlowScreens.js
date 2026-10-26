//@component
// TurnFlowScreens.js
// All of this turn-based mode's own screens in one place: the "turn
// complete, sent to your friend" interstitial shown right before endTurn(),
// and the final win/lose/draw screen shown on onGameOver. Driven entirely
// by TurnController.js — nothing in here talks to the Turn Based component
// directly, so it stays reusable if the match-flow logic changes later.

//@input SceneObject turnCompleteRoot {"hint":"Shown right after you finish (or run out of lives on) your shape, just before the Snap is captured and sent."}
//@input Component.Text turnCompleteHeaderText {"hint":"Optional — e.g. 'Shape traced!' / 'Out of lives!' depending on payload.success."}
//@input Component.Text turnCompleteScoreText {"hint":"Optional — 'Your score: X' summary. On a successful trace, also appends the time it took and, once the other player has also traced this round's shape, whether you were faster."}
//@input SceneObject turnCompleteSuccessArt {"hint":"Optional — shown instead of turnCompleteFailArt when payload.success is true."}
//@input SceneObject turnCompleteFailArt {"hint":"Optional — shown instead of turnCompleteSuccessArt when payload.success is false."}
//@input SceneObject winArt
//@input SceneObject loseArt
//@input SceneObject drawArt
//@input Component.Text winHeaderText {"hint":"Optional — e.g. '<Winner> Wins!'. This screen is what gets captured and sent as the Snap, so the text should read correctly for whoever views it, not just the player whose device is showing it."}
//@input Component.Text loseHeaderText {"hint":"Optional — same '<Winner> Wins!' text as winHeaderText (the winner's name doesn't change based on which device is showing it)."}
//@input Component.Text drawHeaderText {"hint":"Optional — e.g. \"It's a Tie!\"."}
//@input Component.Text matchOverTimeText {"hint":"Optional — e.g. 'Abdul 12.4s  ·  Sam 18.1s', each player's cumulative time across all their successful traces this match."}

script.showTurnComplete = function (payload) {
  if (script.turnCompleteHeaderText) {
    script.turnCompleteHeaderText.text = payload.success
      ? "Shape traced!"
      : "Out of lives!";
  }
  if (script.turnCompleteScoreText) {
    var line = "Your score: " + payload.myScore;
    if (payload.mySeconds != null) {
      line += "  ·  " + payload.mySeconds.toFixed(1) + "s";
      if (payload.otherSeconds != null) {
        line += payload.mySeconds < payload.otherSeconds ? " (faster!)" : " (slower)";
      }
    }
    script.turnCompleteScoreText.text = line;
  }
  if (script.turnCompleteSuccessArt)
    script.turnCompleteSuccessArt.enabled = payload.success;
  if (script.turnCompleteFailArt)
    script.turnCompleteFailArt.enabled = !payload.success;
  if (script.turnCompleteRoot) script.turnCompleteRoot.enabled = true;
};

script.hideTurnComplete = function () {
  if (script.turnCompleteRoot) script.turnCompleteRoot.enabled = false;
};

// outcome is "win" | "lose" | "draw", matching MatchEndScreen.js's contract.
// payload.myName/otherName are this device's player and the other player's
// display names — the headline and score state the actual result by name,
// not "You"/"Them", since this screen is captured and sent as the Snap and
// needs to read correctly for whoever ends up viewing it.
script.showMatchOver = function (outcome, payload) {
  if (script.winArt) script.winArt.enabled = outcome === "win";
  if (script.loseArt) script.loseArt.enabled = outcome === "lose";
  if (script.drawArt) script.drawArt.enabled = outcome === "draw";

  if (payload) {
    var winnerName =
      payload.myScore > payload.otherScore ? payload.myName : payload.otherName;
    if (script.winHeaderText) script.winHeaderText.text = winnerName + " Wins!";
    if (script.loseHeaderText)
      script.loseHeaderText.text = winnerName + " Wins!";
    if (script.drawHeaderText) script.drawHeaderText.text = "It's a Tie!";

    if (script.matchOverTimeText) {
      // Two lines, not one "Name Xs  ·  Name Ys" line — real display names
      // can be long enough to overflow a single centered line.
      script.matchOverTimeText.text =
        payload.myName + ": " + payload.myTotalTime.toFixed(1) + "s\n" +
        payload.otherName + ": " + payload.otherTotalTime.toFixed(1) + "s";
    }
  }
};
