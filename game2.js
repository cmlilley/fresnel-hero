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
         followed by the R/G/B color dots. Power and color are
         ONE coupled state: a light is either ON with exactly
         one color selected, or OFF with no color selected.
         Tapping a dot selects that color AND switches the
         light on; the power button switches off and clears
         the selection. The light's channel is still stored
         under the hood while off, so switching back on with
         the power button restores its last color.           */
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
            selectColor(+b.getAttribute("data-light"), b.getAttribute("data-ch"));
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
      // Select a color for a fixture — and switch it ON with
      // that color. Power and color selection are one coupled
      // state, so picking a dot on a dark light brings it up
      // (its power button flips to the on state); picking a
      // different dot on a lit light just changes its color.
      // Shared by the scene pills and the light modal.
      function selectColor(i, ch) {
        if (won) return;   // rig locked while the show runs
        var L = lights[i];
        if (!L) return;
        L.color = ch;
        L.power = true;
        L.on = true;
        L.level = 1;
        selectedIdx = i;
        syncSceneDots();
        syncPowerStates();
        syncSceneSelection();
        if (modalIdx === i) syncModalCtl();
        update();
      }
      // Toggle one fixture's power. Powering off kills its beam
      // and its contribution to every mix at once, and CLEARS
      // its color selection — the pill shows no dot selected.
      // The stored channel is left untouched under the hood, so
      // powering back on restores the light at full level with
      // its last color, aim, and door settings. Turning every
      // light off is allowed — the stage simply goes all
      // Shadow. Power states persist between rounds.
      function togglePower(i) {
        if (won) return;   // rig locked while the show runs
        var L = lights[i];
        if (!L) return;
        L.power = !isPowered(L);
        L.on = L.power;
        L.level = L.power ? 1 : 0;
        selectedIdx = i;
        syncPowerStates();
        syncSceneDots();
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

      // Reflect each light's selection on its on-stage dots.
      // Selection is coupled to power: a dot reads pressed only
      // while its light is ON (the pressed dot is the lit
      // channel). A powered-off light shows NO dot pressed, even
      // though its channel stays stored underneath for the
      // power-on restore.
      function syncSceneDots() {
        sceneDots.forEach(function (b) {
          var L = lights[+b.getAttribute("data-light")];
          if (L) b.setAttribute("aria-pressed",
            isPowered(L) && b.getAttribute("data-ch") === L.color ? "true" : "false");
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
        roundDealt = true;
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

      /* ================= portrait rotation =================
         On touch devices held in portrait the whole game rotates
         90° clockwise as one unit (see the stylesheet's portrait
         block). This signal mirrors the CSS trigger EXACTLY — the
         same two media features, read from the layout viewport,
         which the transform itself never changes — so the visuals
         and the pointer maths can never disagree about whether
         the game is rotated.
         Rotation geometry (CSS rotate(90deg), y axis pointing
         down): a stage-local vector (dx, dy) lands on screen as
         (-dy, dx) — the stage's right edge points at the phone's
         bottom edge. Inverting about the element's centre gives
         local = (clientDy, -clientDx). And getBoundingClientRect
         returns the rotated element's axis-aligned box, whose
         WIDTH is the element's displayed HEIGHT and vice versa,
         so every rect-based conversion below takes its scale
         from the swapped dimension when rotated. DOM controls
         need no help: they rotate with the wrap and the browser
         hit-tests them natively.                        */
      var ROTATE_MQ = window.matchMedia
        ? window.matchMedia("(orientation: portrait) and (pointer: coarse)") : null;
      var LAND_MQ = window.matchMedia
        ? window.matchMedia("(orientation: landscape) and (pointer: coarse)") : null;
      /* The same condition evaluated from portable signals, for
         engines whose media features don't fire — Chrome on iOS
         is WebKit, where (pointer: coarse) can fail to match on
         a touch handset held in portrait. Touch capability from
         maxTouchPoints / ontouchstart; portrait from the
         window's own dimensions. When it matches, .fh-rotated
         on <html> applies stylesheet rules identical to the
         media-query block, so both paths paint the same game,
         and isRotated() below is true when EITHER path is
         active — the pointer maths, the fit, the modal drag
         axes, and the pill re-assertion all key off that one
         unified state and can never disagree between paths. */
      function jsRotateMatches() {
        var touch = (navigator.maxTouchPoints > 0) || ("ontouchstart" in window);
        return touch && window.innerHeight > window.innerWidth;
      }
      function syncRotateClass() {
        document.documentElement.classList.toggle("fh-rotated", jsRotateMatches());
      }
      function isRotated() {
        return !!((ROTATE_MQ && ROTATE_MQ.matches) ||
          document.documentElement.classList.contains("fh-rotated"));
      }
      /* Landscape fit state, the un-rotated sibling of the
         rotation above: true when EITHER the CSS trigger
         (LAND_MQ) or the JS trigger (.fh-landfit) is active.
         The JS signal mirrors jsRotateMatches — touch from
         maxTouchPoints / ontouchstart, landscape from the
         window's own dimensions — with one extra guard the
         portrait path never needed: the short side must be
         phone-like (<= 520 CSS px). Landscape is a desktop's
         home orientation, so an unguarded touch check would
         fit-shrink touch-capable laptops; phones in landscape
         have a short side of ~430px or less, and larger coarse
         devices (tablets) are already covered by LAND_MQ
         itself, whose (pointer: coarse) test a fine-primary
         laptop never passes. */
      function jsLandMatches() {
        var touch = (navigator.maxTouchPoints > 0) || ("ontouchstart" in window);
        return touch && window.innerWidth > window.innerHeight &&
          Math.min(window.innerWidth, window.innerHeight) <= 520;
      }
      function syncLandClass() {
        document.documentElement.classList.toggle("fh-landfit", jsLandMatches());
      }
      function isLandFit() {
        return !!((LAND_MQ && LAND_MQ.matches) ||
          document.documentElement.classList.contains("fh-landfit"));
      }
      // Either fitted presentation (rotated portrait, or
      // landscape fit) is active.
      function isFitted() {
        return isRotated() || isLandFit();
      }

      var wrapEl = document.querySelector(".wrap");
      var stageFrameEl = document.querySelector(".stage-frame");
      // Size the frame inside the rotated box by UNIFORM SCALE
      // ONLY: the frame keeps its full logical width — the box's
      // long axis, so the top row and pill rows lay out exactly
      // as they do on desktop and never re-wrap — its natural
      // height is measured at that width, and the WHOLE frame
      // (stage + selector rows + chrome) is shrunk by the
      // tighter of the two fit ratios, min(availW / frameW,
      // availH / frameH), so it fits BOTH swapped dimensions of
      // the box with nothing clipped in either direction. The
      // wrap's flex centring plus the frame's centre
      // transform-origin keep the scaled frame centred in the
      // box. (An earlier width-solve that narrowed the frame
      // until its height fit is gone: as the frame narrows the
      // chrome re-wraps TALLER, so the solve traded the stage
      // away and converged to a degenerate ~160px width on a
      // portrait phone — canvas ~142×89 — while the unscaled
      // frame still stood ~612px tall against the ~370px
      // cross-axis. Uniform scale makes the stage exactly as
      // large as the box allows instead.) Every rect-based
      // pointer conversion (stagePos / displayScale / lmPos)
      // reads through the scale automatically; only the panel
      // move-drag, which works in layout pixels, divides it
      // back out.
      function clampModalToScene() {
        // Pull the light modal's panel back inside the (possibly
        // newly sized) scene — the standalone resize listener
        // runs before this fit, against the pre-fit bounds.
        if (typeof modalIdx === "undefined") return;
        if (modalIdx >= 0 && lightModal.classList.contains("open")) {
          positionModalCard(lightModalCard.offsetLeft, lightModalCard.offsetTop);
        }
      }
      // While rotated, the selector pills keep their wide,
      // fixture-column layout (see the stylesheet's portrait
      // block): the phone-width block's `left: auto !important`
      // outranks their inline left, so re-assert each pill's
      // column with important priority; when not rotated, hand
      // the plain inline value back so the narrow unrotated
      // layout's in-flow pill row applies again.
      function setPillLeftPriority(important) {
        if (typeof sceneCtls === "undefined" || typeof lights === "undefined") return;
        for (var i = 0; i < sceneCtls.length; i++) {
          var pct = (lights[i].x / W * 100) + "%";
          if (important) sceneCtls[i].style.setProperty("left", pct, "important");
          else sceneCtls[i].style.setProperty("left", pct);
        }
      }
      // One fit for both fitted presentations. Rotated
      // portrait and coarse landscape share everything except
      // the wrap's own geometry (swapped + rotated vs plain
      // full-viewport), which the stylesheet owns; here the
      // frame is measured at its full logical width — the
      // wrap's content width — and uniformly scaled by
      // min(availW / frameW, availH / frameH) so stage plus
      // chrome fit BOTH axes of whichever box is active,
      // centred by the wrap's flex centring and the frame's
      // centre transform-origin. In landscape on a phone that
      // ratio is height-limited (the 960×600 stage at full
      // width would stand taller than the ~390–430px-tall
      // viewport), so the frame ends up height-filling with
      // side margins — the physical max for the stage's
      // aspect — and the page, locked by the stylesheet while
      // fitted, cannot scroll or overflow.
      // CLEAR PATH (the stale-state fix): the fit sets exactly
      // three pieces of inline state — the frame's width, the
      // frame's transform, and (rotated only) the pills' left
      // priority via setPillLeftPriority — and the not-fitted
      // branch below resets ALL THREE, unconditionally, on
      // every call. The remaining fit state is stylesheet-only
      // and keyed to the triggers themselves (the two media
      // queries and the .fh-rotated / .fh-landfit classes,
      // re-evaluated by refreshRotation on every resize /
      // orientation / trigger change before this runs), so
      // when the device turns and neither trigger matches, no
      // transform, explicit width, pill override, or overflow
      // lock can survive into the plain layout — from either
      // the CSS path or the JS path.
      // Pointer maths under the landscape scale needs no new
      // code: stagePos / displayScale / lmPos all derive from
      // live getBoundingClientRect values, which already
      // include the uniform scale (in the un-rotated branch
      // the rect's width IS the scaled stage width), so gains
      // and hit radii track exactly as they do unscaled and in
      // rotated mode. Only the modal panel drag, which works
      // in layout pixels, divides the scale back out (see its
      // landscape branch below).
      function fitFrame() {
        if (!wrapEl || !stageFrameEl) return;
        if (!isFitted()) {
          stageFrameEl.style.width = "";
          stageFrameEl.style.transform = "";
          setPillLeftPriority(false);
          clampModalToScene();
          return;
        }
        // Pills keep their fixture columns only while rotated
        // (the portrait phone-width reflow is what the override
        // exists to defeat). In landscape the viewport width
        // IS the frame's logical width, so the stylesheet's
        // own pill layout is already correct; hand the plain
        // inline value back so a rotated session's important
        // override never leaks into landscape.
        setPillLeftPriority(isRotated());
        var cs = window.getComputedStyle(wrapEl);
        var availW = wrapEl.clientWidth -
          parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        var availH = wrapEl.clientHeight -
          parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        if (!(availW > 0) || !(availH > 0)) return;
        // Measure the frame at its full logical width with no
        // shrink applied, then scale the whole frame by the
        // tighter of the two ratios so it fits the box on both
        // axes at once — never narrower-for-height, never
        // height-only — and leave it unscaled when it already
        // fits. offsetWidth/offsetHeight ignore transforms, so
        // the measurement is the frame's true layout size.
        stageFrameEl.style.transform = "";
        stageFrameEl.style.width = availW + "px";
        var fw = stageFrameEl.offsetWidth;
        var fh = stageFrameEl.offsetHeight;
        if (fw > 0 && fh > 0) {
          var s = Math.min(availW / fw, availH / fh);
          if (s < 1) {
            stageFrameEl.style.transform = "scale(" + s + ")";
          }
        }
        clampModalToScene();
      }
      // Historical name, kept as the single entry point the
      // scheme switch and the wiring below already call.
      function fitRotatedFrame() { fitFrame(); }

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
        if (isRotated()) {
          // The rect is the rotated canvas's axis-aligned box:
          // its height is the stage's displayed width. Invert
          // the 90° clockwise turn about the box centre (local
          // dx = client dy, local dy = -client dx) and take the
          // scale from the swapped dimension — dragging toward
          // the stage's right edge (the screen's bottom edge)
          // moves the stage x exactly as an unrotated horizontal
          // drag does, at the same per-screen-pixel gain.
          var s = r.height > 0 ? r.height / W : 1;
          var dx = ev.clientX - (r.left + r.width / 2);
          var dy = ev.clientY - (r.top + r.height / 2);
          return [W / 2 + dy / s, H / 2 - dx / s];
        }
        return [
          (ev.clientX - r.left) * (W / r.width),
          (ev.clientY - r.top) * (H / r.height)
        ];
      }
      // Live display scale: screen px per stage unit. All touch
      // geometry below is derived from it, so a control's on-screen
      // grab size stays put as the stage scales down to phone
      // widths instead of shrinking with the canvas. Rotated, the
      // stage's width spans the rect's height, so that is the
      // dimension to read.
      function displayScale() {
        var r = stage.getBoundingClientRect();
        if (isRotated()) return r.height > 0 ? r.height / W : 1;
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
        // Re-derive the layout width for the (possibly fitted)
        // context and the new scheme height: desktop / unfitted
        // reproduces W = 960 exactly; a fitted touch context
        // derives the fluid width from the box at this scheme's
        // height. Slots, fixture and performer positions, beam
        // length, goal-pill and selector-pill positions all
        // follow inside applyLayout.
        applyLayout();
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
        // applyLayout positioned the goal pills BEFORE the
        // canvas resize above (a scheme switch can change H
        // without changing W, in which case applyLayout does
        // not resize the canvas itself): re-centre them against
        // the final canvas height so no pre-resize measurement
        // survives into the new scheme.
        syncLayoutPositions();
      }
      function setScheme(s) {
        if (s !== "mobile" && s !== "computer") return;
        controlScheme = s;
        try { localStorage.setItem("fresnel-hero-scheme", s); } catch (e) {}
        closeLightModal();
        applySchemeChrome();
        fitRotatedFrame();   // the scene height changed with the scheme
        // The fit may have re-sized the frame (hence the canvas)
        // after applySchemeChrome's own positioning pass:
        // re-centre the goal pills against the fitted size.
        syncLayoutPositions();
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
          b.setAttribute("aria-pressed",
            on && b.getAttribute("data-ch") === L.color ? "true" : "false");
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
          selectColor(modalIdx, b.getAttribute("data-ch"));
        });
      });

      /* ---- panel positioning: the panel is placed in explicit
              pixels inside the scene (the lightModal element,
              which fills the stage box). Docking sets only the
              INITIAL position on each open; the user can then
              drag the panel anywhere (see the header-drag code
              below), clamped so it always stays fully inside
              the scene. Reopening — for any light — re-docks. */
      /* ---- proportional panel size (touch layouts) ----
         The panel's layout size stays 224px everywhere, but in
         the touch layouts (a fitted state — rotated portrait or
         landscape fit — or any coarse-pointer context) the card
         is transform-scaled so its ON-SCREEN width holds the
         approved fixed-design proportion: 224px against the
         960-wide scene, ≈23% of the scene's on-screen width,
         in fluid, fit-fallback, and rotated states alike. The
         scale derives from live rects: the stage canvas's
         on-screen width (its rect's long dimension when
         rotated) already includes the frame's fit scale, and
         the panel shares that frame, so dividing the target
         on-screen width by the panel's current on-screen width
         (layout width × screen-px-per-layout-px) gives the
         extra scale to apply. Scaling the whole card scales
         the fixture canvas with it — the canvas's internal
         drawing (LM_W × LM_H at LM_SCALE, fitted so the
         fixture and its controls stay inside at every tilt
         and door position) is untouched, so the fixture and
         its beam preview stay contained exactly as at full
         size, and every rect-based pointer conversion inside
         the modal (lmPos, the panel drag) reads the scaled
         rects live and stays correct. The scale is floored at
         0.6 so the controls' 48px tap areas never drop below
         ~29 layout-scaled px — no smaller than they
         effectively were under the old fit build's uniform
         shrink — and capped at 1: on desktop / fine-pointer
         the scale is exactly 1 and the panel keeps today's
         224px presentation. Docking and clamping below work
         in the SCALED size (scaledCardSize), so the painted
         panel is what stays inside the scene. */
      var COARSE_MQ = window.matchMedia
        ? window.matchMedia("(pointer: coarse)") : null;
      var lmScale = 1;   // extra scale currently applied to the panel
      function modalScale() {
        if (!isFitted() && !(COARSE_MQ && COARSE_MQ.matches)) return 1;
        var r = stage.getBoundingClientRect();
        var stageScreen = isRotated() ? r.height : r.width;
        var layoutW = stage.offsetWidth || lightModal.clientWidth;
        var cardW = lightModalCard.offsetWidth;
        if (!(stageScreen > 0) || !(layoutW > 0) || !(cardW > 0)) return 1;
        var frameScale = stageScreen / layoutW;   // screen px per layout px
        var s = (224 / 960 * stageScreen) / (cardW * frameScale);
        return Math.max(0.6, Math.min(1, s));
      }
      function scaledCardSize() {
        return [
          lightModalCard.offsetWidth * lmScale,
          lightModalCard.offsetHeight * lmScale
        ];
      }
      function clampCardPos(left, top) {
        var mw = lightModal.clientWidth, mh = lightModal.clientHeight;
        var size = scaledCardSize();
        var cw = size[0], ch = size[1];
        return [
          Math.max(0, Math.min(Math.max(0, mw - cw), left)),
          Math.max(0, Math.min(Math.max(0, mh - ch), top))
        ];
      }
      function positionModalCard(left, top) {
        // Recompute the scale on every positioning pass, so a
        // layout / fit change while the panel is open (the
        // resize listener and fitFrame's clamp both re-enter
        // here) rescales and re-clamps it in the new size.
        lmScale = modalScale();
        var p = clampCardPos(left, top);
        lightModalCard.style.left = p[0] + "px";
        lightModalCard.style.top = p[1] + "px";
        lightModalCard.style.right = "auto";
        lightModalCard.style.transform = lmScale === 1 ? "none" : "scale(" + lmScale + ")";
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
        // Initial dock by truss order (left to right):
        // lights 1–4 start docked on the RIGHT side of the
        // scene, lights 5–7 on the LEFT — in both cases away
        // from the fixture under control. There is no
        // center-low case. This is starting placement only:
        // the panel stays draggable afterward, and the clamp
        // inside positionModalCard works in the panel's
        // scaled size, so it lands fully inside the scene in
        // every layout state. Vertical anchoring is the same
        // 8px top margin the side docks have always used.
        lmScale = modalScale();
        var mw = lightModal.clientWidth;
        var cw = scaledCardSize()[0];
        var left = i < 4 ? mw - cw - 8 : 8;
        positionModalCard(left, 8);
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
        var dx = ev.clientX - lmPanelDrag.startX;
        var dy = ev.clientY - lmPanelDrag.startY;
        if (isRotated()) {
          // The panel's left/top live in the scene's unrotated
          // local frame while the finger moves in the rotated
          // screen frame: rotate the delta into the local frame
          // (local dx = screen dy, local dy = -screen dx) so the
          // panel tracks the finger exactly, and divide out the
          // modal's on-screen scale — the rotated fit may have
          // shrunk the frame (see fitRotatedFrame) — measured
          // from the modal's own rect, whose height is its local
          // width in screen px. The clamp inside
          // positionModalCard works in local coords as before.
          var mr = lightModal.getBoundingClientRect();
          var k = mr.height > 0 && lightModal.clientWidth > 0
            ? mr.height / lightModal.clientWidth : 1;
          positionModalCard(
            lmPanelDrag.startLeft + dy / k,
            lmPanelDrag.startTop - dx / k
          );
        } else if (isLandFit()) {
          // Un-rotated, but the landscape fit may have shrunk
          // the frame: the panel's left/top live in layout
          // pixels while the finger moves in screen pixels, so
          // divide out the modal's on-screen scale — its rect
          // width (which includes the frame's uniform scale)
          // over its layout width — and the panel tracks the
          // finger exactly, as in the rotated branch.
          var mr2 = lightModal.getBoundingClientRect();
          var k2 = mr2.width > 0 && lightModal.clientWidth > 0
            ? mr2.width / lightModal.clientWidth : 1;
          positionModalCard(
            lmPanelDrag.startLeft + dx / k2,
            lmPanelDrag.startTop + dy / k2
          );
        } else {
          positionModalCard(
            lmPanelDrag.startLeft + dx,
            lmPanelDrag.startTop + dy
          );
        }
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

      // Fixture tap radius in stage units, derived from the
      // live display scale (~44 screen px) with the legacy
      // 48-unit radius as the floor — at a fluid width the
      // stage units shrink on screen, and the tap target
      // must not shrink with them. Shared by handleMobileTap
      // (the hit test) and drawSceneControls (the bright
      // selected-state ring drawn at exactly this radius), so
      // the selected ring always shows the true hit area.
      function mobileTapRadius() {
        return Math.max(48, 44 / Math.max(0.2, displayScale()));
      }

      // Scene tap in the mobile scheme: fixture taps win; else
      // the beam containing the tap selects its light — nearest
      // fixture when several beams overlap at the tap point.
      function handleMobileTap(ev) {
        var p = stagePos(ev);
        var i, d, best = -1, bestD = Infinity;
        var tapR = mobileTapRadius();
        for (i = 0; i < lights.length; i++) {
          d = Math.hypot(p[0] - lights[i].x, p[1] - (APEX_Y - 8));
          if (d < tapR && d < bestD) { bestD = d; best = i; }
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
      var lmDrag = null;   // { part, startClientX, startClientY, startTilt, startDoor, startAng }
      function lmPos(ev) {
        var r = lmCanvas.getBoundingClientRect();
        if (isRotated()) {
          // Same bounding-box trap as the main canvas: read the
          // scale from the swapped dimension and invert the 90°
          // turn about the box centre.
          var s = r.height > 0 ? r.height / LM_W : 1;
          var dx = ev.clientX - (r.left + r.width / 2);
          var dy = ev.clientY - (r.top + r.height / 2);
          return [LM_W / 2 + dy / s, LM_H / 2 - dx / s];
        }
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
        lmDrag = { part: part, startClientX: ev.clientX, startClientY: ev.clientY, startTilt: L.tilt, startDoor: null, startAng: null };
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
          // Rotated, the fixture's local horizontal axis runs down
          // the screen, so the same per-screen-pixel gain reads the
          // client Y travel instead: dragging toward the fixture's
          // right (the screen's bottom edge) tilts it right,
          // exactly as the main stage's aim drag behaves.
          var travel = isRotated()
            ? ev.clientY - lmDrag.startClientY
            : ev.clientX - lmDrag.startClientX;
          L.tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT,
            lmDrag.startTilt + travel * 0.35));
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

      /* ================= rotation + landscape fit: wiring =================
         Recompute the fitted state whenever the viewport or
         any trigger changes: refreshRotation re-evaluates BOTH
         JS triggers (syncRotateClass, syncLandClass) and then
         refits, on the same events for every path — resize,
         orientationchange, both media queries' own change
         events, and once at load below. Media queries read the
         layout viewport and the JS paths read window
         dimensions, so these events — never the transform —
         drive the state. Turning the device therefore settles
         deterministically in both directions: portrait ->
         landscape drops .fh-rotated (and the portrait media
         query), raises the landscape state, and fitFrame
         re-measures and re-scales for the landscape box;
         landscape -> portrait does the reverse; and a state
         with neither trigger active runs fitFrame's clear
         path, which resets every inline style the fit ever
         set (frame width, frame transform, pill left
         priority) while the stylesheet locks keyed to the
         triggers fall away with them — no leftover scale or
         offset can persist past the turn.                  */
      function refreshRotation() {
        syncRotateClass();
        syncLandClass();
        // Re-derive the layout for the new fitted state BEFORE
        // fitting: an orientation flip or a resize into a new
        // aspect re-anchors slots, performers, beams, scoring,
        // and the solver to the new box (applyLayout also
        // schedules the solver's winnability re-verification
        // of the in-progress round), then fitFrame measures
        // the re-laid-out frame, and a changed layout re-renders.
        var layoutChanged = applyLayout();
        fitFrame();
        // Re-centre the goal pills against the fitted frame's
        // final measurements (fitFrame can change the frame's
        // layout width — hence the canvas's displayed height —
        // after applyLayout's positioning pass ran).
        syncLayoutPositions();
        if (layoutChanged && typeof render === "function") render();
      }
      window.addEventListener("resize", refreshRotation);
      window.addEventListener("orientationchange", refreshRotation);
      if (ROTATE_MQ) {
        if (ROTATE_MQ.addEventListener) ROTATE_MQ.addEventListener("change", refreshRotation);
        else if (ROTATE_MQ.addListener) ROTATE_MQ.addListener(refreshRotation);
      }
      if (LAND_MQ) {
        if (LAND_MQ.addEventListener) LAND_MQ.addEventListener("change", refreshRotation);
        else if (LAND_MQ.addListener) LAND_MQ.addListener(refreshRotation);
      }
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(refreshRotation);

      /* ================= go ================= */
      buildSceneCtls();
      newRound();
      refreshRotation();
    