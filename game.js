
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

      /* ================= parameterized layout (fluid stage) =================
         ONE layout derivation owns the scene's logical size and
         every anchored quantity. On desktop / fine-pointer (and
         in every non-fitted presentation) it reproduces today's
         fixed numbers exactly: W = 960, slots at the 140-step
         series 60..900, performer centres at 193 / 480 / 767,
         BEAM_LEN 1250. In the touch fitted contexts (rotated
         portrait box, landscape fit box) the layout goes FLUID:
         the logical width takes the aspect of the available
         stage box, so the stage genuinely fills the viewport
         with playable space — no letterbox, no distortion, no
         cropping. The logical HEIGHT stays the scheme's base
         height (600 Computer / 554 Mobile), so every vertical
         relationship (truss -> apex -> floor throw, performer
         scale, sprite proportions) is exactly today's, and only
         the width extends: slots and performers spread with it.
         Everything — drawing, beam polygons, barn-door
         occlusion, per-pixel scoring, pointer hit-testing and
         drag gains, modal docking, and the round solver — reads
         these same globals (W, SLOTS, chars[].x, BEAM_LEN,
         FLOOR_Y, APEX_Y, TRUSS_Y) live, so re-deriving the
         layout re-anchors the whole game at once. The fluid
         aspect is clamped to a playable window (1.25:1 to
         2.75:1); outside it the nearest clamped layout is used
         and fitFrame's fit-within + the background bleed dress
         the remainder, as before.                        */
      var ASPECT_MIN = 1.25, ASPECT_MAX = 2.75;
      var LAYOUT_FLUID = false;
      var layoutAppliedW = 0;      // W at the last applyLayout (0 = never)
      var roundDealt = false;      // true once newRound has dealt a round
      var layoutVerifyTimer = null;
      // Performer centres as fractions of W: today 193/960,
      // 480/960, 767/960 — the fractions keep the trio spread
      // proportionally at any fluid width, and at W = 960 they
      // reproduce 118 / 405 / 692 (centre minus CHAR_W/2) exactly.
      var CHAR_CENTER_FRAC = [193 / 960, 0.5, 767 / 960];
      // The CSS-px box the stage canvas can occupy inside the
      // fitted wrap: wrap content box minus the stage frame's
      // own padding (10px a side), the in-scene head's height,
      // and the stage box's top margin. Null when the fitted
      // wrap is not measurable yet.
      function fluidStageBox() {
        if (typeof wrapEl === "undefined" || !wrapEl) return null;
        var cs = window.getComputedStyle(wrapEl);
        var availW = wrapEl.clientWidth -
          parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        var availH = wrapEl.clientHeight -
          parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        if (!(availW > 0) || !(availH > 0)) return null;
        var head = document.querySelector(".scene-head");
        var headH = head ? head.offsetHeight : 40;
        return { w: availW - 20, h: availH - 20 - headH - 10 };
      }
      function computeLayoutW() {
        if (typeof isFitted !== "function" || !isFitted()) {
          return { w: 960, fluid: false };
        }
        var box = fluidStageBox();
        if (!box || !(box.w > 0) || !(box.h > 0)) return { w: 960, fluid: false };
        var aspect = box.w / box.h;
        var clamped = Math.max(ASPECT_MIN, Math.min(ASPECT_MAX, aspect));
        // Logical height stays the scheme base (H is already
        // set for the scheme by applySchemeChrome / page load),
        // so the width that carries the box's aspect is H*aspect.
        return { w: Math.max(320, Math.round(H * clamped)), fluid: true };
      }
      // Re-derive the layout and re-anchor everything that is
      // placed from it: slot series, fixture x positions,
      // performer x positions, beam length, and the DOM
      // positions (goal pills, selector pills) that are baked
      // from stage percentages. Returns true when the logical
      // width actually changed. Canvas resizing and the solver
      // sample rebuild are the caller's job (applySchemeChrome
      // owns them on scheme switches; refreshRotation re-enters
      // applySchemeChrome's geometry path via fit + render and
      // the canvas-size sync inside relayoutAfterFit below).
      function applyLayout() {
        var target = computeLayoutW();
        var changed = target.w !== W || target.fluid !== LAYOUT_FLUID;
        W = target.w;
        LAYOUT_FLUID = target.fluid;
        // Beam length must reach past the farthest corner of
        // the CURRENT box at any tilt: the stage diagonal plus
        // margin. Desktop keeps today's exact 1250.
        BEAM_LEN = LAYOUT_FLUID
          ? Math.max(1250, Math.ceil(Math.hypot(W, H) * 1.12))
          : 1250;
        // Seven hang points, one equal-interval series across
        // the width: step 140 at W = 960, symmetric about W/2.
        var step = W * 140 / 960;
        for (var i = 0; i < SLOTS.length; i++) SLOTS[i] = W / 2 + (i - 3) * step;
        if (typeof lights !== "undefined") {
          lights.forEach(function (L) { L.x = SLOTS[L.slot]; });
        }
        if (typeof chars !== "undefined") {
          chars.forEach(function (ch, ci) {
            ch.x = CHAR_CENTER_FRAC[ci] * W - CHAR_W / 2;
          });
        }
        syncLayoutPositions();
        if (changed) {
          var firstApply = layoutAppliedW === 0;
          layoutAppliedW = W;
          // The canvases and the solver's flattened samples are
          // baked from the layout: resize + rebuild them in the
          // new coordinate space (applySchemeChrome does the
          // same on its own path; this covers re-layouts driven
          // by rotation / resize, where no scheme switch runs).
          if (typeof stage !== "undefined" && stage) {
            if (stage.width !== W || stage.height !== H) { stage.width = W; stage.height = H; }
            if (lightCanvas.width !== W || lightCanvas.height !== H) { lightCanvas.width = W; lightCanvas.height = H; }
            if (tintCanvas.width !== W || tintCanvas.height !== H) { tintCanvas.width = W; tintCanvas.height = H; }
            if (typeof rebuildFlatSamples === "function") rebuildFlatSamples();
          }
          // A re-layout mid-round keeps the round if it can:
          // the solver re-verifies the CURRENT targets against
          // the new geometry (debounced, in scheduleLayoutVerify)
          // and only a round that is no longer winnable is
          // re-dealt — targets only, rig state untouched.
          if (!firstApply) scheduleLayoutVerify();
        }
        return changed;
      }
      // DOM positions baked from stage percentages (goal pills
      // under their performers, selector pills over their
      // fixtures) follow the layout.
      function syncLayoutPositions() {
        if (typeof goalCards !== "undefined" && typeof chars !== "undefined") {
          goalCards.forEach(function (ui, i) {
            if (chars[i]) ui.card.style.left = ((chars[i].x + CHAR_W / 2) / W * 100) + "%";
          });
        }
        if (typeof sceneCtls !== "undefined" && typeof lights !== "undefined") {
          sceneCtls.forEach(function (el, i) {
            if (lights[i]) el.style.left = (lights[i].x / W * 100) + "%";
          });
        }
      }
      // After ANY layout change the dealt round must remain
      // provably winnable under the new geometry. Debounced so
      // a stream of resize events verifies once, when it
      // settles. Light states (power / color / tilt / doors)
      // are never touched here; a re-deal swaps targets only.
      function scheduleLayoutVerify() {
        if (!roundDealt || won) return;
        if (layoutVerifyTimer) clearTimeout(layoutVerifyTimer);
        layoutVerifyTimer = setTimeout(function () {
          layoutVerifyTimer = null;
          if (!roundDealt || won) return;
          if (!currentTargetsWinnable()) redealTargetsOnly();
        }, 300);
      }
      // Can any witness rig the solver can construct meet the
      // current targets under the current layout? Search on the
      // half-density samples (with the deal margin shaved), and
      // confirm a candidate at full density — the percentages
      // the game itself computes — before keeping the round.
      function currentTargetsWinnable() {
        var dealt = chars.map(function (ch) {
          return ch.targets.map(function (t) { return { bits: t.bits, goal: t.goal }; });
        });
        for (var a = 0; a < 160; a++) {
          var rig = randomWitnessRig();
          var coarsePcts = rigPercents(rig, true);
          var near = dealt.every(function (list, ci) {
            return list.every(function (t) { return coarsePcts[ci][t.bits] >= t.goal - 1; });
          });
          if (near && verifyDeal(dealt, rigPercents(rig))) {
            solutionRig = rig;
            return true;
          }
        }
        return false;
      }
      // Re-deal targets (same difficulty) against the current
      // layout WITHOUT touching the rig: the player's power,
      // color, tilt, and door states all persist, exactly as
      // they do across a re-layout that keeps its round. The
      // instant-win guard runs against the player's CURRENT
      // rig (not a reset one): a deal the standing rig already
      // meets is re-dealt, same as newRound's guard.
      function redealTargetsOnly() {
        var dealt = null;
        for (var attempt = 0; attempt < 50; attempt++) {
          dealt = solveRound();
          var curRig = lights.map(function (L) {
            return {
              x: L.x, color: L.color, tilt: L.tilt,
              doorL: L.doorL, doorR: L.doorR, power: isPowered(L)
            };
          });
          if (!verifyDeal(dealt, rigPercents(curRig))) break;
        }
        chars.forEach(function (ch, i) {
          ch.targets = dealt[i].map(function (t) {
            return { bits: t.bits, goal: t.goal, now: 0 };
          });
        });
        buildGoalRows();
        update();
      }

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
        for (var i = 0; i < 6; i++) ctx.fillRect((28 + i * 156) * W / 960, FLOOR_Y - 376, 2, 346);
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
          ctx.moveTo(W / 2 - 218 * W / 960, FLOOR_Y - 220);
          ctx.lineTo(W / 2 + 218 * W / 960, FLOOR_Y - 220);
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

