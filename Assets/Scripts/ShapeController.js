//@component
// @input SceneObject shapeObject
// @input string[] shapeVerticesPool {"hint":"Pool of shapes — one JSON vertex-array string per entry (e.g. your 50 shapes). Takes priority over shapeVertices above when init() is called with an index."}
// @input Asset.Texture[] shapeTexturePool {"hint":"Parallel array to shapeVerticesPool — the art texture applied to shapeObject's Image component for each shape."}
// @input int segmentCount = 60
// @input float strokeFraction = 0.0273 {"hint":"stroke width / canvas size used when generating the shape art, e.g. 28px stroke on a 1024px canvas = 28/1024"}
// @input float failToleranceMultiplier = 3.5 {"hint":"How many multiples of edgeTolerance the needle can drift before it counts as going off the shape entirely (used for the lives system)."}

function getShapeVertices() {
    var st = script.shapeObject.getComponent("Component.ScreenTransform");
    var raw;
    try {
        raw = JSON.parse(script.shapeVertices);
    } catch (e) {
        print("ERROR: shapeVertices is not valid JSON: " + e);
        return null;
    }
    if (!raw || raw.length < 3) {
        print("ERROR: shapeVertices needs at least 3 points");
        return null;
    }

    var vertices = [];
    for (var i = 0; i < raw.length; i++) {
        var lx = raw[i][0] * 2 - 1; // 0..1 -> -1..1
        var ly = raw[i][1] * 2 - 1;
        vertices.push(st.localPointToWorldPoint(new vec2(lx, ly)));
    }
    return vertices;
}

function selectShapeFromPool(index) {
    if (!script.shapeVerticesPool || index < 0 || index >= script.shapeVerticesPool.length) {
        print("ERROR: invalid shape pool index: " + index);
        return false;
    }

    script.shapeVertices = script.shapeVerticesPool[index];

    if (script.shapeTexturePool && script.shapeTexturePool[index]) {
        var imgComp = script.shapeObject.getComponent("Component.Image");
        if (imgComp) {
            imgComp.mainPass.baseTex = script.shapeTexturePool[index];
        } else {
            print("WARNING: shapeObject has no Component.Image — can't swap art texture. Vertex data still updated.");
        }
    }

    return true;
}

script.getPoolSize = function () {
    return script.shapeVerticesPool ? script.shapeVerticesPool.length : 0;
};

function buildPerimeterPoints() {
    var pts = [];
    var n = script.SHAPE_VERTICES.length;

    var edgeLengths = [];
    var totalLen = 0;
    for (var i = 0; i < n; i++) {
        var a = script.SHAPE_VERTICES[i];
        var b = script.SHAPE_VERTICES[(i + 1) % n];
        var len = Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
        edgeLengths.push(len);
        totalLen += len;
    }

    // Distribute segmentCount points across edges proportional to length,
    // giving every edge at least 1 point so short edges aren't skipped entirely
    var remaining = script.segmentCount;
    for (var i = 0; i < n; i++) {
        var isLastEdge = (i === n - 1);
        var count = isLastEdge
            ? remaining
            : Math.max(1, Math.round(script.segmentCount * edgeLengths[i] / totalLen));
        count = Math.min(count, remaining);
        remaining -= count;

        var a = script.SHAPE_VERTICES[i];
        var b = script.SHAPE_VERTICES[(i + 1) % n];
        for (var t = 0; t < count; t++) {
            var f = t / count;
            pts.push(new vec3(
                a.x + (b.x - a.x) * f,
                a.y + (b.y - a.y) * f,
                a.z + (b.z - a.z) * f
            ));
        }
    }

    return pts;
}


function getNearestSegment(pos) {
    var minDist = 999;
    var minIndex = -1;
    for (var i = 0; i < script.perimeterPoints.length; i++) {
        var p = script.perimeterPoints[i];
        var dist = Math.sqrt(Math.pow(pos.x - p.x, 2) + Math.pow(pos.y - p.y, 2));
        if (dist < minDist) {
            minDist = dist;
            minIndex = i;
        }
    }
    return { index: minIndex, dist: minDist };
}


function calculateEdgeTolerance() {
    var st = script.shapeObject.getComponent("Component.ScreenTransform");
    var bottomLeft = st.localPointToWorldPoint(new vec2(-1, -1));
    var topRight = st.localPointToWorldPoint(new vec2(1, 1));
    var worldWidth = Math.abs(topRight.x - bottomLeft.x);
    var worldHeight = Math.abs(topRight.y - bottomLeft.y);
    var worldSize = Math.min(worldWidth, worldHeight);

    // Half the stroke's world width — a needle anywhere within the visible
    // line counts as "on target," not just a needle exactly on the centerline.
    return (script.strokeFraction * worldSize) / 2;
}

script.init = function (shapeIndex) {
    if (shapeIndex !== undefined && shapeIndex !== null) {
        selectShapeFromPool(shapeIndex);
    }

    script.SHAPE_VERTICES = getShapeVertices();
    if (!script.SHAPE_VERTICES) return;

    script.perimeterPoints = buildPerimeterPoints();
    script.edgeTolerance = calculateEdgeTolerance();
    script.failTolerance = script.edgeTolerance * script.failToleranceMultiplier;

    print("Shape loaded with " + script.SHAPE_VERTICES.length + " vertices");
    print("Perimeter points built: " + script.perimeterPoints.length);
    print("Edge tolerance: " + script.edgeTolerance + " | Fail tolerance: " + script.failTolerance);
};


script.getNearestSegment = getNearestSegment;