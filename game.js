
      "use strict";

      /* ================= constants ================= */
      var W = 960, H = 600;
      var FLOOR_Y = 516;
      // Truss/fixtures sit lower than a bare truss would so the
      // color selector pills get their own clear row above the
      // truss bar, inside the scene and below the top row.
      var TRUSS_Y = 76;
      var APEX_Y = 120;             // beam origin (lens) y
      // Mobile scheme: the selector row is gone, and its band is
      // removed by REDRAWING THE SCENE SHORTER — not by sliding
      // the truss up inside the same 600-tall space (that would
      // lengthen the light-to-floor distance and change beam
      // coverage, hence solvability). The band is BAND_H units
      // tall; in Mobile the whole coordinate space is BAND_H
      // shorter and everything at or below the band — truss,
      // apex, performers, floor — sits BAND_H higher, so every
      // gameplay distance is numerically identical in both
      // schemes: apex->floor is 396 either way (516-120 desktop,
      // 470-74 mobile), and an identical rig scores identical
      // percentages in both. applySchemeChrome swaps these
      // in/out (and resizes the canvases); switching back to
      // Computer restores the desktop values exactly.
      var BAND_H = 46;
      var H_DESKTOP = 600, FLOOR_Y_DESKTOP = 516;
      var TRUSS_Y_DESKTOP = 76, APEX_Y_DESKTOP = 120;
      var H_MOBILE = H_DESKTOP - BAND_H;              // 554
      var FLOOR_Y_MOBILE = FLOOR_Y_DESKTOP - BAND_H;  // 470
      var TRUSS_Y_MOBILE = TRUSS_Y_DESKTOP - BAND_H;  // 30
      var APEX_Y_MOBILE = APEX_Y_DESKTOP - BAND_H;    // 74
      // Longer than the stage diagonal (sqrt(960^2 + 600^2) ~= 1133), the
      // farthest any lens can be from a point of the scene — so at any
      // tilt (+/-68 deg) and any barn-door setting, every cone runs past
      // the scene and is clipped by its edge instead of ending mid-scene.
      // beamQuad and pointInBeam (scoring) both derive from this length.
      var BEAM_LEN = 1250;
      var MAX_TILT = 68;            // degrees either way — fixtures can swing wide
      // Beam half-angle with the doors fully open. This is also the barn
      // doors' open flare angle (see flapAngle): beam and doors share one
      // max angle, so a fully open beam's edges flare at the same angle
      // as the doors. Once a door starts closing, the edge stops
      // following the door angle and is set by occlusion instead — see
      // doorHalfAngle.
      var BASE_HALF = 32 * Math.PI / 180;
      var CHAR_W = 150, CHAR_H = 196;
      // Performers are no longer placed by a shared top edge:
      // each is grounded individually on FLOOR_Y — see the
      // grounding helpers where the silhouettes are built.

      var CH_RGB = {
        R: [255, 53, 36],
        G: [37, 224, 79],
        B: [61, 123, 255]
      };
      var CH_BIT = { R: 1, G: 2, B: 4 };
      var COMBO = {
        0: { name: "Shadow",  css: "#151515" },
        1: { name: "Red",     css: "#ff3524" },
        2: { name: "Green",   css: "#25e04f" },
        4: { name: "Blue",    css: "#3d7bff" },
        3: { name: "Yellow",  css: "#ffd21f" },
        5: { name: "Magenta", css: "#ff35d1" },
        6: { name: "Cyan",    css: "#22d8e6" },
        7: { name: "White",   css: "#f4f4f4" }
      };
      // Easy deals one target per performer, drawn from primaries,
      // secondaries, and white. Medium and Hard use the same pool
      // but deal several targets per performer — exactly two on
      // Medium, exactly three on Hard.
      // Target pool: every lit mix plus 0 — Shadow, the share of a
      // silhouette no beam touches at all. Unlit pixels are a real,
      // scoreable class (score() counts them as mix 0), so Shadow
      // can be a goal like any color: keep light OFF that share of
      // the performer.
      var COLOR_POOL = [0, 1, 2, 4, 3, 5, 6, 7];
      // The truss has seven fixed hang points laid out as ONE
      // equal-interval series across the stage: a constant 140px
      // step between adjacent points, symmetric about the stage
      // center (the center point sits exactly at W/2 = 480). The
      // step comfortably exceeds the selector pill's width
      // (~114px: power button + three color dots), so no two
      // pills ever touch at desktop width, and the series uses
      // most of the truss (60..900 of the 960-wide stage) without
      // any pill or fixture spilling past the stage edge. The
      // default-on slots (1, 3, 5) land on or within 7px of the
      // three performers' verticals (193 / 480 / 767). Every
      // hang point always carries a fixture; a light's x always
      // comes from its slot, and whether it shines is decided
      // by its power state, not by presence.
      var SLOTS = [60, 200, 340, 480, 620, 760, 900];
      var SLOT_POS = ["Far left", "Left", "Left center", "Center", "Right center", "Right", "Far right"];

      /* ================= silhouette building =================
         Each build fn returns a Path2D of filled shapes in local
         coords (CHAR_W x CHAR_H box), reused for the black base,
         the sample mask, and clipping the light tint.          */
      function pPoly(pts) {
        var p = new Path2D();
        p.moveTo(pts[0], pts[1]);
        for (var i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
        p.closePath();
        return p;
      }
      function pCirc(x, y, r) {
        var p = new Path2D();
        p.arc(x, y, r, 0, 6.2832);
        return p;
      }
      function pEll(x, y, rx, ry, rot) {
        var p = new Path2D();
        p.ellipse(x, y, rx, ry, rot || 0, 0, 6.2832);
        return p;
      }
      function pLine(x1, y1, x2, y2, w) {
        var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
        var nx = -dy / len * w / 2, ny = dx / len * w / 2;
        return pPoly([x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny]);
      }
      function combine(parts) {
        var p = new Path2D();
        parts.forEach(function (q) { p.addPath(q); });
        return p;
      }

      // The style board draws limbs and stands as round-capped
      // strokes; the game fills paths, so a stroke is rebuilt
      // from filled pieces: a pLine bar plus a circle at each
      // end (and, for curves, at each sampled point along the
      // cubic). The PROPOSED builders below return a LIST of
      // such pieces and the review strip fills them one by
      // one — filled separately, the pieces always union
      // solidly. (Filled as one combined path they would not:
      // pieces whose path data winds the opposite way cancel
      // each other where they overlap, punching holes at the
      // joints — that is why the parts stay separate here.)
      function segParts(x1, y1, x2, y2, w) {
        return [pLine(x1, y1, x2, y2, w), pCirc(x1, y1, w / 2), pCirc(x2, y2, w / 2)];
      }
      function cubicParts(x0, y0, x1, y1, x2, y2, x3, y3, w) {
        var parts = [pCirc(x0, y0, w / 2)], N = 14, px = x0, py = y0;
        for (var i = 1; i <= N; i++) {
          var t = i / N, u = 1 - t;
          var x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
          var y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
          parts.push(pLine(px, py, x, y, w));
          parts.push(pCirc(x, y, w / 2));
          px = x; py = y;
        }
        return parts;
      }
      function flatParts(list) {
        var out = [];
        list.forEach(function (q) {
          if (Array.isArray(q)) out = out.concat(q); else out.push(q);
        });
        return out;
      }
      // Fill a performer shape whether it is a single Path2D
      // (guitarist / drummer) or a list of pieces (the singer,
      // whose board-ported parts must be filled one by one so
      // they union solidly — see segParts above). Every place
      // that paints, masks, or clips a silhouette goes through
      // this so all three performers work the same way.
      function fillPathParts(c, partsOrPath) {
        if (Array.isArray(partsOrPath)) {
          partsOrPath.forEach(function (p) { c.fill(p); });
        } else if (partsOrPath) {
          c.fill(partsOrPath);
        }
      }

      function buildSinger() {
        // Kept close to the version that already worked: leaning
        // into a mic on a stand, one arm up to the mic, one down.
        return combine([
          // mic stand + mic
          pLine(112, 66, 122, 188, 5),
          pPoly([104, 190, 138, 190, 122, 180]),
          pEll(108, 58, 9, 12, -0.5),
          // legs + shoes
          pPoly([56, 118, 71, 118, 68, 192, 52, 192]),
          pPoly([71, 118, 86, 118, 94, 192, 78, 192]),
          pPoly([46, 194, 70, 194, 70, 188, 46, 188]),
          pPoly([76, 194, 100, 194, 100, 188, 76, 188]),
          // torso
          pPoly([52, 52, 88, 52, 90, 122, 54, 122]),
          // arm up to the mic, arm down
          pLine(84, 60, 104, 62, 11),
          pLine(54, 60, 38, 104, 11),
          pCirc(37, 108, 6),
          // head + hair sweep
          pCirc(70, 32, 15),
          pEll(62, 20, 13, 8, -0.4)
        ]);
      }

      function buildSingerProposed() {
        // LIVE singer (approved 2026-10-06 — “singer is good,
        // use as is and add to scene”): the Detailed Stage
        // singer from the style options board, ported
        // shape-for-shape. The filled paths below are the
        // board figure's own path data, and its strokes
        // (legs, arms, mic stand, cable) are rebuilt at the
        // board's own weights — nothing redrawn or re-proportioned.
        // Long hair falls past her shoulders in the same shape
        // as her head, the slim torso leaves daylight between
        // the down arm and the body, and the mic sits on a
        // tripod stand with its cable curling to the floor.
        // This is now the singer used in gameplay, scoring,
        // and the solver (via chars[0] below).
        return flatParts([
          // boots / lower legs
          new Path2D("M96 178 L104 178 L99 152 L93 152 Z"),
          new Path2D("M50 178 L58 178 L57 152 L49 152 Z"),
          // legs
          segParts(66, 118, 56, 156, 7),
          segParts(84, 118, 96, 156, 7),
          // torso
          new Path2D("M60 50 C58 44 90 44 91 51 L89 84 L99 116 C100 122 94 126 87 124 L64 124 C57 126 51 122 53 115 L62 84 Z"),
          // arm up to the mic, arm down at her side
          cubicParts(89, 56, 97, 58, 103, 58, 108, 55, 7.5),
          cubicParts(61, 57, 53, 66, 48, 76, 46, 86, 7.5),
          pCirc(45, 90, 4),
          // head + long hair, one shape
          new Path2D("M75 8 C88 8 95 19 93 33 L95 74 C95 79 90 81 87 77 L85 48 C81 52 69 52 65 48 L63 78 C60 81 55 78 56 71 L58 34 C57 19 63 8 75 8 Z"),
          // mic stand: pole, tripod feet, cable curling down
          segParts(112, 62, 121, 176, 2.5),
          segParts(121, 176, 106, 186, 2.5),
          segParts(121, 176, 136, 186, 2.5),
          cubicParts(108, 55, 100, 90, 102, 130, 110, 168, 2.5),
          // the mic itself, angled at her mouth
          pEll(109, 52, 6, 9, -0.5236)
        ]);
      }

      function buildGuitarist() {
        // PREVIOUS in-game guitarist — replaced in the live
        // scene by G1 (buildGuitaristProposed below) once G1
        // was approved. Kept only as the old shape's record;
        // not used in gameplay, scoring, or the solver.
        return combine([
          // legs (wide stance) + shoes
          pPoly([48, 116, 64, 116, 52, 192, 36, 192]),
          pPoly([64, 116, 82, 116, 100, 192, 84, 192]),
          pPoly([28, 194, 54, 194, 54, 188, 28, 188]),
          pPoly([82, 194, 108, 194, 108, 188, 82, 188]),
          // torso leaning in
          pPoly([46, 50, 84, 46, 88, 120, 50, 122]),
          // head
          pCirc(62, 28, 14),
          pEll(56, 17, 12, 7, -0.3),
          // guitar body + neck + headstock
          pEll(84, 102, 30, 24, -0.5),
          pEll(68, 114, 17, 14, -0.5),
          pLine(100, 84, 140, 46, 9),
          pPoly([136, 38, 148, 44, 142, 54, 132, 48]),
          // arms: strumming + fretting
          pLine(82, 58, 96, 92, 11),
          pLine(50, 56, 92, 78, 11),
          pLine(92, 78, 128, 54, 9)
        ]);
      }

      function buildGuitaristProposed() {
        // LIVE guitarist (approved 2026-10-06 — “g1 is good”):
        // guitarist G1 from the style options board, ported
        // shape-for-shape — the board figure's own geometry,
        // nothing redrawn. G1's guitar lives in ONE rotated
        // frame: on the board it is drawn in a group translated
        // to the sound-hole centre (86, 110) and rotated -38°,
        // with the body shaped symmetrically around that
        // frame's axis, the neck a stroke lying exactly on the
        // axis, and the headstock paddle centred on it. That
        // same translate + rotate is applied here (via
        // DOMMatrix) to the board's own path data, so body,
        // neck and headstock share the single axis by
        // construction — no kink or offset at the joint. The
        // sound hole is a true hole in the body: the board
        // fills it with evenodd while canvas fills nonzero, so
        // the hole subpath is included with its arc sweep flags
        // flipped — the same circle wound opposite the body
        // outline — which keeps the hole open under nonzero
        // fill. Everything outside the guitar group uses the
        // board's coordinates directly: its strokes become
        // filled pieces at the board's own weights (see
        // segParts / cubicParts) and its fills are the board's
        // path data verbatim. This is now the guitarist used
        // in gameplay, scoring, and the solver (via chars[1]).
        var mtx = new DOMMatrix().translate(86, 110).rotate(-38);
        function xform(p) {
          var q = new Path2D();
          q.addPath(p, mtx);
          return q;
        }
        var guitarBody = new Path2D(
          "M24 -6 C20 -13 16 -15 10 -15 C4 -15 0 -12 -4 -11.5 C-10 -11 -14 -19 -20 -19.5 C-27 -20 -30 -10 -30 0 C-30 10 -27 20 -20 19.5 C-14 19 -10 11 -4 11.5 C0 12 4 15 10 15 C16 15 20 13 24 6 Z" +
          " M2 -6.5 a6.5 6.5 0 1 1 0 13 a6.5 6.5 0 1 1 0 -13 Z"
        );
        return flatParts([
          // legs (classic stance) + shoes
          segParts(64, 124, 54, 170, 8),
          segParts(86, 124, 100, 170, 8),
          new Path2D("M46 174 L62 174 L60 166 L48 166 Z"),
          new Path2D("M94 174 L110 174 L108 166 L96 166 Z"),
          // torso
          new Path2D("M54 50 C54 43 86 41 88 49 L90 108 C91 116 85 121 78 119 L60 121 C53 121 50 115 51 107 Z"),
          // the guitar, in its single rotated frame: the body
          // (sound hole cut through it), the neck stroke lying
          // on the axis, the headstock paddle centred on it
          xform(guitarBody),
          segParts(16, 0, 58, 0, 7).map(xform),
          xform(pPoly([58, -4.5, 71, -3.2, 71, 3.2, 58, 4.5])),
          // arms: fretting hand out to grip the neck on the
          // axis, strumming hand over the sound hole
          cubicParts(85, 55, 100, 62, 114, 71, 124, 80, 8),
          cubicParts(57, 54, 66, 78, 78, 95, 92, 104, 8),
          // head + hair cap — no hat, nothing floating by it
          pCirc(66, 27, 12),
          new Path2D("M52 28 C51 14 60 6 68 7 C77 8 82 15 81 25 C78 18 72 14 66 15 C59 16 54 20 52 28 Z")
        ]);
      }

      function buildDrummer() {
        // PREVIOUS in-game drummer — replaced in the live
        // scene by revised R2 (buildDrummerProposed below)
        // once R2 was approved. Kept only as the old shape's
        // record; not used in gameplay, scoring, or the solver.
        return combine([
          // cymbals + stands
          pEll(24, 62, 24, 6, -0.12),
          pLine(24, 64, 20, 150, 4),
          pEll(128, 56, 26, 6, 0.1),
          pLine(128, 58, 132, 150, 4),
          // drummer body behind the kit
          pPoly([58, 52, 92, 52, 94, 116, 56, 116]),
          pCirc(75, 32, 14),
          // arms with sticks
          pLine(60, 60, 34, 84, 10),
          pLine(34, 84, 24, 66, 4),
          pLine(90, 60, 116, 78, 10),
          pLine(116, 78, 126, 60, 4),
          // toms
          pCirc(50, 100, 15),
          pCirc(100, 98, 16),
          // snare
          pEll(26, 122, 15, 10, 0),
          pLine(26, 130, 22, 158, 4),
          // bass drum
          pCirc(75, 140, 34),
          // legs to pedals
          pLine(60, 116, 44, 168, 11),
          pLine(90, 116, 108, 168, 11)
        ]);
      }

      function buildDrummerProposed() {
        // LIVE drummer (approved 2026-10-06 — “Approve revised
        // R2 — drummer final, add to game”): drummer R2 from
        // the style options board, in its revised form with
        // the hi-hat moved forward, clear of the torso —
        // ported shape-for-shape, the board figure's own
        // geometry, nothing redrawn. He sits in SIDE PROFILE
        // facing left: crash cymbal far left on its stand,
        // snare and one rack tom over a pinstripe bass drum,
        // the hi-hat standing forward of the snare in open
        // space (its discs end ~14 units short of the torso,
        // with daylight all around them), throne, kick pedal,
        // one stick up to the crash and the snare stick caught
        // raised mid-stroke — lengthened slightly, as on the
        // board, to cover the reach to the moved hi-hat. The
        // board's strokes become filled pieces at the board's
        // own weights (see segParts / cubicParts) and its
        // fills are the board's path data verbatim; ellipse
        // rotations are the board's degrees in radians. The
        // pinstripe bass drum is four concentric circles the
        // board fills with evenodd; canvas fills nonzero, so
        // the 2nd and 4th circles carry flipped arc sweep
        // flags — wound opposite their neighbours — which
        // leaves the same two rings filled and the centre
        // hole and pinstripe gap open under nonzero fill
        // (the same trick as G1's sound hole). This is now
        // the drummer used in gameplay, scoring, and the
        // solver (via chars[2] below).
        return flatParts([
          // crash cymbal, far left, + its stand
          pEll(26, 47, 15, 3.2, -0.1396),
          segParts(26, 51, 24, 128, 2.5),
          // rack tom over the bass drum
          pEll(63, 90, 12, 5.5, -0.0698),
          // bass drum in profile, pinstripe rings + centre hole
          new Path2D("M46 88 a26 26 0 1 0 0 52 a26 26 0 1 0 0 -52 Z M46 91 a23 23 0 1 1 0 46 a23 23 0 1 1 0 -46 Z M46 92.5 a21.5 21.5 0 1 0 0 43 a21.5 21.5 0 1 0 0 -43 Z M46 98 a16 16 0 1 1 0 32 a16 16 0 1 1 0 -32 Z"),
          // snare + its stand
          pEll(36, 79, 11, 6, -0.1745),
          segParts(36, 85, 38, 98, 2.2),
          // hi-hat, moved forward clear of the body: two thin
          // discs on a slim stand, in front of the snare
          pEll(67, 73, 9.5, 1.8, 0),
          pEll(67, 76.5, 9.5, 1.8, 0),
          segParts(67, 78, 67, 128, 2.2),
          // throne: seat + stem
          segParts(100, 93, 118, 93, 4),
          segParts(109, 93, 109, 128, 4),
          // leg down to the kick pedal + shoe
          segParts(102, 88, 80, 94, 8),
          segParts(80, 94, 76, 128, 8),
          new Path2D("M68 132 L82 132 L81 126 L70 126 Z"),
          // kick pedal at his foot
          pPoly([56, 141, 67, 141, 65, 135, 58, 135]),
          // torso, in profile
          new Path2D("M96 43 C106 40 114 46 113 56 L110 85 C109 92 102 94 97 90 C92 87 91 80 92 69 L94 51 Z"),
          // arm out to the crash cymbal + its stick
          cubicParts(102, 50, 88, 44, 70, 45, 54, 50, 6.5),
          segParts(54, 50, 43, 54, 2.5),
          // snare arm bent up, stick caught raised mid-stroke
          // (lengthened slightly for the hi-hat's new reach)
          cubicParts(100, 54, 94, 61, 89, 65, 81, 65, 7.5),
          segParts(81, 65, 70, 53, 2.5),
          // head in profile: round head, nose, hair cap
          pCirc(103, 31, 11),
          pPoly([94, 31, 86, 35, 95, 38]),
          new Path2D("M92 30 C91 18 98 11 105 12 C113 13 117 20 116 29 C113 22 107 19 102 20 C97 21 93 24 92 30 Z")
        ]);
      }

      /* ================= state ================= */
      // Each performer carries a list of targets: { bits, goal, now }.
      // Easy deals exactly one, Medium exactly two, Hard exactly
      // three, and every sub-target has to be met to win.
      var chars = [
        { name: "Singer",    x: 118, scale: 1, build: buildSingerProposed, targets: [{ bits: 1, goal: 65, now: 0 }], samples: [], path: null },
        { name: "Guitarist", x: 405, scale: 1, build: buildGuitaristProposed, targets: [{ bits: 2, goal: 65, now: 0 }], samples: [], path: null },
        { name: "Drummer",   x: 692, scale: 1.23, build: buildDrummerProposed, targets: [{ bits: 4, goal: 65, now: 0 }], samples: [], path: null }
      ];
      function makeLight(slot, color, tilt, power) {
        var on = power !== false;
        return {
          slot: slot, x: SLOTS[slot], pos: SLOT_POS[slot],
          color: color, tilt: tilt || 0, doorL: 0, doorR: 0,
          // `power` is the player's persistent on/off state for
          // this fixture. `on`/`level` are the show's animated
          // brightness and are always gated by `power` (see
          // lampLevel), so a powered-off fixture never shines,
          // not even during the win show.
          power: on, on: on, level: on ? 1 : 0
        };
      }
      // All seven hang points carry a fixture from the start —
      // fixtures are never added or removed. On first load the
      // three fixtures directly over the performers — singer
      // (slot 1), guitarist (slot 3), and drummer (slot 5) — are
      // powered ON; the other four (the ones that used to start
      // "missing") are present but powered OFF.
      // Round-start color per slot, repeating G/R/B across the
      // truss — it keeps the original default trio at R (slot 1),
      // G (slot 3), and B (slot 5) while giving every other
      // fixture a fixed starting color of its own.
      function slotColor(slot) { return ["G", "R", "B"][slot % 3]; }
      var lights = SLOTS.map(function (sx, s) {
        return makeLight(s, slotColor(s), 0, s === 1 || s === 3 || s === 5);
      });
      var mode = "easy";
      var won = false;
      var wonAt = 0;   // when the round was won, for the backdrop sign's fade-in

      /* ================= offscreen canvases ================= */
      var stage = document.getElementById("stage");
      var ctx = stage.getContext("2d");
      var lightCanvas = document.createElement("canvas");
      lightCanvas.width = W; lightCanvas.height = H;
      var lctx = lightCanvas.getContext("2d");
      var tintCanvas = document.createElement("canvas");
      tintCanvas.width = W; tintCanvas.height = H;
      var tctx = tintCanvas.getContext("2d");
      var maskCanvas = document.createElement("canvas");
      maskCanvas.width = CHAR_W; maskCanvas.height = CHAR_H;
      var mctx = maskCanvas.getContext("2d");

      // Grounding: each silhouette's own lowest filled pixel is
      // measured from its mask (groundY, in local coords), and the
      // figure is placed so that exact point sits on FLOOR_Y —
      // feet / mic-stand base / bass-drum bottom + throne on the
      // stage floor, nobody floating. The drummer also gets a
      // scale-up (ch.scale, 1.23), anchored at that same
      // floor point and at the figure's horizontal centre, so
      // growing it never lifts it off the ground. Rendering,
      // scoring, and the solver all place samples through
      // charStagePoint / applyCharTransform, so they always
      // agree with what is drawn.
      function charStagePoint(ch, lx, ly) {
        return [
          ch.x + CHAR_W / 2 + (lx - CHAR_W / 2) * ch.scale,
          FLOOR_Y + (ly - ch.groundY) * ch.scale
        ];
      }
      function applyCharTransform(c, ch) {
        c.translate(ch.x + CHAR_W / 2, FLOOR_Y);
        c.scale(ch.scale, ch.scale);
        c.translate(-CHAR_W / 2, -ch.groundY);
      }
      function charMidY(ch) {
        return FLOOR_Y - (ch.groundY - ch.topY) * ch.scale / 2;
      }

      // Build each silhouette path once; precompute sample points for scoring.
      // fillPathParts handles both single-Path2D shapes and the
      // singer's list of pieces, so scoring/solver sample the
      // exact live silhouettes.
      chars.forEach(function (ch) {
        ch.path = ch.build();
        mctx.clearRect(0, 0, CHAR_W, CHAR_H);
        mctx.fillStyle = "#fff";
        fillPathParts(mctx, ch.path);
        var data = mctx.getImageData(0, 0, CHAR_W, CHAR_H).data;
        var maxY = 0, minY = CHAR_H - 1;
        for (var by = 0; by < CHAR_H; by++) {
          for (var bx = 0; bx < CHAR_W; bx++) {
            if (data[(by * CHAR_W + bx) * 4 + 3] > 120) {
              if (by > maxY) maxY = by;
              if (by < minY) minY = by;
            }
          }
        }
        // Bottom edge of the lowest filled pixel row.
        ch.groundY = maxY + 1;
        ch.topY = minY;
        var pts = [];
        for (var y = 0; y < CHAR_H; y += 3) {
          for (var x = 0; x < CHAR_W; x += 3) {
            if (data[(y * CHAR_W + x) * 4 + 3] > 120) pts.push([x, y]);
          }
        }
        ch.samples = pts;
      });

      // Flattened sample list (stage coords + performer index) for
      // the round solver's fast rig evaluations. The stage coords
      // depend on FLOOR_Y, which differs between control schemes
      // (the Mobile scene is drawn BAND_H shorter), so this is a
      // rebuildable step: applySchemeChrome calls it again after
      // every scheme switch, keeping the solver's samples in the
      // live coordinate space. (The samples shift up by exactly
      // BAND_H in Mobile, in lockstep with the beams, which is
      // why solver percentages come out identical per scheme.)
      var flatX = [], flatY = [], flatC = [];
      var flatSX = [], flatSY = [], flatSC = [], searchTotals = [0, 0, 0];
      function rebuildFlatSamples() {
        flatX = []; flatY = []; flatC = [];
        chars.forEach(function (ch, ci) {
          ch.samples.forEach(function (p) {
            var sp = charStagePoint(ch, p[0], p[1]);
            flatX.push(sp[0]);
            flatY.push(sp[1]);
            flatC.push(ci);
          });
        });
        // Half-density copy for the solver's search phase: candidate
        // rigs are scored on every second sample (plenty accurate
        // with the safety margin), and only a rig that produces a
        // deal is re-scored at full density for final verification.
        flatSX = []; flatSY = []; flatSC = []; searchTotals = [0, 0, 0];
        for (var fi = 0; fi < flatX.length; fi += 2) {
          flatSX.push(flatX[fi]);
          flatSY.push(flatY[fi]);
          flatSC.push(flatC[fi]);
          searchTotals[flatC[fi]]++;
        }
      }
      rebuildFlatSamples();

      /* ================= beam geometry ================= */
      // Effective beam half-angle for one side, from barn-door
      // OCCLUSION rather than the door's own rotation angle. The light
      // is a point source at the lens center (fixture-local (0, 17));
      // the beam edge on a side is the ray from the lens grazing the
      // flap tip, extended — the shadow line the door actually casts.
      // While the tip is still outside the open cone the door cuts
      // nothing (the first part of its swing is dead travel, as on a
      // real fixture); once the tip crosses the cone edge, the beam
      // edge follows the shadow ray, which sweeps non-linearly and
      // does NOT track the flap angle. Only fully open do beam edge
      // and door share an angle: both are BASE_HALF. Fully closed,
      // the tip sits on the beam centerline, so the shadow ray is the
      // centerline itself (half angle 0) and the center stop in
      // beamAngles takes it from there.
      function doorHalfAngle(side, door) {
        var ang = flapAngle(side, door);
        var tipX = side * 13 - Math.sin(ang) * FLAP_LEN;
        var tipY = 16 + Math.cos(ang) * FLAP_LEN;
        var shadow = Math.atan2(Math.abs(tipX), tipY - 17);
        return Math.min(BASE_HALF, Math.max(0, shadow));
      }
      function beamAngles(L) {
        var t = L.tilt * Math.PI / 180;
        var leftHalf = doorHalfAngle(-1, L.doorL);
        var rightHalf = doorHalfAngle(1, L.doorR);
        // Doors close only as far as the center point of the beam:
        // each half-angle floors at 0, so an edge can reach the beam
        // centerline (t) but never swing past it. And the pair together
        // always leaves a narrow sliver straddling that centerline, so
        // closing both doors still can't fully close off the light.
        var MIN_TOTAL = 5 * Math.PI / 180;
        if (leftHalf + rightHalf < MIN_TOTAL) {
          leftHalf = MIN_TOTAL / 2;
          rightHalf = MIN_TOTAL / 2;
        }
        return { a1: t - leftHalf, a2: t + rightHalf, t: t };
      }
      // The lens center in stage coords. The fixture rotates about
      // (L.x, APEX_Y - 8) with the lens at fixture-local (0, 17), so the
      // lens swings sideways as the light tilts — it is NOT the fixed
      // point (L.x, APEX_Y) the beam used to start from, which is why
      // cone and fixture drifted out of sync. The beam and the lens
      // glow are both built from the rotated fixture geometry below,
      // so the cone always comes out of the fixture itself.
      function lensPos(L) {
        return fixtureToStage(L, 0, 17);
      }
      // The beam polygon, built so its edges START even with the barn
      // doors and still cut by occlusion. Each side's boundary runs:
      // hinge -> flap tip -> far point on the shadow ray. The edge
      // begins at the door's own hinge on the lens rim and follows
      // the flap out to its tip — the tip is always exactly on the
      // beam boundary — then leaves the tip along the shadow
      // direction from beamAngles (the ray from the lens center
      // grazing the tip), so a closing door's cut still sweeps like
      // a cast shadow instead of tracking the flap's angle. Fully
      // open, the flap direction and the shadow direction are both
      // BASE_HALF, so the two segments are collinear: one straight
      // edge lying along the door. Rendering and scoring
      // (pointInBeam) share this one polygon.
      function beamQuad(L) {
        var a = beamAngles(L);
        var hingeL = fixtureToStage(L, -13, 16);
        var hingeR = fixtureToStage(L, 13, 16);
        var tipL = flapSegment(L, -1)[1];
        var tipR = flapSegment(L, 1)[1];
        return {
          src: lensPos(L),
          pts: [
            hingeL, tipL,
            [tipL[0] + BEAM_LEN * Math.sin(a.a1), tipL[1] + BEAM_LEN * Math.cos(a.a1)],
            [tipR[0] + BEAM_LEN * Math.sin(a.a2), tipR[1] + BEAM_LEN * Math.cos(a.a2)],
            tipR, hingeR
          ]
        };
      }
      function pointInBeam(L, px, py) {
        // Even-odd ray casting over the beam polygon: unlike the old
        // triangle test it stays correct while a door is cutting,
        // when the tip vertices make the polygon non-convex.
        var pts = beamQuad(L).pts;
        var inside = false;
        for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          var xi = pts[i][0], yi = pts[i][1];
          var xj = pts[j][0], yj = pts[j][1];
          if ((yi > py) !== (yj > py) &&
              px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
      }

      /* ---- in-scene control geometry ---- */
      // Fixture-local point -> stage coords (fixture hangs at APEX_Y - 8
      // and rotates by -tilt, matching drawFixture).
      function fixtureToStage(L, lx, ly) {
        var r = -L.tilt * Math.PI / 180;
        var c = Math.cos(r), s = Math.sin(r);
        return [L.x + lx * c - ly * s, (APEX_Y - 8) + lx * s + ly * c];
      }
      // Barn-door flap angle (fixture-local radians) for a side (-1/+1)
      // and a door amount (0–100). Open (0): the flap flares outward past
      // the lens, clear of the beam. Closing swings it inward, measured
      // against the center point of the beam: at 100 the flap tip lands
      // exactly on the beam centerline (fixture-local x = 0) and goes no
      // further — the door reaches the center of the beam but never
      // crosses it, matching the beam-cut limit in beamAngles. The
      // closed angle is asin(hinge offset / flap length): the angle
      // whose tip sits on that centerline. Shared by the drawing, the
      // hit-test segment, and the drag inverse so all three agree.
      function flapAngle(side, door) {
        var closed = Math.asin(13 / FLAP_LEN);
        // Open (0) flares to exactly BASE_HALF — the same max angle as
        // the beam itself — so a fully open door lies along its beam
        // edge and the cone touches the doors.
        return side * ((door / 100) * (closed + BASE_HALF) - BASE_HALF);
      }
      // Barn-door flap segment (hinge -> tip) in stage coords.
      // FLAP_LEN is shared with drawFixture: the flaps are drawn long
      // enough that the tip knobs sit clear of the can body, so the
      // door grab points live outside the fixture's aim zone.
      var FLAP_LEN = 38;
      function flapSegment(L, side) {
        var door = side < 0 ? L.doorL : L.doorR;
        var ang = flapAngle(side, door);
        var hinge = [side * 13, 16];
        var tip = [hinge[0] - Math.sin(ang) * FLAP_LEN, hinge[1] + Math.cos(ang) * FLAP_LEN];
        return [fixtureToStage(L, hinge[0], hinge[1]), fixtureToStage(L, tip[0], tip[1])];
      }
      function distToSegment(px, py, a, b) {
        var dx = b[0] - a[0], dy = b[1] - a[1];
        var len2 = dx * dx + dy * dy || 1;
        var t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2));
        var ex = a[0] + t * dx - px, ey = a[1] + t * dy - py;
        return Math.hypot(ex, ey);
      }
      function rgba(rgb, a) {
        return "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + a + ")";
      }

      /* ================= rendering ================= */
      function lampLevel(L) {
        // Smooth brightness 0..1. A powered-off fixture is always
        // dark, whatever the show animation is doing. During the
        // show a powered-on lamp's level eases up/down (fade)
        // instead of snapping; in play a powered-on lamp is 1.
        // Witness/start rigs carry no `power` field unless they
        // mean it — only an explicit false gates the level.
        if (L.power === false) return 0;
        if (typeof L.level === "number") return Math.max(0, Math.min(1, L.level));
        return L.on === false ? 0 : 1;
      }
      function isPowered(L) { return L.power !== false; }
      function drawBeamShape(c, L, innerA, outerA) {
        var lvl = lampLevel(L);
        if (lvl <= 0.02) return;   // lamp faded right down in the show
        var q = beamQuad(L);
        var rgb = CH_RGB[L.color];
        var farL = q.pts[2], farR = q.pts[3];
        var farX = (farL[0] + farR[0]) / 2, farY = (farL[1] + farR[1]) / 2;
        var g = c.createLinearGradient(q.src[0], q.src[1], farX, farY);
        g.addColorStop(0, rgba(rgb, innerA * lvl));
        g.addColorStop(0.55, rgba(rgb, innerA * 0.55 * lvl));
        g.addColorStop(1, rgba(rgb, outerA * lvl));
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(q.pts[0][0], q.pts[0][1]);
        for (var k = 1; k < q.pts.length; k++) c.lineTo(q.pts[k][0], q.pts[k][1]);
        c.closePath();
        c.fill();
      }

      function drawFixture(L) {
        var rgb = CH_RGB[L.color];
        var off = !isPowered(L);
        // A powered-off fixture stays in the scene but reads as
        // present-but-off: the whole can is drawn dimmed and
        // greyed, and its lens stays dark glass (lampLevel is 0,
        // so no lens colour or glow is painted below).
        ctx.save();
        if (off) ctx.globalAlpha = 0.45;
        // hanger
        ctx.strokeStyle = off ? "#2b2b31" : "#3a3a42";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(L.x, TRUSS_Y + 6);
        ctx.lineTo(L.x, APEX_Y - 26);
        ctx.stroke();
        ctx.save();
        ctx.translate(L.x, APEX_Y - 8);
        // Beam math points the cone at x + LEN*sin(tilt), so the can must
        // tip the same way: negate the canvas rotation (positive canvas
        // rotation swings the downward lens to the left, opposite the beam).
        ctx.rotate(-L.tilt * Math.PI / 180);
        // barn door flaps (hinged at the lens rim; angle follows door amount)
        ctx.fillStyle = "#26262c";
        var flapLen = FLAP_LEN;
        [-1, 1].forEach(function (side) {
          var door = side < 0 ? L.doorL : L.doorR;
          // open (0%): flap flared outward past the lens; closed (100%): tip swung in to the beam centerline, no further
          var ang = flapAngle(side, door);
          ctx.save();
          ctx.translate(side * 13, 16);
          ctx.rotate(ang);
          ctx.fillRect(side < 0 ? -3 : 0, 0, 4.5, flapLen);
          ctx.restore();
        });
        // can body
        ctx.fillStyle = "#222228";
        ctx.strokeStyle = "#45454f";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-15, -22, 30, 40, 6); else ctx.rect(-15, -22, 30, 40);
        ctx.fill(); ctx.stroke();
        // yoke
        ctx.strokeStyle = "#45454f";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-15, -14); ctx.lineTo(-20, -26);
        ctx.moveTo(15, -14); ctx.lineTo(20, -26);
        ctx.stroke();
        // lens — dark glass that fades up with the lamp's level
        var lvlF = lampLevel(L);
        ctx.fillStyle = "#17171d";
        ctx.beginPath();
        ctx.ellipse(0, 17, 12.5, 6.5, 0, 0, 6.2832);
        ctx.fill();
        if (lvlF > 0.02) {
          var lg = ctx.createRadialGradient(0, 17, 1, 0, 17, 14);
          lg.addColorStop(0, "rgba(255,255,255," + (0.95 * lvlF) + ")");
          lg.addColorStop(0.35, rgba(rgb, 0.95 * lvlF));
          lg.addColorStop(1, rgba(rgb, 0.55 * lvlF));
          ctx.fillStyle = lg;
          ctx.beginPath();
          ctx.ellipse(0, 17, 12.5, 6.5, 0, 0, 6.2832);
          ctx.fill();
        }
        ctx.restore();
        // glow at lens (unrotated, additive) — centered on the actual
        // rotated lens position, same as the beam's origin geometry;
        // fades with the lamp level during the show
        if (lvlF > 0.02) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          var lp = lensPos(L);
          var gg = ctx.createRadialGradient(lp[0], lp[1], 0, lp[0], lp[1], 34);
          gg.addColorStop(0, rgba(rgb, 0.5 * lvlF));
          gg.addColorStop(1, rgba(rgb, 0));
          ctx.fillStyle = gg;
          ctx.fillRect(lp[0] - 34, lp[1] - 34, 68, 68);
          ctx.restore();
        }
        ctx.restore();
      }

      /* ---- on-stage controls: tilt arc + barn-door flap knobs. The
              beam itself carries no handles — doors are worked only
              from the knobs on the flap tips. ---- */
      function drawSceneControls() {
        // Mobile scheme: the scene stays clean — no aim circles,
        // no barn-door knobs. The only canvas affordance is a
        // subtle highlight ring on the fixture the open modal is
        // controlling, so the eye can tie the modal to its light.
        if (controlScheme === "mobile") {
          if (modalIdx >= 0 && lights[modalIdx]) {
            var mL = lights[modalIdx];
            ctx.save();
            ctx.beginPath();
            ctx.arc(mL.x, APEX_Y - 8, 27, 0, 6.2832);
            ctx.strokeStyle = "rgba(255, 217, 138, 0.9)";
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 4]);
            ctx.stroke();
            ctx.restore();
          }
          return;
        }
        lights.forEach(function (L, i) {
          var rgb = CH_RGB[L.color];
          var active = !won && (i === selectedIdx || i === dragIdx || (hoverHit && hoverHit.idx === i));
          // barn-door flap knobs (tip of each flap)
          [-1, 1].forEach(function (side) {
            var seg = flapSegment(L, side);
            var tip = seg[1];
            var hot = hoverHit && hoverHit.idx === i && hoverHit.part === (side < 0 ? "flapL" : "flapR");
            ctx.save();
            ctx.beginPath();
            ctx.arc(tip[0], tip[1], hot ? 8 : 6, 0, 6.2832);
            ctx.fillStyle = hot ? "#ffd98a" : "rgba(16,16,20,0.9)";
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = hot ? "#ffd98a" : "rgba(240,237,230," + (active ? "0.85" : "0.45") + ")";
            ctx.stroke();
            ctx.restore();
          });
          // Aim control point — a circle in the middle of the fixture,
          // drawn exactly like the barn-door end circles so all the
          // grab points on a fixture read the same way. It sits on the
          // pivot (L.x, APEX_Y - 8), the centre of the can.
          (function () {
            var cx = L.x, cy = APEX_Y - 8;
            var hotAim = !won && ((hoverHit && hoverHit.idx === i && hoverHit.part === "tilt") ||
              (dragIdx === i && dragPart === "tilt"));
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, hotAim ? 10 : 8, 0, 6.2832);
            ctx.fillStyle = hotAim ? "#ffd98a" : "rgba(16,16,20,0.92)";
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = hotAim ? "#ffd98a" : "rgba(240,237,230," + (active || hotAim ? "0.9" : "0.55") + ")";
            ctx.stroke();
            // small centre dot so the pivot reads at a glance
            ctx.beginPath();
            ctx.arc(cx, cy, 2.2, 0, 6.2832);
            ctx.fillStyle = hotAim ? "#1c1503" : "rgba(240,237,230,0.85)";
            ctx.fill();
            ctx.restore();
          })();
          // No add/remove glyphs anymore: every hang point
          // always carries a fixture, and presence is controlled
          // by the power button in its selector pill instead.
        });
      }

      function render() {
        // ---- backdrop ----
        var bg = ctx.createLinearGradient(0, 0, 0, H);
        // The wall/floor shading break is anchored to the floor
        // (84 units above it), not to a fraction of the scene
        // height, so the backdrop keeps the same geometry when
        // the Mobile scene is drawn BAND_H shorter. Desktop:
        // (516-84)/600 = 0.72, as before.
        var wallStop = (FLOOR_Y - 84) / H;
        bg.addColorStop(0, "#0b0b10");
        bg.addColorStop(wallStop, "#101017");
        bg.addColorStop(wallStop + 0.0001, "#17130e");
        bg.addColorStop(1, "#241b10");
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        // back wall panels: from 376 above the floor down to 30
        // above it (desktop y 140, height 346) in either scheme.
        ctx.fillStyle = "rgba(255,255,255,0.025)";
        for (var i = 0; i < 6; i++) ctx.fillRect(28 + i * 156, FLOOR_Y - 376, 2, 346);
        // ---- stage-complete sign: painted on the back wall as part
        //      of the set, not a UI overlay. It lives in the backdrop,
        //      so the show's beams play over it while it runs. Fades
        //      up over the first moments of the show (instant under
        //      reduced-motion), in the muted gold of stage paint. ----
        if (won) {
          var reducedSign = window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          var signFade = reducedSign ? 1 :
            Math.min(1, Math.max(0, (performance.now() - wonAt) / 1600));
          ctx.save();
          ctx.textAlign = "center";
          try { ctx.letterSpacing = "12px"; } catch (e) {}
          ctx.font = "700 60px 'Barlow Condensed', 'Barlow', sans-serif";
          ctx.fillStyle = "rgba(233, 199, 128, " + (0.3 * signFade) + ")";
          // Anchored to the floor (desktop y 272 / 296) so the
          // sign holds its place on the back wall in the shorter
          // Mobile scene too.
          ctx.fillText("STAGE COMPLETE", W / 2, FLOOR_Y - 244);
          try { ctx.letterSpacing = "0px"; } catch (e) {}
          ctx.strokeStyle = "rgba(233, 199, 128, " + (0.22 * signFade) + ")";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(W / 2 - 218, FLOOR_Y - 220);
          ctx.lineTo(W / 2 + 218, FLOOR_Y - 220);
          ctx.stroke();
          ctx.restore();
        }
        // floor boards
        ctx.strokeStyle = "rgba(255,190,90,0.07)";
        ctx.lineWidth = 1;
        for (var f = 0; f < 5; f++) {
          ctx.beginPath();
          ctx.moveTo(0, FLOOR_Y + 16 + f * 17);
          ctx.lineTo(W, FLOOR_Y + 16 + f * 17);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(255,200,110,0.10)";
        ctx.fillRect(0, FLOOR_Y, W, 2);

        // ---- beams on stage (additive) ----
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        lights.forEach(function (L) { drawBeamShape(ctx, L, 0.34, 0.02); });
        ctx.restore();

        // ---- light-only canvas for character tinting ----
        lctx.clearRect(0, 0, W, H);
        lctx.save();
        lctx.globalCompositeOperation = "lighter";
        lights.forEach(function (L) { drawBeamShape(lctx, L, 0.88, 0.55); });
        lctx.restore();

        // ---- characters: black base, then the additive light masked
        //      to the silhouette so each lit region takes the mixed color ----
        // The mask is painted piece by piece (fillPathParts) and the
        // light is kept with source-in, instead of clipping with a
        // single combined path: the singer is a list of pieces, and
        // a combined clip would punch holes where pieces overlap.
        chars.forEach(function (ch) {
          ctx.save();
          applyCharTransform(ctx, ch);
          ctx.fillStyle = "#000";
          fillPathParts(ctx, ch.path);
          ctx.restore();

          tctx.clearRect(0, 0, W, H);
          tctx.save();
          applyCharTransform(tctx, ch);
          tctx.fillStyle = "#fff";
          fillPathParts(tctx, ch.path);
          tctx.globalCompositeOperation = "source-in";
          tctx.setTransform(1, 0, 0, 1, 0, 0);
          tctx.drawImage(lightCanvas, 0, 0);
          tctx.restore();
          tctx.globalCompositeOperation = "source-over";
          ctx.drawImage(tintCanvas, 0, 0);
          // No name plate under the performer: the goal pill
          // inside the stage's floor band directly below
          // this silhouette identifies it by position.
        });

        // ---- truss + fixtures ----
        ctx.fillStyle = "#1b1b21";
        ctx.fillRect(30, TRUSS_Y - 9, W - 60, 10);
        ctx.fillRect(30, TRUSS_Y + 7, W - 60, 4);
        ctx.fillStyle = "#2c2c34";
        for (var t = 40; t < W - 40; t += 26) ctx.fillRect(t, TRUSS_Y - 9, 3, 20);
        lights.forEach(drawFixture);
        drawSceneControls();
        // The zoomed modal fixture mirrors the live light 1:1 —
        // every scene render refreshes it too, so there is never
        // an apply step or a stale preview.
        if (modalIdx >= 0) drawModalFixture();
      }

      /* ================= scoring ================= */
      function score() {
        chars.forEach(function (ch) {
          // One pass over the samples, counting how many pixels land
          // on each exact color mix; each target then reads its own
          // count (targets are disjoint — a pixel is exactly one mix).
          var counts = {};
          for (var i = 0; i < ch.samples.length; i++) {
            var sp = charStagePoint(ch, ch.samples[i][0], ch.samples[i][1]);
            var px = sp[0];
            var py = sp[1];
            var bits = 0;
            for (var j = 0; j < lights.length; j++) {
              // A powered-off fixture contributes nothing to
              // the mix — its samples stay Shadow for its beam.
              if (!isPowered(lights[j])) continue;
              if (pointInBeam(lights[j], px, py)) bits |= CH_BIT[lights[j].color];
            }
            counts[bits] = (counts[bits] || 0) + 1;
          }
          var total = ch.samples.length || 1;
          ch.targets.forEach(function (t) {
            t.now = Math.round((counts[t.bits] || 0) / total * 100);
          });
        });
      }

      /* ================= DOM: goal bars =================
         One slim pill per performer, sitting inside the stage's
         floor band under its performer, holding a single
         segmented bar — one segment per color target, with the
         color's name printed inside its segment so the goals
         read by word for color-blind players. No visible
         numbers; the exact figures live only in the pill's
         aria-label / tooltip for accessibility. */
      var goalsEl = document.getElementById("goals");
      var goalCards = chars.map(function (ch, i) {
        var card = document.createElement("div");
        card.className = "goal-card";
        // Centered on the performer's own stage x, as a percentage
        // of the stage box (which is exactly the canvas), so the
        // pill sits directly under its band member at any width.
        // No name label — the position is the identification.
        card.style.left = ((ch.x + CHAR_W / 2) / W * 100) + "%";
        card.innerHTML = '<div class="segbar"></div>';
        goalsEl.appendChild(card);
        return {
          card: card,
          barEl: card.querySelector(".segbar"),
          segs: []
        };
      });

      // Rebuild the bar's segments when a round is dealt (Medium
      // and Hard deal a different number of targets per performer
      // than Easy): one segment per target, equal shares of the
      // bar, tinted its target color. Shadow's target color is
      // near-black, which would vanish on the dark pill, so its
      // segment renders in a readable grey — its printed label,
      // aria-label, and tooltip still name it Shadow, and like
      // every label it prints white on its own dark plate.
      function buildGoalRows() {
        chars.forEach(function (ch, i) {
          var ui = goalCards[i];
          ui.barEl.innerHTML = "";
          ui.segs = ch.targets.map(function (t) {
            var seg = document.createElement("div");
            var combo = COMBO[t.bits];
            seg.className = "segseg" + (t.bits === 0 ? " is-shadow" : "");
            seg.innerHTML = '<div class="seg-fill"></div>';
            // The color name rides in its own layer above the
            // fill, so it stays whole and readable wherever the
            // fill boundary currently sits.
            var labelEl = document.createElement("span");
            labelEl.className = "seg-label";
            labelEl.textContent = combo.name;
            seg.appendChild(labelEl);
            ui.barEl.appendChild(seg);
            seg.style.setProperty("--seg", t.bits === 0 ? "#c9c2b4" : combo.css);
            return {
              seg: seg,
              fill: seg.querySelector(".seg-fill")
            };
          });
          var label = ch.name + " goals: " + ch.targets.map(function (t) {
            return COMBO[t.bits].name + " " + t.goal + "%";
          }).join(", ");
          ui.card.setAttribute("aria-label", label);
          ui.card.title = label;
        });
      }

      function refreshGoals() {
        chars.forEach(function (ch, i) {
          var ui = goalCards[i];
          var allMet = true;
          ch.targets.forEach(function (t, k) {
            var s = ui.segs[k];
            if (!s) return;
            var met = t.now >= t.goal;
            if (!met) allMet = false;
            // Fill fraction is progress toward this segment's own
            // goal, capped at full — a met target's segment is
            // completely filled, whatever its goal was.
            var frac = t.goal > 0 ? Math.min(1, t.now / t.goal) : 1;
            s.fill.style.width = (frac * 100) + "%";
            s.seg.classList.toggle("met", met);
          });
          ui.card.classList.toggle("met", allMet);
          // Keep the accessible readout current (not visible text).
          ui.card.setAttribute("aria-label", ch.name + " goals: " + ch.targets.map(function (t) {
            return COMBO[t.bits].name + " " + t.now + "% of " + t.goal + "% goal";
          }).join(", "));
        });
      }

      /* ================= DOM: on-stage color dots =================
         One pill per light — always seven, one per hang point —
         positioned over its fixture. Each pill leads with a
         POWER button (⏻) that toggles that fixture on/off,
         followed by the R/G/B color dots. The dots stay usable
         while a light is off, so a player can preset its color
         before switching it on.                             */
      var sceneUi = document.getElementById("sceneUi");
      var sceneCtls = [];
      var sceneDots = [];
      var scenePowerBtns = [];
      function buildSceneCtls() {
        sceneUi.innerHTML = "";
        sceneCtls = lights.map(function (L, i) {
          var el = document.createElement("div");
          el.className = "scene-light-ctl";
          el.style.left = (L.x / W * 100) + "%";
          el.innerHTML =
            '<button class="scene-power" data-light="' + i + '" aria-pressed="false" aria-label="Light ' + (i + 1) + ' power">&#x23FB;</button>' +
            '<button class="scene-dot" data-light="' + i + '" data-ch="R" aria-pressed="false" aria-label="Light ' + (i + 1) + ' red"></button>' +
            '<button class="scene-dot" data-light="' + i + '" data-ch="G" aria-pressed="false" aria-label="Light ' + (i + 1) + ' green"></button>' +
            '<button class="scene-dot" data-light="' + i + '" data-ch="B" aria-pressed="false" aria-label="Light ' + (i + 1) + ' blue"></button>';
          sceneUi.appendChild(el);
          return el;
        });
        sceneDots = Array.prototype.slice.call(sceneUi.querySelectorAll(".scene-dot"));
        sceneDots.forEach(function (b) {
          b.addEventListener("click", function () {
            var i = +b.getAttribute("data-light");
            lights[i].color = b.getAttribute("data-ch");
            selectedIdx = i;
            syncSceneDots();
            syncSceneSelection();
            update();
          });
        });
        scenePowerBtns = Array.prototype.slice.call(sceneUi.querySelectorAll(".scene-power"));
        scenePowerBtns.forEach(function (b) {
          b.addEventListener("click", function () {
            var i = +b.getAttribute("data-light");
            togglePower(i);
          });
        });
        if (won) {
          sceneDots.forEach(function (b) { b.disabled = true; });
          scenePowerBtns.forEach(function (b) { b.disabled = true; });
        }
        syncSceneDots();
        syncPowerStates();
        syncSceneSelection();
      }
      // Toggle one fixture's power. Powering off kills its beam
      // and its contribution to every mix at once; powering on
      // restores it at full level with whatever color, aim, and
      // door settings it already had (all presettable while off).
      // Turning every light off is allowed — the stage simply
      // goes all Shadow. Power states persist between rounds.
      function togglePower(i) {
        if (won) return;   // rig locked while the show runs
        var L = lights[i];
        if (!L) return;
        L.power = !isPowered(L);
        L.on = L.power;
        L.level = L.power ? 1 : 0;
        selectedIdx = i;
        syncPowerStates();
        syncSceneSelection();
        update();
      }
      // Reflect each light's power on its pill: the power button's
      // pressed state, its accessible name, and the pill's off
      // styling (dimmed/desaturated dots; the power button itself
      // is exempt from the dimming in CSS so it stays tappable).
      function syncPowerStates() {
        scenePowerBtns.forEach(function (b) {
          var i = +b.getAttribute("data-light");
          var L = lights[i];
          if (!L) return;
          var on = isPowered(L);
          b.setAttribute("aria-pressed", on ? "true" : "false");
          b.setAttribute("aria-label", "Light " + (i + 1) + " power " + (on ? "on" : "off"));
          b.title = on ? "Turn light off" : "Turn light on";
        });
        sceneCtls.forEach(function (el, i) {
          el.classList.toggle("off", !isPowered(lights[i]));
        });
      }
      function syncSceneSelection() {
        sceneCtls.forEach(function (el, i) {
          el.classList.toggle("selected", i === selectedIdx);
        });
      }

      // Reflect each light's current color on its on-stage dots
      // (the pressed dot is the lit channel). All light control is
      // in-scene now, so this is the only DOM sync the rig needs.
      function syncSceneDots() {
        sceneDots.forEach(function (b) {
          var L = lights[+b.getAttribute("data-light")];
          if (L) b.setAttribute("aria-pressed", b.getAttribute("data-ch") === L.color ? "true" : "false");
        });
      }

      /* ================= game flow =================
         No end screen: when every goal is met the round is won,
         the fixtures lock where they are, and the rig starts
         running a little show — the lamps chase through on/off
         patterns over the winning look until the next round.   */
      var newRoundBtn = document.getElementById("newRound");

      // Chase the lamps run once the show starts (bitmask per step:
      // bit i set = light i's TARGET level is 1, otherwise 0). All-on
      // bookends, a chase out and back, pair sweeps, one blackout
      // beat. Nothing snaps: each lamp's level eases toward its
      // target every animation frame, so steps crossfade — lamps
      // fade in and out instead of hard flashing on/off.
      // The pattern is built for however many lights are on the
      // truss when the show starts: all-on bookends, a chase out
      // and back, pair sweeps, one blackout beat.
      var showPattern = [7, 1, 2, 4, 2, 7, 3, 6, 5, 7, 0, 7, 4, 2, 1];
      function buildShowPattern(n) {
        var all = (1 << n) - 1;
        var steps = [all], i;
        for (i = 0; i < n; i++) steps.push(1 << i);
        for (i = n - 2; i >= 0; i--) steps.push(1 << i);
        steps.push(all);
        for (i = 0; i < n; i++) steps.push((1 << i) | (1 << ((i + 1) % n)));
        steps.push(all, 0, all);
        return steps;
      }
      var showAnimId = null;
      var showStepIdx = 0;
      var showStepAt = 0;
      var showLastFrame = 0;
      var showTargets = [1, 1, 1, 1, 1, 1, 1];

      function setShowTargets() {
        var mask = showPattern[showStepIdx % showPattern.length];
        lights.forEach(function (L, i) {
          // The show cycles only the lights that were ON in the
          // winning look; powered-off fixtures stay dark through
          // the whole show.
          showTargets[i] = (isPowered(L) && (mask & (1 << i))) ? 1 : 0;
          L.on = !!showTargets[i];
        });
      }
      function startShow() {
        showPattern = buildShowPattern(lights.length);
        var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        var stepMs = reduced ? 2400 : 1500;   // hold per pattern step
        var fadeTau = reduced ? 650 : 380;    // fade time constant (ms)
        showStepIdx = 0;
        setShowTargets();
        showStepAt = performance.now();
        showLastFrame = showStepAt;
        function tick(now) {
          if (!won) { showAnimId = null; return; }
          var dt = Math.min(80, now - showLastFrame);
          showLastFrame = now;
          if (now - showStepAt >= stepMs) {
            showStepIdx++;
            showStepAt = now;
            setShowTargets();
          }
          // Exponential ease toward the target: fast start, gentle
          // settle — reads as a theatrical fade, never a cut.
          var k = 1 - Math.exp(-dt / fadeTau);
          lights.forEach(function (L, i) {
            var cur = typeof L.level === "number" ? L.level : 1;
            var next = cur + (showTargets[i] - cur) * k;
            if (Math.abs(showTargets[i] - next) < 0.005) next = showTargets[i];
            L.level = next;
            if (sceneCtls[i]) sceneCtls[i].style.opacity = String(0.35 + 0.65 * next);
          });
          render();
          showAnimId = requestAnimationFrame(tick);
        }
        showAnimId = requestAnimationFrame(tick);
      }
      function stopShow() {
        if (showAnimId) { cancelAnimationFrame(showAnimId); showAnimId = null; }
        // Restore each lamp to its own power state — powered-off
        // fixtures come out of the show still off, not revived.
        lights.forEach(function (L) { L.on = isPowered(L); L.level = isPowered(L) ? 1 : 0; });
        sceneCtls.forEach(function (el) { el.style.opacity = "1"; });
      }
      // While the show runs the rig is locked: no aiming, no barn
      // doors, no color changes, no power toggles — the canvas
      // ignores input and the on-stage dots and power buttons
      // disable.
      function setControlsLocked(locked) {
        stage.classList.toggle("locked", locked);
        stage.style.cursor = locked ? "default" : "";
        sceneDots.forEach(function (b) { b.disabled = locked; });
        scenePowerBtns.forEach(function (b) { b.disabled = locked; });
      }

      function update() {
        if (won) { render(); return; }   // show is running; the look is frozen
        score();
        render();
        refreshGoals();
        var allMet = chars.every(function (ch) {
          return ch.targets.every(function (t) { return t.now >= t.goal; });
        });
        if (allMet) {
          won = true;
          wonAt = performance.now();
          closeLightModal();   // the show locks the rig; the modal goes with it
          setControlsLocked(true);
          newRoundBtn.classList.add("win-next");
          startShow();
        }
      }

      function shuffle(a) {
        for (var i = a.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
      }
      // Goal ranges for a single target — the old Hard scaling:
      // the goal scales by how many lights have to overlap on the
      // performer to make the color. A flat 50–70% for every target
      // dealt impossible rounds — white needs all three beams
      // covering the same stretch of silhouette at once, which the
      // fixtures' reach and spread can't always deliver at 70%.
      function targetRanges(bits) {
        // Shadow deals lower than any lit color: with seven wide
        // beams on the truss, keeping even half of a performer
        // completely untouched is genuinely hard, and in multi-target sets
        // a Shadow goal also competes with the lit goals sharing
        // the same silhouette.
        if (bits === 0) return [20, 25, 30, 35, 40];
        var n = (bits & 1 ? 1 : 0) + (bits & 2 ? 1 : 0) + (bits & 4 ? 1 : 0);
        if (n === 3) return [45, 50, 55];        // white: 45–55
        if (n === 2) return [50, 55, 60];        // secondaries: 50–60
        return [55, 60, 65, 70];                 // primaries: 55–70
      }
      // Multi-target sub-goal sets: several colors per performer,
      // sized so the set stays reachable — the sub-targets are
      // disjoint pixel shares, so their goals must sum to well
      // under 100%. Medium deals exactly two targets per performer;
      // Hard deals exactly three, mirroring the requested shape
      // (30 / 30 / 20).
      var MEDIUM_SETS = [
        [30, 30],
        [35, 30],
        [30, 25],
        [35, 25]
      ];
      var HARD_SETS = [
        [30, 30, 20],
        [30, 25, 20],
        [25, 25, 20],
        [35, 25, 15],
        [30, 20, 20],
        [25, 20, 15],
        [20, 20, 20],
        [20, 15, 15],
        [20, 15, 10],
        [15, 15, 10]
      ];

      /* ================= round solver =================
         Rounds are no longer dealt at random and hoped for the
         best — random targets kept producing impossible levels
         (e.g. 70% white on a performer no arrangement of beams
         can cover that way). Instead every round is generated
         FROM a witness: a concrete full-truss rig (any power
         states, colors, tilts, and door settings the player
         could dial in, using all seven hang points — every
         fixture is always present, and a witness that leaves a
         light off only proves less, so witnesses power the
         whole truss on; the player can always do the same) that
         is scored with the exact same beam-polygon geometry as
         the game itself.
         Targets are only dealt if that rig's real percentages
         clear them with margin, and the deal is re-verified
         against the percentages before it ships. If no witness
         clears the normal goal ranges after a few hundred
         tries, the margin shrinks, and in the last resort the
         goals are derived from the witness's own percentages —
         so a dealt round always carries a proof it can be won. */
      var solutionRig = null;   // the witness rig behind the current round

      // Exact per-mix percentages a rig achieves on each performer,
      // using beamQuad polygons (built once per light, not per
      // sample) with the same even-odd test as pointInBeam. Pass
      // coarse=true to score on the half-density search samples.
      function rigPercents(rig, coarse) {
        var xs = coarse ? flatSX : flatX;
        var ys = coarse ? flatSY : flatY;
        var cs = coarse ? flatSC : flatC;
        var quads = rig.map(function (L) { return beamQuad(L).pts; });
        var counts = chars.map(function () { return [0, 0, 0, 0, 0, 0, 0, 0]; });
        for (var i = 0; i < xs.length; i++) {
          var px = xs[i], py = ys[i], bits = 0;
          for (var j = 0; j < quads.length; j++) {
            // A rig entry explicitly powered off contributes
            // nothing. Witness rigs power everything on (a light
            // off in a witness could simply be switched on by
            // the player), while the new-round start rig carries
            // the player's real power states for the guard.
            if (rig[j].power === false) continue;
            var pts = quads[j], inside = false;
            for (var a = 0, b = pts.length - 1; a < pts.length; b = a++) {
              var xi = pts[a][0], yi = pts[a][1];
              var xj = pts[b][0], yj = pts[b][1];
              if ((yi > py) !== (yj > py) &&
                  px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
            }
            if (inside) bits |= CH_BIT[rig[j].color];
          }
          counts[cs[i]][bits]++;
        }
        return counts.map(function (row, ci) {
          var total = (coarse ? searchTotals[ci] : chars[ci].samples.length) || 1;
          return row.map(function (n) { return n / total * 100; });
        });
      }
      function aimTiltAt(slotX, tx, midY) {
        return Math.atan2(tx - slotX, midY - APEX_Y) * 180 / Math.PI;
      }
      // A plausible winning rig: every hang point occupied, channel
      // counts balanced (3/2/2), each lamp aimed at a performer —
      // grouped by stage zone most of the time, so beams pool on
      // one performer at a time and produce strong single mixes,
      // with jitter and mostly-open doors for partition variety.
      function randomWitnessRig() {
        var channels = shuffle(["R", "G", "B", "R", "G", "B", "R"].slice(0, SLOTS.length));
        // Multi-target modes need partitioned witnesses: grouped
        // aim and partly-closed doors far more often, so each
        // performer ends up with two or three substantial distinct
        // mixes instead of one dominant wash.
        var multi = mode !== "easy";
        var grouped = Math.random() < (multi ? 0.85 : 0.6);
        var groups = [[0, 1], [2, 3, 4], [5, 6]];
        // Witness styles, so the solver can prove Shadow rounds
        // too: some rigs spare one performer entirely (no lamp
        // aims at them, so most of their silhouette stays unlit
        // while the others get the full rig), and some run narrow
        // doors throughout (slivers of light, wide shadow between
        // them). Without these, aimed wide-open rigs light nearly
        // everything and no Shadow goal could ever be verified.
        var roll = Math.random();
        var spared = roll < 0.25 ? Math.floor(Math.random() * chars.length) : -1;
        var narrow = spared < 0 && roll < 0.45;
        function door() {
          if (narrow) {
            return Math.random() < 0.8
              ? [40, 55, 70, 85, 100][Math.floor(Math.random() * 5)]
              : Math.floor(Math.random() * 26);
          }
          if (multi) {
            return Math.random() < 0.4 ? 0 : [25, 50, 50, 75, 75, 100][Math.floor(Math.random() * 6)];
          }
          return Math.random() < 0.72 ? 0 : [25, 50, 75, 100][Math.floor(Math.random() * 4)];
        }
        function nearestChar(sx, skip) {
          var ci = -1, best = Infinity;
          chars.forEach(function (ch, k) {
            if (k === skip) return;
            var d = Math.abs(ch.x + CHAR_W / 2 - sx);
            if (d < best) { best = d; ci = k; }
          });
          return ci;
        }
        function randomChar(skip) {
          var ci = Math.floor(Math.random() * chars.length);
          if (ci === skip) ci = (ci + 1) % chars.length;
          return ci;
        }
        // Partition offsets: when a group of lights shares one
        // performer, they aim at different thirds of the
        // silhouette (rotated per rig) instead of all piling onto
        // its center. Center-piled beams make one dominant overlap
        // mix per performer — White nearly every time, and never
        // the two or three substantial zones Medium and Hard sets need.
        // Partitioned aim leaves pure-color flanks and secondary
        // overlap bands, so primaries, secondaries, and Shadow
        // slices all reach dealable shares.
        var partRot = Math.floor(Math.random() * 3);
        return SLOTS.map(function (sx, s) {
          var ci;
          if (spared >= 0) {
            ci = Math.random() < 0.6 ? nearestChar(sx, spared) : randomChar(spared);
          } else if (grouped) {
            ci = groups.findIndex(function (g) { return g.indexOf(s) >= 0; });
          } else if (Math.random() < 0.6) {
            ci = nearestChar(sx, -1);
          } else {
            ci = Math.floor(Math.random() * chars.length);
          }
          var tx = chars[ci].x + CHAR_W / 2;
          if (grouped && spared < 0) {
            var grp = groups[ci];
            tx += [-52, 0, 52][(grp.indexOf(s) + partRot) % 3];
          } else {
            tx += Math.random() * 70 - 35;
          }
          var tilt = aimTiltAt(sx, tx, charMidY(chars[ci])) + (Math.random() * 10 - 5);
          tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, tilt));
          return {
            slot: s, x: sx, color: channels[s], tilt: tilt,
            doorL: door(), doorR: door(), power: true, on: true, level: 1
          };
        });
      }
      // Easy deal from a witness: one target per performer, chosen
      // from every mix whose real percentage clears a normal-range
      // goal plus the safety margin. The pick is weighted —
      // witness rigs overlap so much that White qualifies almost
      // every time, and an unweighted first-match dealt White for
      // nearly half of all targets; primaries and Shadow are
      // weighted up so the full pool actually shows up.
      var DEAL_WEIGHTS = { 0: 3, 1: 3, 2: 3, 4: 3, 3: 2, 5: 2, 6: 2, 7: 1 };
      function tryDealEasy(pcts, margin) {
        var out = [];
        for (var ci = 0; ci < chars.length; ci++) {
          var options = [];
          COLOR_POOL.forEach(function (bits) {
            var ok = targetRanges(bits).filter(function (g) {
              return pcts[ci][bits] >= g + margin;
            });
            if (ok.length) {
              options.push({ bits: bits, goal: ok[Math.floor(Math.random() * ok.length)] });
            }
          });
          if (!options.length) return null;
          var totalW = options.reduce(function (s, o) { return s + DEAL_WEIGHTS[o.bits]; }, 0);
          var pick = Math.random() * totalW, found = options[options.length - 1];
          for (var k = 0; k < options.length; k++) {
            pick -= DEAL_WEIGHTS[options[k].bits];
            if (pick <= 0) { found = options[k]; break; }
          }
          out.push([found]);
        }
        return out;
      }
      // Multi-target deal from a witness (Medium: two targets per
      // performer, Hard: three): a goal set per performer, colors
      // best-fitted to the percentages the witness actually makes
      // (largest goal gets the smallest percentage that clears it,
      // leaving the big mixes for the other sub-targets).
      function tryDealMulti(pcts, margin, goalSets) {
        var out = [];
        for (var ci = 0; ci < chars.length; ci++) {
          var sets = shuffle(goalSets.slice());
          var found = null;
          for (var s = 0; s < sets.length && !found; s++) {
            var goals = sets[s].slice().sort(function (a, b) { return b - a; });
            var remaining = COLOR_POOL.slice();
            var picks = [], okAll = true;
            for (var g = 0; g < goals.length; g++) {
              remaining.sort(function (a, b) { return pcts[ci][a] - pcts[ci][b]; });
              var pick = -1;
              for (var r = 0; r < remaining.length; r++) {
                if (pcts[ci][remaining[r]] >= goals[g] + margin) { pick = remaining[r]; break; }
              }
              if (pick < 0) { okAll = false; break; }
              remaining.splice(remaining.indexOf(pick), 1);
              picks.push({ bits: pick, goal: goals[g] });
            }
            if (okAll) found = picks;
          }
          if (!found) return null;
          out.push(found);
        }
        return out;
      }
      function verifyDeal(dealt, pcts) {
        return dealt.every(function (list, ci) {
          return list.every(function (t) { return pcts[ci][t.bits] >= t.goal; });
        });
      }
      // Last-resort deal: goals read straight off a witness's real
      // percentages (a few points under what it achieves), so the
      // round is winnable by construction even if no witness ever
      // cleared the normal ranges.
      function fallbackDeal(pcts) {
        // The goal must never exceed what the witness achieved,
        // even for a mix it barely makes — no floor that can push
        // the goal past the percentage itself.
        function goalFrom(pct) {
          var g = Math.floor(pct) - 6;
          if (g > pct - 2) g = Math.floor(pct) - 1;
          if (g < 1) g = Math.max(1, Math.floor(pct));
          return g;
        }
        return chars.map(function (ch, ci) {
          var ranked = COLOR_POOL.slice().sort(function (a, b) {
            return pcts[ci][b] - pcts[ci][a];
          });
          if (mode === "easy") {
            return [{ bits: ranked[0], goal: goalFrom(pcts[ci][ranked[0]]) }];
          }
          // Multi-target fallback: exactly two targets on Medium,
          // exactly three on Hard — drawn from mixes the witness
          // actually makes a real share of, topped up from the
          // ranked list if fewer clear that bar.
          var want = mode === "medium" ? 2 : 3;
          var usable = ranked.filter(function (b) { return pcts[ci][b] >= 10; });
          var chosen = usable.slice(0, want);
          for (var ri = 0; ri < ranked.length && chosen.length < want; ri++) {
            if (pcts[ci][ranked[ri]] >= 5 && chosen.indexOf(ranked[ri]) < 0) chosen.push(ranked[ri]);
          }
          for (var rj = 0; rj < ranked.length && chosen.length < want; rj++) {
            if (chosen.indexOf(ranked[rj]) < 0) chosen.push(ranked[rj]);
          }
          // Scale the goals to a playable band instead of reading
          // them straight off the witness: a dominant mix the
          // witness makes at 95% would otherwise deal a ~90% goal
          // next to ~1% trace goals. Every goal stays under what
          // the witness achieves for that mix, so the set is still
          // jointly winnable by construction.
          return chosen.map(function (b) {
            var pct = pcts[ci][b];
            var g = Math.floor(pct * 0.7);
            if (g > 35) g = 35;
            if (g < 5) g = 5;
            if (g > pct - 1) g = Math.max(1, Math.floor(pct));
            return { bits: b, goal: g };
          });
        });
      }
      function solveRound() {
        var attempts = mode === "easy" ? 200 : (mode === "medium" ? 260 : 700);
        for (var a = 0; a < attempts; a++) {
          var rig = randomWitnessRig();
          // Search on the half-density samples; a rig that yields
          // a deal is re-scored at full density and the deal is
          // only shipped if it verifies there — the percentages
          // the game itself will compute.
          var pcts = rigPercents(rig, true);
          var margin = mode === "easy" ? (a < 100 ? 6 : 3)
            : mode === "medium" ? (a < 130 ? 4 : 2)
            : (a < 200 ? 4 : (a < 450 ? 2 : 1));
          var dealt = mode === "easy" ? tryDealEasy(pcts, margin)
            : tryDealMulti(pcts, margin, mode === "medium" ? MEDIUM_SETS : HARD_SETS);
          if (dealt && verifyDeal(dealt, rigPercents(rig))) {
            solutionRig = rig;
            return dealt;
          }
        }
        // Fallback: sample several witnesses and keep the deal
        // whose weakest target mix is strongest, so even a
        // fallback round deals substantial targets rather than
        // trace-percentage goals on whichever rig came up first.
        var bestRig = null, bestDeal = null, bestScore = -1;
        for (var f = 0; f < 60; f++) {
          var rigF = randomWitnessRig();
          var pctsF = rigPercents(rigF);
          var dealF = fallbackDeal(pctsF);
          var sc = Infinity;
          dealF.forEach(function (list, ci) {
            list.forEach(function (t) { sc = Math.min(sc, pctsF[ci][t.bits]); });
          });
          if (sc > bestScore) { bestScore = sc; bestRig = rigF; bestDeal = dealF; }
          if (bestScore >= 12) break;
        }
        solutionRig = bestRig;
        return bestDeal;
      }

      function newRound() {
        // Deal only rounds the solver has verified against a
        // witness rig (see solveRound above). The whole rig —
        // all seven fixtures — starts every round pointing
        // straight down (tilt 0). Power states are NOT reset:
        // the player's on/off setup carries into the new round.
        // Guard against a round that would begin already won:
        // score each deal against that exact start state (the
        // reset colors and door settings below, tilts at 0, and
        // the player's current power states) and re-deal from a
        // fresh witness until the start state does NOT meet
        // every goal. The targets move; the tilts stay at 0 and
        // the power states stay put either way.
        var dealt = null;
        for (var attempt = 0; attempt < 50; attempt++) {
          dealt = solveRound();
          var startRig = lights.map(function (L, i) {
            return {
              x: L.x, color: slotColor(L.slot),
              tilt: 0, doorL: 0, doorR: 0, power: isPowered(L)
            };
          });
          if (!verifyDeal(dealt, rigPercents(startRig))) break;
        }
        chars.forEach(function (ch, i) {
          ch.targets = dealt[i].map(function (t) {
            return { bits: t.bits, goal: t.goal, now: 0 };
          });
        });
        buildGoalRows();
        lights.forEach(function (L, i) {
          L.color = slotColor(L.slot);
          L.tilt = 0;   // straight down — every fixture, every round
          L.doorL = 0;
          L.doorR = 0;
        });
        won = false;
        closeLightModal();
        stopShow();
        setControlsLocked(false);
        newRoundBtn.classList.remove("win-next");
        syncSceneDots();
        syncPowerStates();
        update();
      }

      document.getElementById("newRound").addEventListener("click", newRound);

      /* ================= mixing cheat-sheet modal =================
         Pure reference: opening and closing it touches no game
         state, and the button is never part of the win lock, so
         it opens during the show too. Dismiss via the close
         button, a click on the dim backdrop, or Esc. */
      var mixModal = document.getElementById("mixModal");
      var mixOpenBtn = document.getElementById("mixOpen");
      function openMix() {
        mixModal.classList.add("open");
        mixModal.setAttribute("aria-hidden", "false");
        document.getElementById("mixClose").focus();
      }
      function closeMix() {
        if (!mixModal.classList.contains("open")) return;
        mixModal.classList.remove("open");
        mixModal.setAttribute("aria-hidden", "true");
        mixOpenBtn.focus();
      }
      mixOpenBtn.addEventListener("click", openMix);
      document.getElementById("mixClose").addEventListener("click", closeMix);
      mixModal.addEventListener("click", function (ev) {
        if (ev.target === mixModal) closeMix();
      });
      document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") { closeMix(); closeLightModal(); render(); }
      });
      var modeEasy = document.getElementById("modeEasy");
      var modeMedium = document.getElementById("modeMedium");
      var modeHard = document.getElementById("modeHard");
      function setMode(m) {
        if (mode === m) return;
        mode = m;
        modeEasy.setAttribute("aria-pressed", m === "easy" ? "true" : "false");
        modeMedium.setAttribute("aria-pressed", m === "medium" ? "true" : "false");
        modeHard.setAttribute("aria-pressed", m === "hard" ? "true" : "false");
        newRound();
      }
      modeEasy.addEventListener("click", function () { setMode("easy"); });
      modeMedium.addEventListener("click", function () { setMode("medium"); });
      modeHard.addEventListener("click", function () { setMode("hard"); });

      /* ================= in-scene dragging =================
         One pointer system for the on-stage controls:
         - fixture body        -> tilt (aim), by relative pointer motion
         - barn-door flap knob -> that side's door, by flap angle      */
      var selectedIdx = 0;
      var dragIdx = -1;
      var dragPart = null;      // "tilt" | "flapL" | "flapR"
      var dragStartX = null;    // pointer x (stage coords) at tilt-drag start
      var dragStartTilt = null; // fixture tilt at tilt-drag start
      var dragStartDoor = null; // door value at flap-drag start
      var dragStartAng = null;  // pointer angle around the hinge at flap-drag start
      var hoverHit = null;      // { idx, part } under the pointer, for highlight

      function stagePos(ev) {
        var r = stage.getBoundingClientRect();
        return [
          (ev.clientX - r.left) * (W / r.width),
          (ev.clientY - r.top) * (H / r.height)
        ];
      }
      // Live display scale: screen px per stage unit. All touch
      // geometry below is derived from it, so a control's on-screen
      // grab size stays put as the stage scales down to phone
      // widths instead of shrinking with the canvas.
      function displayScale() {
        var r = stage.getBoundingClientRect();
        return r.width > 0 ? r.width / W : 1;
      }
      // Below this display scale the legacy stage-unit grab radii
      // shrink to a few screen pixels (at phone width the aim
      // circle's 18 units are ~6 screen px), so hitTest derives
      // its radii from the live scale instead. At desktop scale
      // the legacy radii apply verbatim — mouse feel is untouched.
      var COARSE_SCALE = 0.85;
      // Pointer position in fixture-local coords (origin at the
      // aim pivot, y down the can) — the same inverse rotation
      // the flap maths has always used.
      function fixtureLocal(L, p) {
        var t = L.tilt * Math.PI / 180;
        var dx = p[0] - L.x, dy = p[1] - (APEX_Y - 8);
        return [dx * Math.cos(t) - dy * Math.sin(t),
                dx * Math.sin(t) + dy * Math.cos(t)];
      }
      // The pointer's angle around a flap's hinge, in the same
      // convention flapAngle uses, or null when the pointer is
      // too close to the hinge to read an angle from.
      function flapPointerAngle(L, side, p) {
        var loc = fixtureLocal(L, p);
        var vx = loc[0] - side * 13, vy = loc[1] - 16;
        if (vx * vx + vy * vy < 36) return null;
        return Math.atan2(-vx, vy);
      }
      function hitTest(p) {
        var i, seg;
        // No add/remove hit zones anymore — every fixture is
        // always present, and power lives in the selector pills.
        // Aim and barn-door zones work on powered-off fixtures
        // too, so their aim and doors can be preset while dark.
        var scale = displayScale();
        var coarse = scale < COARSE_SCALE;
        // Grab radii per fixture, in stage units; the drawn glyph
        // sizes never change — these zones are invisible. Legacy
        // values at desktop scale. In coarse mode each radius is
        // derived from the live display scale (~42 screen px) and
        // capped at half the distance to the nearest competing
        // control, so fattened zones never swallow each other:
        // adjacent aim pivots sit only 140 stage units (~49 screen
        // px on a phone) apart, so a blanket 44px zone is
        // geometrically impossible. An aim zone is always capped
        // by its own fixture's flap tips too, so the aim circle
        // can never reach a flap knob. The selected fixture — the
        // one being worked — is enlarged preferentially: only one
        // fixture is manipulated at a time, so its flap zones are
        // not capped by its own aim pivot (the aim pass runs
        // first and its radius still stops halfway to the tips,
        // so the knobs stay exclusively flap territory).
        var aimR = [], tipLR = [], tipRR = [], tipsL = [], tipsR = [];
        var stripTol = 6, bodyR = 36;
        for (i = 0; i < lights.length; i++) {
          tipsL.push(flapSegment(lights[i], -1)[1]);
          tipsR.push(flapSegment(lights[i], 1)[1]);
          aimR.push(18); tipLR.push(15); tipRR.push(15);
        }
        if (coarse) {
          bodyR = Math.min(70, 44 / scale);
          stripTol = Math.min(16, 11 / scale);
          var cps = [];
          for (i = 0; i < lights.length; i++) {
            cps.push({ i: i, kind: "aim", x: lights[i].x, y: APEX_Y - 8 });
            cps.push({ i: i, kind: "tipL", x: tipsL[i][0], y: tipsL[i][1] });
            cps.push({ i: i, kind: "tipR", x: tipsR[i][0], y: tipsR[i][1] });
          }
          var capFor = function (cp) {
            var best = Infinity;
            for (var k = 0; k < cps.length; k++) {
              var o = cps[k];
              if (o === cp) continue;
              // The selected fixture's flap zones are not capped
              // by its own aim pivot (see above).
              if (o.i === cp.i && cp.kind !== "aim" && o.kind === "aim" &&
                  cp.i === selectedIdx) continue;
              // Coincident sibling tips (both doors closed) don't
              // compete with each other: the side split in the
              // flap pass below separates them.
              if (o.i === cp.i && cp.kind !== "aim" && o.kind !== "aim" && o.kind !== cp.kind &&
                  Math.hypot(cp.x - o.x, cp.y - o.y) < 12) continue;
              var d = Math.hypot(cp.x - o.x, cp.y - o.y) / 2;
              if (d < best) best = d;
            }
            return best;
          };
          cps.forEach(function (cp) {
            var r = Math.min((cp.i === selectedIdx ? 44 : 42) / scale, capFor(cp));
            if (cp.kind === "aim") aimR[cp.i] = Math.max(18, r);
            else if (cp.kind === "tipL") tipLR[cp.i] = Math.max(15, r);
            else tipRR[cp.i] = Math.max(15, r);
          });
        }
        // Fixture visit order: natural order at desktop scale,
        // keeping the pass priority (aim, then flaps, then
        // bodies). In coarse mode the selected fixture is tested
        // first within each pass, so its enlarged zones win any
        // residual overlap.
        var order = lights.map(function (_, k) { return k; });
        if (coarse && selectedIdx > 0) {
          order.splice(order.indexOf(selectedIdx), 1);
          order.unshift(selectedIdx);
        }
        // Aim control point: the circle in the middle of the
        // fixture, on the pivot — well clear of the flap
        // hinges/tips, so it never steals a barn-door grab.
        for (var a = 0; a < order.length; a++) {
          i = order[a];
          var cdx = p[0] - lights[i].x, cdy = p[1] - (APEX_Y - 8);
          if (cdx * cdx + cdy * cdy < aimR[i] * aimR[i]) return { idx: i, part: "tilt" };
        }
        // Barn-door flaps: ONLY the knob circle at the flap tip
        // and the flap strip itself start a door drag — not the
        // beam, not the space around the door.
        for (var b = 0; b < order.length; b++) {
          i = order[b];
          var tipL = tipsL[i], tipR = tipsR[i];
          // Both doors fully closed: the two flap tips land on
          // the same point, so position alone can't tell the
          // doors apart (the left door would always win). Split
          // the shared grab zone by which side of the fixture's
          // own centerline the touch falls on — left half works
          // the left door, right half the right door — so the
          // right door stays grabbable.
          if (Math.hypot(tipL[0] - tipR[0], tipL[1] - tipR[1]) < 12) {
            seg = flapSegment(lights[i], -1);
            var segR2 = flapSegment(lights[i], 1);
            var midX = (tipL[0] + tipR[0]) / 2, midY = (tipL[1] + tipR[1]) / 2;
            var tipRad = Math.max(tipLR[i], tipRR[i]);
            if (Math.hypot(p[0] - midX, p[1] - midY) < tipRad ||
                distToSegment(p[0], p[1], seg[0], seg[1]) < stripTol ||
                distToSegment(p[0], p[1], segR2[0], segR2[1]) < stripTol) {
              return { idx: i, part: fixtureLocal(lights[i], p)[0] <= 0 ? "flapL" : "flapR" };
            }
            continue;
          }
          seg = flapSegment(lights[i], -1);
          if (Math.hypot(p[0] - tipL[0], p[1] - tipL[1]) < tipLR[i] ||
              distToSegment(p[0], p[1], seg[0], seg[1]) < stripTol) return { idx: i, part: "flapL" };
          seg = flapSegment(lights[i], 1);
          if (Math.hypot(p[0] - tipR[0], p[1] - tipR[1]) < tipRR[i] ||
              distToSegment(p[0], p[1], seg[0], seg[1]) < stripTol) return { idx: i, part: "flapR" };
        }
        // fixture bodies -> tilt (fallback grab around the can)
        for (var c = 0; c < order.length; c++) {
          i = order[c];
          var dx = p[0] - lights[i].x, dy = p[1] - (APEX_Y - 8);
          if (dx * dx + dy * dy < bodyR * bodyR) return { idx: i, part: "tilt" };
        }
        return null;
      }
      function applyFlapDrag(L, part, p) {
        // Barn-door flaps: RELATIVE drag, like the tilt drag —
        // the door moves by the pointer's angular travel around
        // the hinge since the grab (dragStartAng / dragStartDoor,
        // captured in pointerdown), never by the pointer's
        // absolute angle. The old absolute maths snapped the door
        // on the first move whenever the grab landed off the
        // flap's exact line; now an off-centre grab is inert
        // until the finger actually travels. The delta is damped
        // by the live display scale (never above the desktop
        // rate): on a phone the hinge-to-tip radius is only ~13
        // screen px, so the same finger travel would otherwise
        // swing the door ~3x farther than on desktop.
        var side = part === "flapL" ? -1 : 1;
        if (dragStartAng === null || dragStartDoor === null) return;
        var ang = flapPointerAngle(L, side, p);
        if (ang === null) return;   // too close to the hinge to read an angle
        var closedAng = Math.asin(13 / FLAP_LEN);
        var damp = Math.min(1, displayScale());
        var door = Math.round(dragStartDoor +
          (ang - dragStartAng) / side / (closedAng + BASE_HALF) * 100 * damp);
        door = Math.max(0, Math.min(100, door));
        if (side < 0) L.doorL = door; else L.doorR = door;
      }
      function applyDrag(p) {
        var L = lights[dragIdx];
        if (dragPart === "tilt") {
          // Direct relative drag from the centre control point:
          // tilt = tilt at grab + horizontal pointer travel x gain.
          // The old orbit-around-the-pivot maths ignored all motion
          // within 50px of the pivot — and the control point IS the
          // pivot — so a grab started dead and then lurched, which
          // is what felt clunky and slow. Horizontal travel has no
          // dead zone, no snap (it is measured from the grab point,
          // not the pointer's absolute position), and responds on
          // the first pixel. The gain is normalized by the live
          // display scale (and never raised above the desktop
          // rate), so it reads as ~0.45 deg per SCREEN pixel at
          // any stage size: a 10 deg adjustment takes a deliberate
          // ~22px of finger travel on a phone, same as on desktop,
          // instead of the ~8px the raw stage-unit gain gave when
          // the canvas shrank. The full +/-68 deg range sweeps in
          // about 300 screen px of travel.
          if (dragStartX === null) { dragStartX = p[0]; dragStartTilt = L.tilt; }
          L.tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT,
            dragStartTilt + (p[0] - dragStartX) * 0.45 * Math.min(1, displayScale())));
        } else if (dragPart === "flapL" || dragPart === "flapR") {
          applyFlapDrag(L, dragPart, p);
        }
        update();
      }
      function cursorFor(hit) {
        if (!hit) return "default";
        if (hit.part === "tilt") return "grab";
        return "ew-resize";
      }
      stage.addEventListener("pointerdown", function (ev) {
        if (won) return;   // rig locked while the show runs
        if (controlScheme === "mobile") { handleMobileTap(ev); return; }
        var startP = stagePos(ev);
        var hit = hitTest(startP);
        if (hit) {
          dragIdx = hit.idx;
          dragPart = hit.part;
          dragStartX = startP[0];
          dragStartTilt = lights[hit.idx].tilt;
          if (hit.part === "flapL" || hit.part === "flapR") {
            // Baseline for the relative flap drag: the door value
            // now, and the pointer's angle around the hinge now.
            var fside = hit.part === "flapL" ? -1 : 1;
            var fL = lights[hit.idx];
            dragStartDoor = fside < 0 ? fL.doorL : fL.doorR;
            var ang0 = flapPointerAngle(fL, fside, startP);
            // A strip grab too close to the hinge has no readable
            // angle; take the flap's own current angle as the
            // baseline instead — the pointer sits on the flap
            // there, so the two agree and the first move still
            // doesn't snap.
            dragStartAng = ang0 === null ? flapAngle(fside, dragStartDoor) : ang0;
          } else {
            dragStartDoor = null;
            dragStartAng = null;
          }
          selectedIdx = hit.idx;
          syncSceneSelection();
          stage.classList.add("dragging");
          stage.setPointerCapture(ev.pointerId);
          render();
        } else {
          // Clicking a beam selects that light (last drawn = topmost feel).
          // Powered-off fixtures throw no beam, so they can't be
          // selected this way — their pill and fixture still can.
          var p = stagePos(ev);
          for (var i = lights.length - 1; i >= 0; i--) {
            if (!isPowered(lights[i])) continue;
            if (pointInBeam(lights[i], p[0], p[1])) {
              if (selectedIdx !== i) { selectedIdx = i; syncSceneSelection(); render(); }
              break;
            }
          }
        }
      });
      stage.addEventListener("pointermove", function (ev) {
        if (won) return;   // no hover highlights while the show runs
        if (controlScheme === "mobile") return;   // no canvas drags or hovers in the mobile scheme
        var p = stagePos(ev);
        if (dragIdx >= 0) { applyDrag(p); return; }
        var hit = hitTest(p);
        var changed = JSON.stringify(hit) !== JSON.stringify(hoverHit);
        hoverHit = hit;
        stage.style.cursor = cursorFor(hit);
        if (changed) render();
      });
      function endDrag() {
        dragIdx = -1;
        dragPart = null;
        dragStartX = null;
        dragStartTilt = null;
        dragStartDoor = null;
        dragStartAng = null;
        stage.classList.remove("dragging");
      }
      stage.addEventListener("pointerup", endDrag);
      stage.addEventListener("pointercancel", endDrag);
      stage.addEventListener("pointerleave", function () {
        if (dragIdx < 0 && hoverHit) { hoverHit = null; render(); }
      });

      /* ================= control scheme =================
         Computer = the original in-scene controls (selector row,
         aim circles, barn-door knobs). Mobile = clean scene, tap
         a fixture or its beam to open the zoomed control modal.
         Default follows the pointer type (coarse -> Mobile); the
         top-row toggle overrides it and the choice persists.   */
      var controlScheme = (function () {
        try {
          var s = localStorage.getItem("fresnel-hero-scheme");
          if (s === "mobile" || s === "computer") return s;
        } catch (e) {}
        return (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
          ? "mobile" : "computer";
      })();
      var modalIdx = -1;   // light the modal controls, -1 = closed
      var schemeComputerBtn = document.getElementById("schemeComputer");
      var schemeMobileBtn = document.getElementById("schemeMobile");
      function applySchemeChrome() {
        var mobile = controlScheme === "mobile";
        document.body.classList.toggle("scheme-mobile", mobile);
        schemeComputerBtn.setAttribute("aria-pressed", controlScheme === "computer" ? "true" : "false");
        schemeMobileBtn.setAttribute("aria-pressed", controlScheme === "mobile" ? "true" : "false");
        // Collapse the selector row's band in Mobile by
        // REDRAWING THE SCENE BAND_H SHORTER: H and FLOOR_Y
        // shrink together with TRUSS_Y / APEX_Y, so the truss,
        // performers, and floor all shift up by the same BAND_H
        // and every relative distance — above all apex->floor,
        // 396 in both schemes — is preserved exactly. (Sliding
        // only the truss up inside the 600-tall scene would
        // stretch apex->floor to 442 and change beam coverage
        // and solvability.) Computer restores the desktop
        // geometry pixel-for-pixel.
        TRUSS_Y = mobile ? TRUSS_Y_MOBILE : TRUSS_Y_DESKTOP;
        APEX_Y = mobile ? APEX_Y_MOBILE : APEX_Y_DESKTOP;
        H = mobile ? H_MOBILE : H_DESKTOP;
        FLOOR_Y = mobile ? FLOOR_Y_MOBILE : FLOOR_Y_DESKTOP;
        // The stage canvas's internal height follows the scene
        // height, so its CSS aspect (width 100%, height auto)
        // shrinks with it; the offscreen light/tint canvases
        // match so their drawImage compositing stays 1:1.
        // Resizing clears a canvas, but render() repaints
        // everything every frame, so nothing is lost.
        if (stage.width !== W || stage.height !== H) { stage.width = W; stage.height = H; }
        if (lightCanvas.width !== W || lightCanvas.height !== H) { lightCanvas.width = W; lightCanvas.height = H; }
        if (tintCanvas.width !== W || tintCanvas.height !== H) { tintCanvas.width = W; tintCanvas.height = H; }
        // The solver's flattened samples are baked from FLOOR_Y;
        // rebuild them in the new coordinate space. All other
        // beam / hit-test / pointer maths reads the globals
        // live, so tap mapping and modal docking follow the new
        // height automatically.
        rebuildFlatSamples();
      }
      function setScheme(s) {
        if (s !== "mobile" && s !== "computer") return;
        controlScheme = s;
        try { localStorage.setItem("fresnel-hero-scheme", s); } catch (e) {}
        closeLightModal();
        applySchemeChrome();
        render();
      }
      schemeComputerBtn.addEventListener("click", function () { setScheme("computer"); });
      schemeMobileBtn.addEventListener("click", function () { setScheme("mobile"); });
      applySchemeChrome();

      /* ================= mobile light modal =================
         A zoomed fixture (1.25x — see LM_SCALE below) with its beam preview, drawn on
         its own canvas from the SAME live light object the scene
         uses — same tilt, doors, color, power, and the same
         occlusion geometry (beamAngles / flapAngle). Every modal
         drag writes straight into that light and calls update(),
         so the real beam sweeps the stage, mixes re-score, and
         the modal preview re-renders in the same frame. No apply
         step, no snapshot.                                     */
      var lightModal = document.getElementById("lightModal");
      var lightModalCard = document.getElementById("lightModalCard");
      var lightModalCtl = document.getElementById("lightModalCtl");
      // NOTE: this variable must NOT be named `lightCanvas` —
      // that name already belongs to the offscreen beam canvas
      // created in the rendering section above (var lightCanvas
      // = document.createElement("canvas"), sized W x H). The
      // two `var`s share one script scope, so reusing the name
      // here overwrote the offscreen reference, and worse,
      // applySchemeChrome() — which resizes the OFFSCREEN canvas
      // to W x H whenever the scheme changes — started resizing
      // THIS modal canvas to 960 x 554/600 instead. The modal
      // drawing only paints its 200 x 148 LM_W x LM_H corner of
      // that oversized buffer, so on screen the fixture shrank
      // into the top-left corner at ~1/5 size, the aim/flap hit
      // maths (mapped to LM_W x LM_H) no longer lined up with
      // anything visible, and the modal controls were unusable.
      // Keeping the modal canvas in its own variable leaves the
      // offscreen canvas (and the performer tinting that draws
      // from it) untouched.
      var lmCanvas = document.getElementById("lightCanvas");
      var lmctx = lmCanvas.getContext("2d");
      // The panel is shrunk to roughly a third of its former
      // size (canvas 300x300 -> 200x148; the power / color
      // buttons keep their 32px size — the panel's 224px width
      // is floored by that button row, not by the fixture).
      // Scale + pivot are fitted to the WORST CASE, not the
      // resting pose, with the same containment rule as before:
      // sampling the whole fixture assembly (can body, yoke,
      // both flaps at every door amount, flap-tip knobs)
      // through every tilt in +/-68 deg gives a bounding region
      // 117 local units wide x 91 tall, centred at local
      // (0, +12.9), with the farthest point 58.5 units from the
      // pivot. At 1.25x that region plus an 11px knob radius
      // spans ~168px of the 200px canvas width; vertically the
      // pivot sits at y=60 so the truss bar drawn across the
      // top (its top chord at local -45, i.e. canvas y ~3.8)
      // clears the canvas top while the assembly's lowest
      // reach (local +58.4 -> canvas y ~144 incl. knob) stays
      // inside the 148px height — the fixture and its controls
      // stay inside the panel at every aim and door position.
      // The beam preview is exempt: it still runs to the edges.
      var LM_W = 200, LM_H = 148, LM_SCALE = 1.25, LM_PIVOT = [100, 60];
      var lmPower = document.getElementById("lmPower");
      var lmDots = [
        document.getElementById("lmDotR"),
        document.getElementById("lmDotG"),
        document.getElementById("lmDotB")
      ];

      // Modal-canvas point <-> fixture-local coords, using the
      // same rotation convention as the scene fixture (rotate by
      // -tilt about the pivot), scaled by LM_SCALE.
      function lmPoint(lx, ly) {
        var L = lights[modalIdx];
        var th = -L.tilt * Math.PI / 180;
        return [
          LM_PIVOT[0] + LM_SCALE * (lx * Math.cos(th) - ly * Math.sin(th)),
          LM_PIVOT[1] + LM_SCALE * (lx * Math.sin(th) + ly * Math.cos(th))
        ];
      }
      function lmLocal(p) {
        var L = lights[modalIdx];
        var th = -L.tilt * Math.PI / 180;
        var dx = (p[0] - LM_PIVOT[0]) / LM_SCALE, dy = (p[1] - LM_PIVOT[1]) / LM_SCALE;
        return [dx * Math.cos(th) + dy * Math.sin(th), -dx * Math.sin(th) + dy * Math.cos(th)];
      }
      function lmTipLocal(side) {
        var L = lights[modalIdx];
        var ang = flapAngle(side, side < 0 ? L.doorL : L.doorR);
        return [side * 13 - Math.sin(ang) * FLAP_LEN, 16 + Math.cos(ang) * FLAP_LEN];
      }
      function lmPointerAngle(side, p) {
        var loc = lmLocal(p);
        var vx = loc[0] - side * 13, vy = loc[1] - 16;
        if (vx * vx + vy * vy < 9) return null;
        return Math.atan2(-vx, vy);
      }

      function drawModalFixture() {
        var L = lights[modalIdx];
        if (!L || !lmctx) return;
        // Self-heal: the modal canvas buffer is always exactly
        // LM_W x LM_H. (Before the lmCanvas rename, a scheme
        // switch could resize it to the stage's W x H — see the
        // note at the lmCanvas declaration.)
        if (lmCanvas.width !== LM_W || lmCanvas.height !== LM_H) {
          lmCanvas.width = LM_W; lmCanvas.height = LM_H;
        }
        var c = lmctx;
        var rgb = CH_RGB[L.color];
        var off = !isPowered(L);
        var lvl = lampLevel(L);
        c.clearRect(0, 0, LM_W, LM_H);
        var bg = c.createLinearGradient(0, 0, 0, LM_H);
        bg.addColorStop(0, "#0b0b10");
        bg.addColorStop(1, "#17130e");
        c.fillStyle = bg;
        c.fillRect(0, 0, LM_W, LM_H);
        // ---- beam preview: the live beam, same polygon shape
        //      (hinge -> tip -> far shadow ray) as beamQuad,
        //      clipped by the modal canvas edge ----
        if (lvl > 0.02) {
          var a = beamAngles(L);
          var lens = lmPoint(0, 17);
          var hingeL = lmPoint(-13, 16), hingeR = lmPoint(13, 16);
          var tipL = lmPoint(lmTipLocal(-1)[0], lmTipLocal(-1)[1]);
          var tipR = lmPoint(lmTipLocal(1)[0], lmTipLocal(1)[1]);
          var farL = [tipL[0] + 460 * Math.sin(a.a1), tipL[1] + 460 * Math.cos(a.a1)];
          var farR = [tipR[0] + 460 * Math.sin(a.a2), tipR[1] + 460 * Math.cos(a.a2)];
          var farX = (farL[0] + farR[0]) / 2, farY = (farL[1] + farR[1]) / 2;
          var g = c.createLinearGradient(lens[0], lens[1], farX, farY);
          g.addColorStop(0, rgba(rgb, 0.5 * lvl));
          g.addColorStop(0.55, rgba(rgb, 0.28 * lvl));
          g.addColorStop(1, rgba(rgb, 0.03 * lvl));
          c.save();
          c.globalCompositeOperation = "lighter";
          c.fillStyle = g;
          c.beginPath();
          c.moveTo(hingeL[0], hingeL[1]);
          c.lineTo(tipL[0], tipL[1]);
          c.lineTo(farL[0], farL[1]);
          c.lineTo(farR[0], farR[1]);
          c.lineTo(tipR[0], tipR[1]);
          c.lineTo(hingeR[0], hingeR[1]);
          c.closePath();
          c.fill();
          c.restore();
        }
        // ---- truss segment + hanger: a bar across the top of
        //      the panel, styled like the scene's truss (two
        //      chords + vertical ticks), so the fixture reads
        //      as mounted rather than floating. It is placed in
        //      the fixture's own local geometry — top chord at
        //      local -45, lower chord at -29..-25, exactly where
        //      the scene's truss sits relative to the hang
        //      point — and a static hanger drops from the bar
        //      to the yoke line, as in drawFixture. The bar
        //      does not rotate; the fixture still pivots from
        //      the same hang point under it. Painted over the
        //      beam and under the fixture, like the scene. ----
        (function () {
          var px = LM_PIVOT[0], py = LM_PIVOT[1];
          var topY = py - 45 * LM_SCALE;
          c.fillStyle = "#1b1b21";
          c.fillRect(0, topY, LM_W, 10 * LM_SCALE);
          c.fillRect(0, py - 29 * LM_SCALE, LM_W, 4 * LM_SCALE);
          c.fillStyle = "#2c2c34";
          for (var tt = 4; tt < LM_W; tt += 26 * LM_SCALE) {
            c.fillRect(tt, topY, Math.max(2, 3 * LM_SCALE), 20 * LM_SCALE);
          }
          c.strokeStyle = off ? "#2b2b31" : "#3a3a42";
          c.lineWidth = Math.max(2, 4 * LM_SCALE);
          c.beginPath();
          c.moveTo(px, py - 30 * LM_SCALE);
          c.lineTo(px, py - 18 * LM_SCALE);
          c.stroke();
        })();
        // ---- zoomed fixture, same drawing as drawFixture at
        //      LM_SCALE, rotated about the pivot ----
        c.save();
        if (off) c.globalAlpha = 0.45;
        c.translate(LM_PIVOT[0], LM_PIVOT[1]);
        c.scale(LM_SCALE, LM_SCALE);
        c.rotate(-L.tilt * Math.PI / 180);
        c.fillStyle = "#26262c";
        [-1, 1].forEach(function (side) {
          var door = side < 0 ? L.doorL : L.doorR;
          var ang = flapAngle(side, door);
          c.save();
          c.translate(side * 13, 16);
          c.rotate(ang);
          c.fillRect(side < 0 ? -3 : 0, 0, 4.5, FLAP_LEN);
          c.restore();
        });
        c.fillStyle = "#222228";
        c.strokeStyle = "#45454f";
        c.lineWidth = 1.5;
        c.beginPath();
        if (c.roundRect) c.roundRect(-15, -22, 30, 40, 6); else c.rect(-15, -22, 30, 40);
        c.fill(); c.stroke();
        c.strokeStyle = "#45454f";
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(-15, -14); c.lineTo(-20, -26);
        c.moveTo(15, -14); c.lineTo(20, -26);
        c.stroke();
        c.fillStyle = "#17171d";
        c.beginPath();
        c.ellipse(0, 17, 12.5, 6.5, 0, 0, 6.2832);
        c.fill();
        if (lvl > 0.02) {
          var lg = c.createRadialGradient(0, 17, 1, 0, 17, 14);
          lg.addColorStop(0, "rgba(255,255,255," + (0.95 * lvl) + ")");
          lg.addColorStop(0.35, rgba(rgb, 0.95 * lvl));
          lg.addColorStop(1, rgba(rgb, 0.55 * lvl));
          c.fillStyle = lg;
          c.beginPath();
          c.ellipse(0, 17, 12.5, 6.5, 0, 0, 6.2832);
          c.fill();
        }
        c.restore();
        // ---- affordances at modal scale: aim circle on the
        //      pivot and a knob on each flap tip, drawn like the
        //      scene's control circles, just bigger ----
        [-1, 1].forEach(function (side) {
          var tl = lmTipLocal(side);
          var tp = lmPoint(tl[0], tl[1]);
          var hot = lmDrag && lmDrag.part === (side < 0 ? "flapL" : "flapR");
          c.save();
          c.beginPath();
          c.arc(tp[0], tp[1], hot ? 13.5 : 11.5, 0, 6.2832);
          c.fillStyle = hot ? "#ffd98a" : "rgba(16,16,20,0.9)";
          c.fill();
          c.lineWidth = 2;
          c.strokeStyle = hot ? "#ffd98a" : "rgba(240,237,230,0.85)";
          c.stroke();
          c.restore();
        });
        (function () {
          var hot = lmDrag && lmDrag.part === "tilt";
          c.save();
          c.beginPath();
          c.arc(LM_PIVOT[0], LM_PIVOT[1], hot ? 17 : 15, 0, 6.2832);
          c.fillStyle = hot ? "#ffd98a" : "rgba(16,16,20,0.92)";
          c.fill();
          c.lineWidth = 2;
          c.strokeStyle = hot ? "#ffd98a" : "rgba(240,237,230,0.9)";
          c.stroke();
          c.beginPath();
          c.arc(LM_PIVOT[0], LM_PIVOT[1], 3.5, 0, 6.2832);
          c.fillStyle = hot ? "#1c1503" : "rgba(240,237,230,0.85)";
          c.fill();
          c.restore();
        })();
      }

      function syncModalCtl() {
        if (modalIdx < 0 || !lights[modalIdx]) return;
        var L = lights[modalIdx];
        var on = isPowered(L);
        lightModalCard.setAttribute("aria-label", "Light " + (modalIdx + 1) + " · " + L.pos + " controls");
        lmPower.setAttribute("aria-pressed", on ? "true" : "false");
        lmPower.setAttribute("aria-label", "Light " + (modalIdx + 1) + " power " + (on ? "on" : "off"));
        lmDots.forEach(function (b) {
          b.setAttribute("aria-pressed", b.getAttribute("data-ch") === L.color ? "true" : "false");
        });
        lightModalCtl.classList.toggle("off", !on);
      }
      lmPower.addEventListener("click", function () {
        if (modalIdx < 0) return;
        togglePower(modalIdx);
        syncModalCtl();
      });
      lmDots.forEach(function (b) {
        b.addEventListener("click", function () {
          if (modalIdx < 0) return;
          lights[modalIdx].color = b.getAttribute("data-ch");
          syncSceneDots();
          syncModalCtl();
          update();
        });
      });

      /* ---- panel positioning: the panel is placed in explicit
              pixels inside the scene (the lightModal element,
              which fills the stage box). Docking sets only the
              INITIAL position on each open; the user can then
              drag the panel anywhere (see the header-drag code
              below), clamped so it always stays fully inside
              the scene. Reopening — for any light — re-docks. */
      function clampCardPos(left, top) {
        var mw = lightModal.clientWidth, mh = lightModal.clientHeight;
        var cw = lightModalCard.offsetWidth, ch = lightModalCard.offsetHeight;
        return [
          Math.max(0, Math.min(Math.max(0, mw - cw), left)),
          Math.max(0, Math.min(Math.max(0, mh - ch), top))
        ];
      }
      function positionModalCard(left, top) {
        var p = clampCardPos(left, top);
        lightModalCard.style.left = p[0] + "px";
        lightModalCard.style.top = p[1] + "px";
        lightModalCard.style.right = "auto";
        lightModalCard.style.transform = "none";
      }
      function openLightModal(i) {
        if (won) return;   // no modal during the win show
        if (!lights[i]) return;
        modalIdx = i;
        selectedIdx = i;
        syncSceneSelection();
        lightModalCard.className = "light-modal-card";
        lightModal.classList.add("open");
        lightModal.setAttribute("aria-hidden", "false");
        syncModalCtl();
        // Initial dock, away from the fixture under control:
        // left-third lights dock right, right-third lights dock
        // left, center lights dock center-low below the truss.
        // (In the Mobile scheme the truss rides higher, and the
        // clamp keeps the panel inside the scene either way.)
        var mw = lightModal.clientWidth, mh = lightModal.clientHeight;
        var cw = lightModalCard.offsetWidth, ch = lightModalCard.offsetHeight;
        var dock = lights[i].x < W / 3 ? "right"
          : lights[i].x > 2 * W / 3 ? "left" : "center";
        var left = dock === "right" ? mw - cw - 8 : dock === "left" ? 8 : (mw - cw) / 2;
        var top = dock === "center" ? mh * 0.29 : 8;
        positionModalCard(left, top);
        render();
      }
      function closeLightModal() {
        if (modalIdx < 0 && !lightModal.classList.contains("open")) return;
        modalIdx = -1;
        lmDrag = null;
        lmPanelDrag = null;
        lightModal.classList.remove("open");
        lightModal.setAttribute("aria-hidden", "true");
      }
      document.getElementById("lightModalClose").addEventListener("click", function () {
        closeLightModal();
        render();
      });
      // Tap outside the panel closes it — but only a CLEAN tap:
      // a press on the backdrop (the modal element itself) that
      // releases within a few pixels of where it started. A
      // press that travels — a drag of the panel, or a swipe
      // across the backdrop — never counts as an outside tap.
      var lmBackdropTap = null;
      lightModal.addEventListener("pointerdown", function (ev) {
        lmBackdropTap = ev.target === lightModal
          ? { x: ev.clientX, y: ev.clientY } : null;
      });
      lightModal.addEventListener("pointerup", function (ev) {
        if (!lmBackdropTap) return;
        var moved = Math.hypot(ev.clientX - lmBackdropTap.x, ev.clientY - lmBackdropTap.y);
        lmBackdropTap = null;
        if (ev.target === lightModal && moved < 8) { closeLightModal(); render(); }
      });
      lightModal.addEventListener("pointercancel", function () { lmBackdropTap = null; });

      /* ---- dragging the panel: grab the header strip (or the
              card's own padding) and move the panel anywhere in
              the scene. The fixture canvas, its aim circle and
              flaps, the close button, and the power/color
              buttons are NOT drag regions — they keep their own
              jobs. Pointer capture keeps the drag smooth even
              when the pointer outruns the panel, and the clamp
              keeps the whole panel inside the scene. ---- */
      var lightModalHead = lightModalCard.querySelector(".light-modal-head");
      var lmPanelDrag = null;   // { startX, startY, startLeft, startTop }
      lightModalCard.addEventListener("pointerdown", function (ev) {
        if (modalIdx < 0) return;
        var onHead = lightModalHead.contains(ev.target);
        var onFrame = ev.target === lightModalCard;
        if (!onHead && !onFrame) return;
        if (ev.target.closest && ev.target.closest("button")) return;   // the close button
        lmPanelDrag = {
          startX: ev.clientX, startY: ev.clientY,
          startLeft: lightModalCard.offsetLeft, startTop: lightModalCard.offsetTop
        };
        lightModalHead.classList.add("dragging");
        lightModalCard.setPointerCapture(ev.pointerId);
        ev.preventDefault();
      });
      lightModalCard.addEventListener("pointermove", function (ev) {
        if (!lmPanelDrag) return;
        positionModalCard(
          lmPanelDrag.startLeft + (ev.clientX - lmPanelDrag.startX),
          lmPanelDrag.startTop + (ev.clientY - lmPanelDrag.startY)
        );
      });
      function lmEndPanelDrag() {
        if (!lmPanelDrag) return;
        lmPanelDrag = null;
        lightModalHead.classList.remove("dragging");
      }
      lightModalCard.addEventListener("pointerup", lmEndPanelDrag);
      lightModalCard.addEventListener("pointercancel", lmEndPanelDrag);
      // If the scene shrinks (rotation / resize) with the panel
      // open, pull it back fully inside the new bounds.
      window.addEventListener("resize", function () {
        if (modalIdx >= 0 && lightModal.classList.contains("open")) {
          positionModalCard(lightModalCard.offsetLeft, lightModalCard.offsetTop);
        }
      });

      // Scene tap in the mobile scheme: fixture taps win; else
      // the beam containing the tap selects its light — nearest
      // fixture when several beams overlap at the tap point.
      function handleMobileTap(ev) {
        var p = stagePos(ev);
        var i, d, best = -1, bestD = Infinity;
        for (i = 0; i < lights.length; i++) {
          d = Math.hypot(p[0] - lights[i].x, p[1] - (APEX_Y - 8));
          if (d < 48 && d < bestD) { bestD = d; best = i; }
        }
        if (best >= 0) { openLightModal(best); return; }
        best = -1; bestD = Infinity;
        for (i = 0; i < lights.length; i++) {
          if (!isPowered(lights[i])) continue;   // dark fixtures throw no beam
          if (pointInBeam(lights[i], p[0], p[1])) {
            var lp = lensPos(lights[i]);
            d = Math.hypot(p[0] - lp[0], p[1] - lp[1]);
            if (d < bestD) { bestD = d; best = i; }
          }
        }
        if (best >= 0) openLightModal(best);
      }

      /* ---- modal dragging: same control language as the
              scene, at modal scale. Aim is a relative drag from
              the center circle; doors are grabbed by tip knob or
              flap and dragged relatively (no first-move snap),
              with the same +/-68 deg tilt clamp and the same
              door travel the scene's flap maths uses. ---- */
      var lmDrag = null;   // { part, startClientX, startTilt, startDoor, startAng }
      function lmPos(ev) {
        var r = lmCanvas.getBoundingClientRect();
        return [
          (ev.clientX - r.left) * (LM_W / r.width),
          (ev.clientY - r.top) * (LM_H / r.height)
        ];
      }
      function lmHit(p) {
        // Generous hit zones at modal scale: the visible aim
        // circle is 15px and the flap knobs 11.5px, but fingers
        // get 44 / 34px target radii and a 20px flap-strip
        // tolerance. The flap tips sit ~72 canvas px from the
        // pivot, so the 44px tilt zone can never swallow a tip;
        // tips are also tested before the strip, and tilt is
        // tested first only near the pivot where no flap
        // segment except the hinge end passes.
        if (Math.hypot(p[0] - LM_PIVOT[0], p[1] - LM_PIVOT[1]) < 44) return "tilt";
        for (var k = 0; k < 2; k++) {
          var side = k === 0 ? -1 : 1;
          var tl = lmTipLocal(side);
          var tp = lmPoint(tl[0], tl[1]);
          var hp = lmPoint(side * 13, 16);
          if (Math.hypot(p[0] - tp[0], p[1] - tp[1]) < 34) return side < 0 ? "flapL" : "flapR";
          if (distToSegment(p[0], p[1], hp, tp) < 20) return side < 0 ? "flapL" : "flapR";
        }
        return null;
      }
      lmCanvas.addEventListener("pointerdown", function (ev) {
        if (modalIdx < 0 || won) return;
        var p = lmPos(ev);
        var part = lmHit(p);
        if (!part) return;
        var L = lights[modalIdx];
        lmDrag = { part: part, startClientX: ev.clientX, startTilt: L.tilt, startDoor: null, startAng: null };
        if (part === "flapL" || part === "flapR") {
          var side = part === "flapL" ? -1 : 1;
          lmDrag.startDoor = side < 0 ? L.doorL : L.doorR;
          var a0 = lmPointerAngle(side, p);
          lmDrag.startAng = a0 === null ? flapAngle(side, lmDrag.startDoor) : a0;
        }
        lmCanvas.classList.add("dragging");
        lmCanvas.setPointerCapture(ev.pointerId);
        drawModalFixture();
        ev.preventDefault();
      });
      lmCanvas.addEventListener("pointermove", function (ev) {
        if (!lmDrag || modalIdx < 0) return;
        var L = lights[modalIdx];
        if (lmDrag.part === "tilt") {
          // Relative drag, ~0.35 deg per screen px — a deliberate
          // sweep at modal scale, same +/-68 deg clamp as the scene.
          L.tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT,
            lmDrag.startTilt + (ev.clientX - lmDrag.startClientX) * 0.35));
        } else {
          var side2 = lmDrag.part === "flapL" ? -1 : 1;
          var ang = lmPointerAngle(side2, lmPos(ev));
          if (ang === null || lmDrag.startAng === null) return;
          var closedAng = Math.asin(13 / FLAP_LEN);
          var door = Math.round(lmDrag.startDoor +
            (ang - lmDrag.startAng) / side2 / (closedAng + BASE_HALF) * 100);
          door = Math.max(0, Math.min(100, door));
          if (side2 < 0) L.doorL = door; else L.doorR = door;
        }
        update();   // live-syncs the scene beam, scoring, and the preview
      });
      function lmEndDrag() {
        if (!lmDrag) return;
        lmDrag = null;
        lmCanvas.classList.remove("dragging");
        if (modalIdx >= 0) drawModalFixture();
      }
      lmCanvas.addEventListener("pointerup", lmEndDrag);
      lmCanvas.addEventListener("pointercancel", lmEndDrag);

      /* ================= go ================= */
      buildSceneCtls();
      newRound();
    