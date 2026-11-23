(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  // Palette matching Sunrise-Sunset 3-tier accessible standard
  const COLORS = {
    toss: "#D95F38",
    moderate: "#D49B4B",
    clear: "#112E51",
    tread: "#2B333C",
    stairFill: "#ECE6DC",
    grid: "#E5DFD5",
    axis: "#CFC8BC",
    inkDark: "#1F2429",
    inkMid: "#4A5058",
    inkMuted: "#777D84",
    leader: "#9C948A",
    staggerTick: "#B5AEA4",
    paper: "#FAF8F5"
  };

  // Exact SVG plot geometry inside viewBox="0 0 1201 488"
  const LAYOUT = {
    width: 1201,
    height: 488,
    left: 88,
    right: 1162,
    top: 20,
    bottom: 432
  };

  const state = {
    data: [],
    activeTier: null
  };

  function el(tag, attrs, parent) {
    const node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        node.setAttribute(k, String(attrs[k]));
      });
    }
    if (parent) {
      parent.appendChild(node);
    }
    return node;
  }

  function xScale(stepPos, n) {
    return LAYOUT.left + (stepPos / n) * (LAYOUT.right - LAYOUT.left);
  }

  function yScale(score) {
    return LAYOUT.bottom - (score / 100) * (LAYOUT.bottom - LAYOUT.top);
  }

  function getTierColor(tier) {
    return COLORS[tier] || COLORS.clear;
  }

  function tierLabel(tier) {
    if (tier === "clear") return "Clear Consensus (80% to 100%)";
    if (tier === "moderate") return "Moderate Consensus (60% to 79%)";
    return "Coin Toss Plateau (50% to 59%)";
  }

  function formatPct(val) {
    return Number(val).toFixed(1) + "%";
  }

  function showLoadError(msg) {
    const box = document.getElementById("load-status");
    if (!box) return;
    box.textContent = msg;
    box.hidden = false;
  }

  // =========================================================================
  // Tooltip Positioning & Rendering (Narrative Sentences, Zero Command UI)
  // =========================================================================
  function getTooltipElements() {
    return {
      stage: document.getElementById("chart-stage"),
      tooltip: document.getElementById("tooltip")
    };
  }

  function positionTooltip(clientX, clientY) {
    const { stage, tooltip } = getTooltipElements();
    if (!stage || !tooltip) return;

    const stageRect = stage.getBoundingClientRect();
    const ttWidth = tooltip.offsetWidth || 304;
    const ttHeight = tooltip.offsetHeight || 160;
    const pad = 14;

    let relX = clientX - stageRect.left + 16;
    let relY = clientY - stageRect.top - ttHeight / 2;

    if (relX + ttWidth > stageRect.width - pad) {
      relX = clientX - stageRect.left - ttWidth - 16;
    }
    if (relX < pad) {
      relX = pad;
    }
    if (relY < 8) {
      relY = 8;
    }
    if (relY + ttHeight > stageRect.height - 8) {
      relY = stageRect.height - ttHeight - 8;
    }

    tooltip.style.left = Math.round(relX) + "px";
    tooltip.style.top = Math.round(relY) + "px";
  }

  function positionTooltipAtSvgPoint(svgX, svgY) {
    const svg = document.getElementById("staircase-svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = rect.width / LAYOUT.width;
    const scaleY = rect.height / LAYOUT.height;
    positionTooltip(rect.left + svgX * scaleX, rect.top + svgY * scaleY);
  }

  function showStepTooltip(rec, evt, anchorSvgX, anchorSvgY) {
    const { tooltip } = getTooltipElements();
    if (!tooltip || !rec.next_term) return;

    const repeatText =
      rec.next_repeat_n > 0
        ? "<span><strong>Repeat flips:</strong> " +
          rec.next_repeat_flips +
          " / " +
          rec.next_repeat_n +
          " (" +
          formatPct(rec.next_repeat_flip_pct) +
          ")</span>"
        : "";

    tooltip.setAttribute("data-tier", rec.next_tier);
    tooltip.innerHTML =
      '<p class="tt-kicker">' +
      tierLabel(rec.next_tier) +
      "</p>" +
      '<h3 class="tt-title">' +
      rec.term +
      " to " +
      rec.next_term +
      "</h3>" +
      '<p class="tt-body">' +
      rec.next_note +
      "</p>" +
      '<div class="tt-stats">' +
      "<span><strong>Agreement:</strong> " +
      formatPct(rec.next_agree_pct) +
      "</span>" +
      "<span><strong>Index jump:</strong> +" +
      Number(rec.index_gap).toFixed(1) +
      " pts</span>" +
      "<span><strong>Matchups:</strong> n = " +
      rec.next_n +
      "</span>" +
      repeatText +
      "</div>";

    tooltip.classList.add("is-visible");
    tooltip.setAttribute("aria-hidden", "false");

    if (evt && typeof evt.clientX === "number" && evt.clientX > 0) {
      positionTooltip(evt.clientX, evt.clientY);
    } else {
      positionTooltipAtSvgPoint(anchorSvgX, anchorSvgY);
    }
  }

  function showPhraseTooltip(rec, evt, anchorSvgX, anchorSvgY) {
    const { tooltip } = getTooltipElements();
    if (!tooltip) return;

    const rivalLines = (rec.closest_rivals || [])
      .slice(0, 2)
      .map(function (rv) {
        return (
          rv.opponent +
          " (" +
          formatPct(rv.agree_pct) +
          " consensus, n = " +
          rv.n +
          ")"
        );
      })
      .join("; ");

    const claritySummary =
      rec.close_rivals_lt65 === 0
        ? "No rival phrase comes within 65% consensus of this term."
        : rec.close_rivals_lt65 === 1
        ? "One neighboring phrase sits inside the 65% confusion zone."
        : rec.close_rivals_lt65 +
          " neighboring phrases sit inside the 65% confusion zone.";

    tooltip.setAttribute("data-tier", "phrase");
    tooltip.innerHTML =
      '<p class="tt-kicker">Rank #' +
      rec.rank +
      " of 19 Phrases</p>" +
      '<h3 class="tt-title">' +
      rec.term +
      "</h3>" +
      '<p class="tt-body">Sits at <strong>' +
      Number(rec.bt_index).toFixed(1) +
      "</strong> on the 0 to 100 perceived probability index, winning <strong>" +
      formatPct(rec.win_rate) +
      "</strong> of all " +
      Number(rec.total_matchups).toLocaleString() +
      " pairwise comparisons. " +
      claritySummary +
      "</p>" +
      '<div class="tt-rivals"><strong>Closest matchups:</strong> ' +
      rivalLines +
      "</div>";

    tooltip.classList.add("is-visible");
    tooltip.setAttribute("aria-hidden", "false");

    if (evt && typeof evt.clientX === "number" && evt.clientX > 0) {
      positionTooltip(evt.clientX, evt.clientY);
    } else {
      positionTooltipAtSvgPoint(anchorSvgX, anchorSvgY);
    }
  }

  function hideTooltip() {
    const { tooltip } = getTooltipElements();
    if (!tooltip) return;
    tooltip.classList.remove("is-visible");
    tooltip.setAttribute("aria-hidden", "true");
  }

  // =========================================================================
  // Legend Tier Filter Logic
  // =========================================================================
  function applyTierHighlight() {
    const pillsWrap = document.getElementById("legend-controls");
    const pills = document.querySelectorAll(".legend-pill");
    const risers = document.querySelectorAll(".riser-group");

    if (pillsWrap) {
      pillsWrap.classList.toggle("has-active", Boolean(state.activeTier));
    }

    pills.forEach(function (btn) {
      const isActive = btn.getAttribute("data-tier") === state.activeTier;
      btn.setAttribute("aria-pressed", String(isActive));
    });

    risers.forEach(function (g) {
      const tier = g.getAttribute("data-tier");
      const dimmed = Boolean(state.activeTier) && tier !== state.activeTier;
      g.classList.toggle("is-dimmed", dimmed);
    });
  }

  function bindLegendControls() {
    const pills = document.querySelectorAll(".legend-pill");
    pills.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const tier = btn.getAttribute("data-tier");
        state.activeTier = state.activeTier === tier ? null : tier;
        applyTierHighlight();
      });
    });

    document.addEventListener("keydown", function (evt) {
      if (evt.key === "Escape" && state.activeTier) {
        state.activeTier = null;
        applyTierHighlight();
        hideTooltip();
      }
    });
  }

  // =========================================================================
  // Draw Editorial Callout Helper (Desktop SVG Space)
  // =========================================================================
  function drawCallout(parent, cfg) {
    const g = el("g", { class: "editorial-callout" }, parent);

    const heading = el(
      "text",
      {
        x: cfg.x,
        y: cfg.y,
        fill: cfg.titleColor,
        "font-size": "11.2",
        "font-weight": "700",
        "letter-spacing": "0.35"
      },
      g
    );
    heading.textContent = cfg.title;

    cfg.lines.forEach(function (line, idx) {
      const t = el(
        "text",
        {
          x: cfg.x,
          y: cfg.y + 15.5 + idx * 14.5,
          fill: COLORS.inkMid,
          "font-size": "10.3",
          "font-weight": "400"
        },
        g
      );
      t.textContent = line;
    });

    if (cfg.path) {
      el(
        "path",
        {
          d: cfg.path,
          fill: "none",
          stroke: COLORS.leader,
          "stroke-width": "1.05",
          "marker-end": "url(#callout-arrow)"
        },
        g
      );
    }
  }

  // =========================================================================
  // Main SVG Render Function
  // =========================================================================
  function renderStaircase(data) {
    const svg = document.getElementById("staircase-svg");
    if (!svg) return;
    svg.innerHTML = "";

    const n = data.length;

    // 1. Defs: clean subtle arrowhead marker
    const defs = el("defs", null, svg);
    const marker = el(
      "marker",
      {
        id: "callout-arrow",
        viewBox: "0 0 10 10",
        refX: "8",
        refY: "5",
        markerWidth: "6",
        markerHeight: "6",
        orient: "auto-start-reverse"
      },
      defs
    );
    el(
      "path",
      {
        d: "M 1.5 1.5 L 8.5 5 L 1.5 8.5",
        fill: "none",
        stroke: COLORS.leader,
        "stroke-width": "1.5",
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      },
      marker
    );

    // 2. Y-Axis, Hairline Guides, and Rotated Axis Title
    const gridLayer = el("g", { class: "grid-layer" }, svg);

    el(
      "line",
      {
        x1: LAYOUT.left,
        y1: yScale(100),
        x2: LAYOUT.left,
        y2: yScale(0),
        stroke: COLORS.axis,
        "stroke-width": "1"
      },
      gridLayer
    );

    [0, 25, 50, 75, 100].forEach(function (tick) {
      const yy = yScale(tick);
      el(
        "line",
        {
          x1: LAYOUT.left,
          y1: yy,
          x2: LAYOUT.right + 12,
          y2: yy,
          stroke: COLORS.grid,
          "stroke-width": tick === 0 ? "1.1" : "0.9",
          "stroke-dasharray": tick > 0 ? "4 3" : "none"
        },
        gridLayer
      );
      el(
        "line",
        {
          x1: LAYOUT.left - 5,
          y1: yy,
          x2: LAYOUT.left,
          y2: yy,
          stroke: COLORS.axis,
          "stroke-width": "1"
        },
        gridLayer
      );
      const lbl = el(
        "text",
        {
          x: LAYOUT.left - 11,
          y: yy + 3.5,
          fill: COLORS.inkMuted,
          "font-size": "10.6",
          "font-weight": "400",
          "text-anchor": "end"
        },
        gridLayer
      );
      lbl.textContent = String(tick);
    });

    const axisTitle = el(
      "text",
      {
        x: 28,
        y: (yScale(100) + yScale(0)) / 2,
        fill: COLORS.inkMuted,
        "font-size": "9.6",
        "font-weight": "600",
        "letter-spacing": "0.65",
        "text-anchor": "middle",
        transform: "rotate(-90 28 " + (yScale(100) + yScale(0)) / 2 + ")"
      },
      gridLayer
    );
    axisTitle.textContent = "PERCEIVED PROBABILITY INDEX (0 TO 100, BRADLEY-TERRY SCALE)";

    // 3. Monotonic Shaded Staircase Silhouette
    const shapeLayer = el("g", { class: "staircase-shape-layer" }, svg);
    let polyPts = [xScale(0, n).toFixed(1) + "," + yScale(0).toFixed(1)];
    data.forEach(function (d, k) {
      const yy = yScale(d.bt_index).toFixed(1);
      polyPts.push(xScale(k, n).toFixed(1) + "," + yy);
      polyPts.push(xScale(k + 1, n).toFixed(1) + "," + yy);
    });
    polyPts.push(xScale(n, n).toFixed(1) + "," + yScale(0).toFixed(1));

    el(
      "polygon",
      {
        points: polyPts.join(" "),
        fill: COLORS.stairFill,
        "fill-opacity": "0.85"
      },
      shapeLayer
    );

    // Subtle coral washes on the three coin-toss plateau bands
    [
      { x0: 2, x1: 7, yLo: 11.8, yHi: 26.2 },
      { x0: 7, x1: 9, yLo: 36.2, yHi: 42.0 },
      { x0: 13, x1: 15, yLo: 62.2, yHi: 68.5 }
    ].forEach(function (band) {
      const rx = xScale(band.x0, n);
      const rw = xScale(band.x1, n) - rx;
      const ry = yScale(band.yHi);
      const rh = yScale(band.yLo) - ry;
      el(
        "rect",
        {
          x: rx,
          y: ry,
          width: rw,
          height: rh,
          rx: "5",
          ry: "5",
          fill: COLORS.toss,
          "fill-opacity": "0.09"
        },
        shapeLayer
      );
    });

    // 4. Horizontal Phrase Treads + Direct Labels
    const treadLayer = el("g", { class: "treads-layer" }, svg);
    data.forEach(function (d, k) {
      const x0 = xScale(k, n);
      const x1 = xScale(k + 1, n);
      const xm = (x0 + x1) / 2;
      const yy = yScale(d.bt_index);

      const g = el(
        "g",
        {
          class: "tread-group",
          tabindex: "0",
          role: "button",
          "aria-label":
            d.term +
            ": perceived probability index " +
            Number(d.bt_index).toFixed(1) +
            " out of 100"
        },
        treadLayer
      );

      // Horizontal dark tread
      el(
        "line",
        {
          class: "tread-line",
          x1: x0,
          y1: yy,
          x2: x1,
          y2: yy,
          stroke: COLORS.tread,
          "stroke-width": "2.6",
          "stroke-linecap": "butt"
        },
        g
      );

      // Label placement beneath tread (exact staggered zero-overlap layout)
      let labelY = yy + 14;
      if (k === 0) {
        labelY = yScale(0) + 13;
      } else if (d.stagger_label) {
        const dropPx = k === 14 ? 29 : 34;
        labelY = yy + dropPx;
        el(
          "line",
          {
            x1: xm,
            y1: yy + 3,
            x2: xm,
            y2: labelY - 10,
            stroke: COLORS.staggerTick,
            "stroke-width": "0.85"
          },
          g
        );
      }

      const txt = el(
        "text",
        {
          class: "phrase-label",
          x: xm,
          y: labelY,
          fill: COLORS.inkDark,
          "font-size": "9.3",
          "font-weight": d.emphasize_label ? "600" : "400",
          "text-anchor": "middle"
        },
        g
      );

      d.short_label.forEach(function (part, lineIdx) {
        const tsp = el(
          "tspan",
          {
            x: xm,
            dy: lineIdx === 0 ? "0" : "10.8"
          },
          txt
        );
        tsp.textContent = part;
      });

      // Invisible generous hover/focus hit area over the tread and label
      el(
        "rect",
        {
          x: x0 + 6,
          y: yy - 10,
          width: Math.max(12, x1 - x0 - 12),
          height: 36,
          fill: "transparent"
        },
        g
      );

      g.addEventListener("mouseenter", function (evt) {
        g.classList.add("is-hovered");
        showPhraseTooltip(d, evt, xm, yy);
      });
      g.addEventListener("mousemove", function (evt) {
        positionTooltip(evt.clientX, evt.clientY);
      });
      g.addEventListener("mouseleave", function () {
        g.classList.remove("is-hovered");
        hideTooltip();
      });
      g.addEventListener("focus", function () {
        g.classList.add("is-hovered");
        showPhraseTooltip(d, null, xm, yy);
      });
      g.addEventListener("blur", function () {
        g.classList.remove("is-hovered");
        hideTooltip();
      });
    });

    // 5. Color-Coded Vertical Risers + Direct Agreement Percentages
    const riserLayer = el("g", { class: "risers-layer" }, svg);
    const tossLabelIndices = new Set([2, 4, 5, 7, 13]);

    data.forEach(function (d, k) {
      if (k >= n - 1 || !d.next_term) return;

      const xPos = xScale(k + 1, n);
      const y0 = yScale(d.bt_index);
      const y1 = yScale(d.next_bt_index);
      const yMid = (y0 + y1) / 2;
      const tier = d.next_tier;
      const col = getTierColor(tier);
      const pctRounded = Math.round(d.next_agree_pct) + "%";

      const g = el(
        "g",
        {
          class: "riser-group",
          "data-tier": tier,
          tabindex: "0",
          role: "button",
          "aria-label":
            d.term +
            " to " +
            d.next_term +
            ": " +
            formatPct(d.next_agree_pct) +
            " agreement"
        },
        riserLayer
      );

      // Vertical riser bar
      el(
        "line",
        {
          class: "riser-bar",
          x1: xPos,
          y1: y0,
          x2: xPos,
          y2: y1,
          stroke: col,
          "stroke-width": tier === "clear" ? "6.2" : "5.0",
          "stroke-linecap": "butt"
        },
        g
      );

      // Accent dot on flat coin-toss and moderate joints so color tier stays unmistakable
      if (tier !== "clear") {
        el(
          "circle",
          {
            class: "riser-dot",
            cx: xPos,
            cy: yMid,
            r: tier === "toss" ? "4.6" : "3.8",
            fill: col,
            stroke: COLORS.paper,
            "stroke-width": "1.2"
          },
          g
        );
      }

      // Direct percentage label positioned cleanly without collision
      if (tier === "clear") {
        const lbl = el(
          "text",
          {
            x: xPos - 9,
            y: yMid + 3.5,
            fill: COLORS.clear,
            "font-size": "10.8",
            "font-weight": "700",
            "text-anchor": "end"
          },
          g
        );
        lbl.textContent = pctRounded;
      } else {
        const isToss = tossLabelIndices.has(k);
        const xOff = k === 4 ? -3 : k === 5 ? 3 : 0;
        const yOff = isToss ? 14 : k === 10 || k === 11 ? 10 : 12;
        const lbl = el(
          "text",
          {
            x: xPos + xOff,
            y: y1 - yOff,
            fill: col,
            "font-size": isToss ? "9.9" : "9.2",
            "font-weight": isToss ? "700" : "600",
            "text-anchor": "middle"
          },
          g
        );
        lbl.textContent = pctRounded;
      }

      // Generous invisible hover hit target around the riser
      const hitTop = Math.min(y0, y1) - 14;
      const hitHeight = Math.max(28, Math.abs(y0 - y1) + 28);
      el(
        "rect",
        {
          x: xPos - 12,
          y: hitTop,
          width: 24,
          height: hitHeight,
          fill: "transparent"
        },
        g
      );

      g.addEventListener("mouseenter", function (evt) {
        g.classList.add("is-hovered");
        showStepTooltip(d, evt, xPos, yMid);
      });
      g.addEventListener("mousemove", function (evt) {
        positionTooltip(evt.clientX, evt.clientY);
      });
      g.addEventListener("mouseleave", function () {
        g.classList.remove("is-hovered");
        hideTooltip();
      });
      g.addEventListener("focus", function () {
        g.classList.add("is-hovered");
        showStepTooltip(d, null, xPos, yMid);
      });
      g.addEventListener("blur", function () {
        g.classList.remove("is-hovered");
        hideTooltip();
      });
    });

    // 6. Four Crisp Editorial Callouts in Verified Open Whitespace
    const calloutLayer = el("g", { class: "callouts-layer" }, svg);

    // Callout 1: THE DOUBT PLATEAU (below y=50 guide, left open space)
    drawCallout(calloutLayer, {
      x: xScale(0.45, n),
      y: yScale(45.5),
      title: "THE DOUBT PLATEAU",
      titleColor: COLORS.toss,
      lines: [
        "Six low-probability phrases pack inside",
        "just 12 index points. Remote Chance vs.",
        "Improbable splits 51% to 49%."
      ],
      path:
        "M " +
        xScale(2.2, n).toFixed(1) +
        " " +
        yScale(31.2).toFixed(1) +
        " Q " +
        xScale(2.35, n).toFixed(1) +
        " " +
        yScale(22.0).toFixed(1) +
        " " +
        xScale(2.86, n).toFixed(1) +
        " " +
        yScale(16.6).toFixed(1)
    });

    // Callout 2: THE 92% CLARITY CLIFF (open band y=60..73)
    drawCallout(calloutLayer, {
      x: xScale(4.65, n),
      y: yScale(72.0),
      title: "THE 92% CLARITY CLIFF",
      titleColor: COLORS.clear,
      lines: [
        "Crossing from Unlikely to Could Happen",
        "leaps 15.3 index points, the largest",
        "consensus jump in the dataset (n = 424)."
      ],
      path:
        "M " +
        xScale(6.4, n).toFixed(1) +
        " " +
        yScale(57.2).toFixed(1) +
        " Q " +
        xScale(6.55, n).toFixed(1) +
        " " +
        yScale(46.0).toFixed(1) +
        " " +
        xScale(6.84, n).toFixed(1) +
        " " +
        yScale(35.0).toFixed(1)
    });

    // Callout 3: THE COIN-TOSS TRAP (lower-right open whitespace)
    drawCallout(calloutLayer, {
      x: xScale(10.35, n),
      y: yScale(30.5),
      title: "THE COIN-TOSS TRAP",
      titleColor: COLORS.toss,
      lines: [
        "Likely edges out Probable by just 53% to 47%.",
        "When asked the same pair twice in reverse order,",
        "20% of respondents contradicted themselves."
      ],
      path:
        "M " +
        xScale(13.6, n).toFixed(1) +
        " " +
        yScale(33.2).toFixed(1) +
        " Q " +
        xScale(13.85, n).toFixed(1) +
        " " +
        yScale(48.5).toFixed(1) +
        " " +
        xScale(14.03, n).toFixed(1) +
        " " +
        yScale(62.8).toFixed(1)
    });

    // Callout 4: PRECISION AT THE TOP (right open whitespace below top stairs)
    drawCallout(calloutLayer, {
      x: xScale(14.95, n),
      y: yScale(46.0),
      title: "PRECISION AT THE TOP",
      titleColor: COLORS.clear,
      lines: [
        "The final three steps climb cleanly",
        "by 10+ points each with 87% to 95%",
        "agreement and zero close rivals."
      ],
      path:
        "M " +
        xScale(17.25, n).toFixed(1) +
        " " +
        yScale(48.8).toFixed(1) +
        " Q " +
        xScale(17.28, n).toFixed(1) +
        " " +
        yScale(66.5).toFixed(1) +
        " " +
        xScale(17.12, n).toFixed(1) +
        " " +
        yScale(83.2).toFixed(1)
    });
  }

  // =========================================================================
  // Standalone Static JSON Bootstrap (Decoupled from Tableau Extensions API)
  // =========================================================================
  function init() {
    bindLegendControls();

    fetch("./data.json")
      .then(function (res) {
        if (!res.ok) {
          throw new Error("HTTP " + res.status + " loading ./data.json");
        }
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error("Expected a non-empty array in ./data.json");
        }
        state.data = data;
        renderStaircase(data);
      })
      .catch(function (err) {
        console.error("Failed to load infographic data:", err);
        showLoadError(
          "Could not load ./data.json. If testing locally, serve this folder over HTTP (for example: python -m http.server 8000) instead of opening index.html directly via file://."
        );
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
