//@component
// MatchEndScreen.js
//@input SceneObject winArt
//@input SceneObject loseArt
//@input SceneObject drawArt

script.show = function (outcome) {
  script.winArt.enabled = outcome === "win";
  script.loseArt.enabled = outcome === "lose";
  script.drawArt.enabled = outcome === "draw";
};
