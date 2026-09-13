(async () => {
  "use strict";

  const STORAGE_KEY = "teamRosterData";
  const SAVED_ROSTERS_KEY = "teamRosterSavedRosters";
  const URL_PARAM = "data";
  const COURT_SIZE = 6;

  // Only two real, assignable categories: present players rotate through
  // on-court/on-bench purely by their position in the list (top COURT_SIZE
  // = on court). Absent players are a separate pool, excluded from rotation.
  const STATUS_ORDER = ["present", "absent"];

  // Present players are stored in plain sequential court-position order:
  // present[0] = position 1 (server), present[1] = position 2, ...
  // present[5] = position 6, present[6+] = the bench queue. Storing it this
  // way (rather than the serve-rotation's zigzag position order) means a
  // single whole-array rotation is all rotateCourt needs.

  const boardEl = document.querySelector(".board");
  const listEl = document.getElementById("player-list");
  const courtEl = document.getElementById("court");
  const courtSectionEl = document.getElementById("court-section");
  const absentWrapEl = document.getElementById("absent-wrap");
  const absentInnerEl = document.getElementById("absent-inner");
  const addForm = document.getElementById("add-form");
  const nameInput = document.getElementById("player-name");
  const rotateBackBtn = document.getElementById("rotate-back-btn");
  const rotateForwardBtn = document.getElementById("rotate-forward-btn");
  const lockBtn = document.getElementById("lock-btn");
  const shareBtn = document.getElementById("share-btn");
  const resetBtn = document.getElementById("reset-btn");
  const menuBtn = document.getElementById("menu-btn");
  const menuPanel = document.getElementById("menu-panel");
  const saveRosterBtn = document.getElementById("save-roster-btn");
  const savedRostersListEl = document.getElementById("saved-rosters-list");

  /** @type {{ id: string, name: string, absent: boolean, number: number }[]} */
  let players = [];
  let locked = false;
  let editingNumberId = null;
  let editingNameId = null;
  // Tracks the most recent persistState() call so the share button can
  // await it before copying the URL — persistState fires and forgets
  // everywhere else, since nothing else depends on it having finished.
  let lastPersist = Promise.resolve();

  // ---------- base64 + compression helpers (UTF-8 safe) ----------

  // Legacy plain (uncompressed) base64 of a JSON string — the format every
  // link and localStorage entry used before compression was added. Kept
  // around as: (a) the decode fallback for old links/storage, and (b) the
  // encode fallback on browsers without CompressionStream.
  function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary);
  }

  function fromBase64(b64) {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  // URL-safe base64 (- _ instead of + /, no = padding) for the compressed
  // binary payload, so it drops into a query param with no extra encoding.
  function bytesToBase64Url(bytes) {
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function base64UrlToBytes(str) {
    const standard = str.replace(/-/g, "+").replace(/_/g, "/");
    const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  }

  async function compressToBytes(str) {
    const bytes = new TextEncoder().encode(str);
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function decompressFromBytes(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(stream).text();
  }

  // Every new link/localStorage entry is deflate-compressed then base64url
  // encoded (shrinks a several-player roster's URL considerably); browsers
  // without CompressionStream (older Safari) fall back to the legacy plain
  // encoding instead of breaking.
  async function encodeState(state) {
    const json = JSON.stringify(state);
    if (typeof CompressionStream === "undefined") return toBase64(json);
    return bytesToBase64Url(await compressToBytes(json));
  }

  // Tries the compressed format first; falls back to the legacy plain
  // format so links and localStorage entries from before compression was
  // added (or written by a browser without CompressionStream) keep working.
  async function decodeState(encoded) {
    try {
      const json = await decompressFromBytes(base64UrlToBytes(encoded));
      return JSON.parse(json);
    } catch (err) {
      return JSON.parse(fromBase64(encoded));
    }
  }

  // ---------- persistence ----------

  function sanitizePlayers(raw) {
    if (!Array.isArray(raw)) return [];
    const list = raw
      .filter((p) => p && typeof p.name === "string")
      .map((p) => ({
        id: typeof p.id === "string" ? p.id : makeId(),
        name: p.name,
        absent: sanitizeAbsent(p),
        number: Number.isInteger(p.number) && p.number >= 1 && p.number <= 99 ? p.number : null,
      }));
    assignMissingNumbers(list);
    return list;
  }

  function sanitizeAbsent(p) {
    if (typeof p.absent === "boolean") return p.absent;
    // Migrate the old three-state { status: "court"|"bench"|"absent" } shape.
    if (p.status === "absent") return true;
    if (p.status === "court" || p.status === "bench") return false;
    // Oldest two-state { bench: boolean } shape: both were present players,
    // court/bench is now purely positional, so just mark them present.
    return false;
  }

  function assignMissingNumbers(list) {
    const used = new Set(list.filter((p) => p.number !== null).map((p) => p.number));
    let next = 1;
    for (const p of list) {
      if (p.number === null) {
        while (used.has(next)) next++;
        p.number = next;
        used.add(next);
      }
    }
  }

  function nextAvailableNumber() {
    const used = new Set(players.map((p) => p.number));
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }

  async function loadInitialState() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get(URL_PARAM);

    if (fromUrl) {
      try {
        return sanitizeState(await decodeState(fromUrl));
      } catch (err) {
        console.warn("Could not decode roster data from URL, falling back.", err);
      }
    }

    const fromStorage = localStorage.getItem(STORAGE_KEY);
    if (fromStorage) {
      try {
        return sanitizeState(await decodeState(fromStorage));
      } catch (err) {
        console.warn("Could not decode roster data from localStorage.", err);
      }
    }

    return { players: [], locked: false };
  }

  function sanitizeState(raw) {
    if (Array.isArray(raw)) {
      return { players: sanitizePlayers(raw), locked: false };
    }
    if (raw && typeof raw === "object") {
      return { players: sanitizePlayers(raw.players), locked: raw.locked === true };
    }
    return { players: [], locked: false };
  }

  function persistState() {
    lastPersist = persistStateAsync();
    return lastPersist;
  }

  async function persistStateAsync() {
    const encoded = await encodeState({ players, locked });
    localStorage.setItem(STORAGE_KEY, encoded);

    const url = new URL(window.location.href);
    if (players.length > 0) {
      url.searchParams.set(URL_PARAM, encoded);
    } else {
      url.searchParams.delete(URL_PARAM);
    }
    window.history.replaceState(null, "", url.toString());
  }

  // ---------- saved rosters (named snapshots, separate from the single
  // live-editing roster above) ----------

  // An array, not a { name: ... } map: object keys that look numeric
  // ("2024") iterate in numeric order regardless of insertion order, which
  // would silently reorder the saved-rosters list.
  function loadSavedRosters() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVED_ROSTERS_KEY));
      return Array.isArray(raw) ? raw.filter((r) => r && typeof r.name === "string" && typeof r.encoded === "string") : [];
    } catch (err) {
      return [];
    }
  }

  function writeSavedRosters(list) {
    localStorage.setItem(SAVED_ROSTERS_KEY, JSON.stringify(list));
  }

  function savedRosterShareUrl(encoded) {
    const url = new URL(window.location.href);
    url.searchParams.set(URL_PARAM, encoded);
    return url.toString();
  }

  async function saveCurrentRoster() {
    const name = window.prompt("Save this roster as:");
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    const saved = loadSavedRosters();
    const existingIndex = saved.findIndex((r) => r.name === trimmed);
    if (existingIndex !== -1) {
      const overwrite = window.confirm(`A roster named "${trimmed}" already exists. Overwrite it?`);
      if (!overwrite) return;
    }

    const encoded = await encodeState({ players, locked });
    if (existingIndex !== -1) {
      saved[existingIndex] = { name: trimmed, encoded };
    } else {
      saved.push({ name: trimmed, encoded });
    }
    writeSavedRosters(saved);
    renderSavedRosters();
  }

  async function loadSavedRoster(entry) {
    const state = sanitizeState(await decodeState(entry.encoded));
    players = state.players;
    locked = state.locked;
    editingNumberId = null;
    editingNameId = null;
    render();
    persistState();
    closeMenu();
  }

  function deleteSavedRoster(name) {
    if (!window.confirm(`Delete saved roster "${name}"? This cannot be undone.`)) return;
    const saved = loadSavedRosters().filter((r) => r.name !== name);
    writeSavedRosters(saved);
    renderSavedRosters();
  }

  async function shareSavedRoster(entry, btnEl) {
    const url = savedRosterShareUrl(entry.encoded);
    const originalLabel = btnEl.textContent;
    try {
      await navigator.clipboard.writeText(url);
      btnEl.textContent = "Copied!";
    } catch (err) {
      btnEl.textContent = "Copy failed";
    }
    setTimeout(() => {
      btnEl.textContent = originalLabel;
    }, 1500);
  }

  function renderSavedRosters() {
    const saved = loadSavedRosters();
    savedRostersListEl.innerHTML = "";

    if (saved.length === 0) {
      savedRostersListEl.appendChild(emptyRow("No rosters have been saved"));
      return;
    }

    saved.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "saved-roster-row";

      const name = document.createElement("span");
      name.className = "saved-roster-name";
      name.textContent = entry.name;
      name.title = "Tap to load this roster";
      name.addEventListener("click", () => loadSavedRoster(entry));
      row.appendChild(name);

      const shareRowBtn = document.createElement("button");
      shareRowBtn.type = "button";
      shareRowBtn.className = "saved-roster-share-btn";
      shareRowBtn.textContent = "Share";
      shareRowBtn.title = "Copy a shareable link for this saved roster";
      shareRowBtn.addEventListener("click", () => shareSavedRoster(entry, shareRowBtn));
      row.appendChild(shareRowBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "remove-btn";
      deleteBtn.textContent = "×";
      deleteBtn.title = "Delete this saved roster";
      deleteBtn.addEventListener("click", () => deleteSavedRoster(entry.name));
      row.appendChild(deleteBtn);

      savedRostersListEl.appendChild(row);
    });
  }

  function openMenu() {
    menuPanel.hidden = false;
    menuBtn.setAttribute("aria-expanded", "true");
    renderSavedRosters();
  }

  function closeMenu() {
    menuPanel.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
  }

  // ---------- state mutation ----------

  function makeId() {
    return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function addPlayer(name) {
    if (locked) return;
    const present = players.filter((p) => !p.absent);
    const absent = players.filter((p) => p.absent);
    present.push({ id: makeId(), name: name.trim(), absent: false, number: nextAvailableNumber() });
    players = [...present, ...absent];
    render();
    persistState();
  }

  function setPlayerNumber(id, rawValue) {
    if (!locked) {
      const player = players.find((p) => p.id === id);
      if (player) {
        const parsed = parseInt(rawValue, 10);
        if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 99) {
          player.number = parsed;
        }
      }
    }
    editingNumberId = null;
    render();
    persistState();
  }

  function setPlayerName(id, rawValue) {
    if (!locked) {
      const player = players.find((p) => p.id === id);
      const trimmed = rawValue.trim();
      if (player && trimmed) {
        player.name = trimmed;
      }
    }
    editingNameId = null;
    render();
    persistState();
  }

  function removePlayer(id) {
    if (locked) return;
    players = players.filter((p) => p.id !== id);
    render();
    persistState();
  }

  function movePlayer(id, targetStatus, index) {
    if (locked) return;
    const dragged = players.find((p) => p.id === id);
    if (!dragged) return;

    const groups = { present: [], absent: [] };
    for (const p of players) {
      if (p.id === id) continue;
      groups[p.absent ? "absent" : "present"].push(p);
    }

    dragged.absent = targetStatus === "absent";
    groups[targetStatus].splice(index, 0, dragged);

    players = [...groups.present, ...groups.absent];
    render();
    persistState();
  }

  function rotateCourt(direction) {
    // Because present players are stored in sequential position order
    // (position 1, 2, ... 6, then the bench queue), a plain whole-array
    // rotation is all that's needed: shifting the front (position 1) to the
    // back naturally lands it after the bench, and pulls everyone else,
    // including the front of the bench, up by one slot. No branching for
    // whether a bench exists is required — it falls out for free.
    const present = players.filter((p) => !p.absent);
    const absent = players.filter((p) => p.absent);
    if (present.length < 2) return;

    // The player making the long jump (server exiting to the back of the
    // bench line, or the bench tail entering at the front) gets a fancier
    // animation than the plain one-slot shift everyone else does.
    const jumpingId = direction === "forward" ? present[0].id : present[present.length - 1].id;
    const oldRects = capturePlayerRowRects();
    const oldCourt = captureCourtSnapshot();

    if (direction === "forward") {
      present.push(present.shift());
    } else {
      present.unshift(present.pop());
    }

    players = [...present, ...absent];
    render();
    persistState();
    animateRowMoves(oldRects, jumpingId);
    animateCourtRotation(oldCourt);
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function capturePlayerRowRects() {
    const rects = new Map();
    boardEl.querySelectorAll(".player-row").forEach((row) => {
      rects.set(row.dataset.id, row.getBoundingClientRect());
    });
    return rects;
  }

  function captureCourtSnapshot() {
    const court = players.filter((p) => !p.absent).slice(0, COURT_SIZE);
    const positions = new Map();
    const data = new Map();
    court.forEach((player, index) => {
      positions.set(player.id, index);
      data.set(player.id, { name: player.name, number: player.number });
    });
    return { positions, data };
  }

  function courtCellAt(index) {
    return courtEl.querySelector(`.court-cell[data-pos="${index + 1}"]`);
  }

  function animateCourtRotation(oldCourt) {
    if (prefersReducedMotion()) return;
    const { positions: oldPositions, data: oldData } = oldCourt;

    const newCourt = players.filter((p) => !p.absent).slice(0, COURT_SIZE);
    const newPositions = new Map();
    newCourt.forEach((player, index) => newPositions.set(player.id, index));

    // Snapshot every cell's true resting rect up front, before any
    // .animate() call runs. Cells are reused across renders (unlike roster
    // rows, which are rebuilt fresh each time), so reading
    // getBoundingClientRect() mid-loop after an earlier iteration already
    // started animating that same cell would return its current transformed
    // position instead of its static grid slot — corrupting the delta for
    // whichever other player's old or new cell happens to be that position.
    const cellRects = [];
    for (let i = 0; i < COURT_SIZE; i++) cellRects[i] = courtCellAt(i).getBoundingClientRect();

    newPositions.forEach((newIndex, id) => {
      const cell = courtCellAt(newIndex);
      const oldIndex = oldPositions.get(id);

      if (oldIndex === undefined) {
        // Subbing in from the bench: no previous cell to slide from, so
        // come in from below the court and fade into view.
        cell.animate([{ transform: "translateY(50px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], {
          duration: 400,
          easing: "ease-in-out",
        });
      } else if (oldIndex !== newIndex) {
        const dx = cellRects[oldIndex].left - cellRects[newIndex].left;
        const dy = cellRects[oldIndex].top - cellRects[newIndex].top;
        cell.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
          duration: 350,
          easing: "ease-in-out",
        });
      }
    });

    // The player rotating out no longer has a cell to animate — the real
    // cell at their old position already shows whoever replaced them — so
    // float a temporary look-alike over that spot and send it out the
    // bottom instead of just vanishing.
    oldPositions.forEach((oldIndex, id) => {
      if (!newPositions.has(id)) {
        animateCourtExit(cellRects[oldIndex], oldData.get(id));
      }
    });
  }

  function animateCourtExit(cellRect, player) {
    const courtRect = courtEl.getBoundingClientRect();

    const ghost = document.createElement("div");
    ghost.className = "court-cell court-exit-ghost";
    ghost.style.left = `${cellRect.left - courtRect.left}px`;
    ghost.style.top = `${cellRect.top - courtRect.top}px`;
    ghost.style.width = `${cellRect.width}px`;
    ghost.style.height = `${cellRect.height}px`;

    const name = document.createElement("span");
    name.className = "court-player-name";
    name.textContent = player.name;
    ghost.appendChild(name);

    const jersey = document.createElement("span");
    jersey.className = "court-player-jersey";
    jersey.textContent = `#${player.number}`;
    ghost.appendChild(jersey);

    courtEl.appendChild(ghost);

    const animation = ghost.animate(
      [{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(50px)", opacity: 0 }],
      { duration: 400, easing: "ease-in-out" }
    );
    animation.onfinish = () => ghost.remove();
  }

  function animateRowMoves(oldRects, jumpingId) {
    if (prefersReducedMotion()) return;

    boardEl.querySelectorAll(".player-row").forEach((row) => {
      const oldRect = oldRects.get(row.dataset.id);
      if (!oldRect) return;
      const newRect = row.getBoundingClientRect();
      const dx = oldRect.left - newRect.left;
      const dy = oldRect.top - newRect.top;
      if (dx === 0 && dy === 0) return;

      if (row.dataset.id === jumpingId) {
        // Lift up and to the left partway through, then arc down into its
        // resting spot, instead of just sliding in a straight line.
        row.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: `translate(${dx * 0.7 - 20}px, ${dy * 0.7 - 20}px)`, offset: 0.35 },
            { transform: "translate(0, 0)" },
          ],
          { duration: 500, easing: "ease-in-out" }
        );
      } else {
        row.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
          duration: 350,
          easing: "ease-in-out",
        });
      }
    });
  }

  // ---------- rendering ----------

  function renderCourt() {
    const court = players.filter((p) => !p.absent).slice(0, COURT_SIZE);

    for (let index = 0; index < COURT_SIZE; index++) {
      const pos = index + 1;
      const cell = courtEl.querySelector(`.court-cell[data-pos="${pos}"]`);
      const player = court[index];
      cell.classList.toggle("empty", !player);
      cell.innerHTML = "";

      const posNum = document.createElement("span");
      posNum.className = "court-pos-num";
      posNum.textContent = pos;
      cell.appendChild(posNum);

      const name = document.createElement("span");
      name.className = "court-player-name";
      name.textContent = player ? player.name : "—";
      cell.appendChild(name);

      if (player) {
        const jersey = document.createElement("span");
        jersey.className = "court-player-jersey";
        jersey.textContent = `#${player.number}`;
        cell.appendChild(jersey);
      }

      if (pos === 1) {
        const tag = document.createElement("span");
        tag.className = "court-server-tag";
        tag.textContent = "Server";
        cell.appendChild(tag);
      }
    }
  }

  function updateLockUI() {
    lockBtn.textContent = locked ? "🔓 Unlock Roster" : "🔒 Lock Roster";
    lockBtn.classList.toggle("locked", locked);
    nameInput.disabled = locked;
    addForm.querySelector("button[type=submit]").disabled = locked;

    // The court diagram is only meaningful once the lineup is locked in for
    // play; while still editing the roster, the Absent list is what matters.
    courtSectionEl.classList.toggle("collapsed", !locked);
    absentWrapEl.classList.toggle("collapsed", locked);
  }

  function render() {
    listEl.innerHTML = "";
    renderCourt();

    const present = players.filter((p) => !p.absent);
    const absent = players.filter((p) => p.absent);
    const onCourt = present.slice(0, COURT_SIZE);
    const onBench = present.slice(COURT_SIZE);

    updateLockUI();

    listEl.appendChild(sectionLabel(`On Court (${onCourt.length}/${COURT_SIZE})`));
    if (onCourt.length === 0) {
      listEl.appendChild(emptyRow("No players on the court. Drag a player up to send them in."));
    } else {
      onCourt.forEach((player, index) => listEl.appendChild(createRow(player, { isServing: index === 0 })));
    }

    // Purely a visual marker of the on-court/on-bench boundary within the
    // present list — not a real drop-target section (see "sub-divider").
    listEl.appendChild(createDivider("On Bench", { subDivider: true }));
    if (onBench.length === 0) {
      listEl.appendChild(emptyRow("No players on the bench."));
    } else {
      onBench.forEach((player) => listEl.appendChild(createRow(player)));
    }

    // absent-wrap is a persistent element outside #player-list (not rebuilt
    // every render) so its collapse transition has a stable node to animate
    // across, rather than a fresh element that's already born collapsed.
    absentInnerEl.innerHTML = "";
    absentInnerEl.appendChild(createDivider("Absent"));
    if (absent.length === 0) {
      absentInnerEl.appendChild(emptyRow("No absent players."));
    } else {
      absent.forEach((player) => absentInnerEl.appendChild(createRow(player)));
    }

    if (editingNumberId) {
      const input = boardEl.querySelector(".player-number-input");
      if (input) {
        input.focus();
        input.select();
      }
    }

    if (editingNameId) {
      const input = boardEl.querySelector(".player-name-input");
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  function sectionLabel(text) {
    const el = document.createElement("div");
    el.className = "section-label";
    el.textContent = text;
    return el;
  }

  function createDivider(text, { subDivider = false } = {}) {
    const el = document.createElement("div");
    el.className = subDivider ? "divider-row sub-divider" : "divider-row";

    const lineLeft = document.createElement("span");
    lineLeft.className = "divider-line";
    el.appendChild(lineLeft);

    const label = document.createElement("span");
    label.className = "divider-label";
    label.textContent = text;
    el.appendChild(label);

    const lineRight = document.createElement("span");
    lineRight.className = "divider-line";
    el.appendChild(lineRight);

    return el;
  }

  function emptyRow(text) {
    const el = document.createElement("div");
    el.className = "empty-row";
    el.textContent = text;
    return el;
  }

  // Widened 1.5x horizontally from the original 24x24 square glyph, with a
  // matching 36x24 viewBox (rather than just stretching the old square icon
  // inside a wider box): the <svg> scales via preserveAspectRatio "meet" by
  // default, so a wider container around a square viewBox just letterboxes
  // in extra blank space on the sides instead of actually widening the
  // drawn shirt. Making the viewBox itself match the container's aspect
  // ratio (see .player-number's 54x36 in style.css) means the artwork fills
  // the whole box, giving two-digit numbers real room in the torso.
  const JERSEY_SVG_PATH =
    "M12 2 L15 2 L18 4 L21 2 L24 2 L30 5 L27 8 L24 7 L24 20 L12 20 L12 7 L9 8 L6 5 Z";

  function createNumberEl(player) {
    if (!locked && editingNumberId === player.id) {
      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.max = "99";
      input.className = "player-number-input";
      input.value = player.number;
      input.addEventListener("input", () => {
        if (input.value.length > 2) input.value = input.value.slice(0, 2);
      });
      input.addEventListener("blur", () => setPlayerNumber(player.id, input.value));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
      });
      return input;
    }

    const badge = document.createElement("span");
    badge.className = "player-number";
    badge.classList.toggle("locked", locked);
    badge.innerHTML = `
      <svg class="jersey-icon" viewBox="0 0 36 24" aria-hidden="true">
        <path d="${JERSEY_SVG_PATH}"></path>
      </svg>
      <span class="jersey-number">${player.number}</span>
    `;

    badge.title = "Tap to change number";
    // Always attach the listener (checking the live `locked` value at click
    // time, not `!locked` at creation time): rotateCourt() re-renders rows
    // while the roster is locked, which used to skip attaching this listener
    // entirely for any row rebuilt during that render — leaving it dead even
    // after unlocking, since unlocking only toggles classes in place and
    // doesn't rebuild the badges.
    badge.addEventListener("click", () => {
      if (locked) return;
      editingNumberId = player.id;
      render();
    });
    return badge;
  }

  // Same volleyball as the header logo — its geometry lives once as a
  // <symbol> in index.html and is referenced here by <use>, since the path
  // data is large and both places need to recolor it per context (currentColor
  // for the ball, --seam-color for whatever sits behind the gaps).
  const VOLLEY_SVG = `
    <svg class="volley-icon" aria-hidden="true">
      <use href="#volley-icon-symbol"></use>
    </svg>
  `;

  function createNameEl(player) {
    if (!locked && editingNameId === player.id) {
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 40;
      input.className = "player-name-input";
      input.value = player.name;
      input.addEventListener("blur", () => setPlayerName(player.id, input.value));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
        if (e.key === "Escape") {
          editingNameId = null;
          render();
        }
      });
      return input;
    }

    const label = document.createElement("span");
    label.className = "player-name";
    label.textContent = player.name;
    label.title = "Tap to edit name";
    // Always attach the listener (checking the live `locked` value at click
    // time) rather than gating attachment on `!locked` at creation time —
    // see the identical fix on the jersey-number badge's click listener.
    label.addEventListener("click", () => {
      if (locked) return;
      editingNameId = player.id;
      render();
    });
    return label;
  }

  function createTrailing(player, isServing) {
    if (!locked) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "×";
      removeBtn.title = "Remove player";
      removeBtn.addEventListener("click", () => {
        if (confirm(`Remove ${player.name} from the roster?`)) removePlayer(player.id);
      });
      return removeBtn;
    }

    // Removing is disabled while locked, so swap the remove button for a
    // purely informational volleyball icon; the current server's is
    // highlighted.
    const trailing = document.createElement("div");
    trailing.className = "row-trailing";
    trailing.innerHTML = VOLLEY_SVG + (isServing ? '<span class="serving-label">serving</span>' : "");
    if (isServing) trailing.querySelector(".volley-icon").classList.add("serving");
    return trailing;
  }

  function createRow(player, { isServing = false } = {}) {
    const row = document.createElement("div");
    row.className = "player-row";
    row.classList.toggle("locked", locked);
    row.dataset.id = player.id;

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "⋮⋮";
    handle.addEventListener("pointerdown", onRowPointerDown);
    row.appendChild(handle);

    row.appendChild(createNumberEl(player));
    row.appendChild(createNameEl(player));
    row.appendChild(createTrailing(player, isServing));

    return row;
  }

  // ---------- drag interaction (pointer events, works for mouse & touch) ----------

  let drag = null;

  function onRowPointerDown(e) {
    if (locked) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const row = e.currentTarget.closest(".player-row");
    const id = row.dataset.id;
    const rect = row.getBoundingClientRect();

    const others = [];
    for (const el of boardEl.querySelectorAll(".player-row, .divider-row")) {
      if (el === row) continue;
      if (el.classList.contains("player-row")) {
        const player = players.find((p) => p.id === el.dataset.id);
        others.push({ type: "player", status: player && player.absent ? "absent" : "present", el, rect: el.getBoundingClientRect() });
      } else if (el.classList.contains("divider-row") && !el.classList.contains("sub-divider")) {
        others.push({ type: "divider", el, rect: el.getBoundingClientRect() });
      }
    }

    const ghost = row.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.style.width = `${rect.width}px`;
    document.body.appendChild(ghost);

    const indicator = document.createElement("div");
    indicator.className = "drop-indicator";

    drag = {
      id,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      ghost,
      indicator,
      originEl: row,
      others,
      lastIndex: null,
    };

    row.classList.add("dragging");
    positionGhost(e.clientX, e.clientY);

    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
    e.preventDefault();
  }

  function positionGhost(clientX, clientY) {
    drag.ghost.style.left = `${clientX - drag.offsetX}px`;
    drag.ghost.style.top = `${clientY - drag.offsetY}px`;
  }

  function computeInsertionIndex(clientY) {
    const { others } = drag;
    for (let i = 0; i < others.length; i++) {
      const mid = others[i].rect.top + others[i].rect.height / 2;
      if (clientY < mid) return i;
    }
    return others.length;
  }

  function updateIndicator(index) {
    const { others, indicator } = drag;
    // Insert relative to the anchor's actual parent, not listEl directly —
    // rows inside a collapsible section (e.g. Absent) are nested one level
    // deeper, and insertBefore requires a direct child of the target parent.
    if (index >= others.length) {
      const last = others[others.length - 1];
      const container = last ? last.el.parentElement : listEl;
      container.appendChild(indicator);
    } else {
      const target = others[index].el;
      target.parentElement.insertBefore(indicator, target);
    }
  }

  function onDragMove(e) {
    if (!drag) return;
    positionGhost(e.clientX, e.clientY);

    const index = computeInsertionIndex(e.clientY);
    if (index !== drag.lastIndex) {
      drag.lastIndex = index;
      updateIndicator(index);
    }
  }

  function onDragEnd(e) {
    if (!drag) return;
    const { id, ghost, indicator, others } = drag;

    const index = drag.lastIndex !== null ? drag.lastIndex : computeInsertionIndex(e.clientY);

    // Every divider before the drop point crosses one more section boundary,
    // so the number of dividers passed selects which section we landed in.
    const dividersBefore = others.slice(0, index).filter((o) => o.type === "divider").length;
    const targetStatus = STATUS_ORDER[Math.min(dividersBefore, STATUS_ORDER.length - 1)];

    let targetIndex = 0;
    for (let i = 0; i < index; i++) {
      if (others[i].type === "player" && others[i].status === targetStatus) targetIndex++;
    }

    ghost.remove();
    indicator.remove();
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    drag = null;

    movePlayer(id, targetStatus, targetIndex);
  }

  // ---------- misc UI ----------

  addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (locked) return;
    const name = nameInput.value.trim();
    if (!name) return;
    addPlayer(name);
    nameInput.value = "";
    nameInput.focus();
  });

  rotateBackBtn.addEventListener("click", () => rotateCourt("backward"));
  rotateForwardBtn.addEventListener("click", () => rotateCourt("forward"));

  lockBtn.addEventListener("click", () => {
    locked = !locked;
    editingNumberId = null;
    editingNameId = null;
    updateLockUI();

    // Toggle existing row elements in place rather than calling render(),
    // which tears down and rebuilds every row from scratch — a freshly
    // created row is already born in its final state with nothing to
    // transition from, so the handle-collapse animation would never play.
    const serverId = players.filter((p) => !p.absent)[0]?.id;
    boardEl.querySelectorAll(".player-row").forEach((row) => {
      row.classList.toggle("locked", locked);
      const numberEl = row.querySelector(".player-number");
      if (numberEl) numberEl.classList.toggle("locked", locked);

      const player = players.find((p) => p.id === row.dataset.id);
      const oldTrailing = row.querySelector(".remove-btn, .row-trailing");
      if (player && oldTrailing) {
        oldTrailing.replaceWith(createTrailing(player, row.dataset.id === serverId));
      }
    });

    persistState();
  });

  shareBtn.addEventListener("click", async () => {
    try {
      // The URL is updated asynchronously (compressing takes a tick), so
      // wait for the latest persist to land before copying it — otherwise
      // a share click right after an edit could copy a stale URL.
      await lastPersist;
      await navigator.clipboard.writeText(window.location.href);
      shareBtn.textContent = "Link Copied!";
    } catch (err) {
      shareBtn.textContent = "Copy failed";
    }
    setTimeout(() => {
      shareBtn.textContent = "Copy Share Link";
    }, 1500);
  });

  resetBtn.addEventListener("click", () => {
    if (locked) return;
    if (players.length === 0) return;
    if (!confirm("Remove all players from the roster?")) return;
    players = [];
    render();
    persistState();
  });

  menuBtn.addEventListener("click", () => {
    if (menuPanel.hidden) openMenu();
    else closeMenu();
  });

  saveRosterBtn.addEventListener("click", () => {
    saveCurrentRoster();
  });

  // Close on an outside click or Escape, like any dropdown menu.
  document.addEventListener("click", (e) => {
    if (menuPanel.hidden) return;
    if (menuPanel.contains(e.target) || menuBtn.contains(e.target)) return;
    closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menuPanel.hidden) closeMenu();
  });

  // ---------- init ----------

  const initial = await loadInitialState();
  players = initial.players;
  locked = initial.locked;

  // Suppress the collapse transition for the very first render so the
  // court/absent sections don't visibly flash open-then-closed while
  // settling into their correct initial state.
  courtSectionEl.classList.add("no-anim");
  absentWrapEl.classList.add("no-anim");
  render();
  persistState();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      courtSectionEl.classList.remove("no-anim");
      absentWrapEl.classList.remove("no-anim");
    });
  });
})();
