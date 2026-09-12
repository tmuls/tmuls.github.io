(() => {
  "use strict";

  const STORAGE_KEY = "teamRosterData";
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

  const listEl = document.getElementById("player-list");
  const courtEl = document.getElementById("court");
  const addForm = document.getElementById("add-form");
  const nameInput = document.getElementById("player-name");
  const rotateBackBtn = document.getElementById("rotate-back-btn");
  const rotateForwardBtn = document.getElementById("rotate-forward-btn");
  const lockBtn = document.getElementById("lock-btn");
  const lockedBanner = document.getElementById("locked-banner");
  const shareBtn = document.getElementById("share-btn");
  const resetBtn = document.getElementById("reset-btn");

  /** @type {{ id: string, name: string, absent: boolean, number: number }[]} */
  let players = [];
  let locked = false;
  let editingNumberId = null;

  // ---------- base64 helpers (UTF-8 safe) ----------

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

  function encodeState(state) {
    return toBase64(JSON.stringify(state));
  }

  function decodeState(b64) {
    return JSON.parse(fromBase64(b64));
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
        number: Number.isInteger(p.number) && p.number > 0 ? p.number : null,
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

  function loadInitialState() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get(URL_PARAM);

    if (fromUrl) {
      try {
        return sanitizeState(decodeState(fromUrl));
      } catch (err) {
        console.warn("Could not decode roster data from URL, falling back.", err);
      }
    }

    const fromStorage = localStorage.getItem(STORAGE_KEY);
    if (fromStorage) {
      try {
        return sanitizeState(decodeState(fromStorage));
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
    const encoded = encodeState({ players, locked });
    localStorage.setItem(STORAGE_KEY, encoded);

    const url = new URL(window.location.href);
    if (players.length > 0) {
      url.searchParams.set(URL_PARAM, encoded);
    } else {
      url.searchParams.delete(URL_PARAM);
    }
    window.history.replaceState(null, "", url.toString());
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
        if (Number.isInteger(parsed) && parsed > 0) {
          player.number = parsed;
        }
      }
    }
    editingNumberId = null;
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

    if (direction === "forward") {
      present.push(present.shift());
    } else {
      present.unshift(present.pop());
    }

    players = [...present, ...absent];
    render();
    persistState();
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

  function render() {
    listEl.innerHTML = "";
    renderCourt();

    const present = players.filter((p) => !p.absent);
    const absent = players.filter((p) => p.absent);
    const onCourt = present.slice(0, COURT_SIZE);
    const onBench = present.slice(COURT_SIZE);

    lockedBanner.hidden = !locked;
    lockBtn.textContent = locked ? "🔓 Unlock Roster" : "🔒 Lock Roster";
    lockBtn.classList.toggle("locked", locked);
    nameInput.disabled = locked;
    addForm.querySelector("button[type=submit]").disabled = locked;

    listEl.appendChild(sectionLabel(`On Court (${onCourt.length}/${COURT_SIZE})`));
    if (onCourt.length === 0) {
      listEl.appendChild(emptyRow("No players on the court. Drag a player up to send them in."));
    } else {
      onCourt.forEach((player) => listEl.appendChild(createRow(player)));
    }

    // Purely a visual marker of the on-court/on-bench boundary within the
    // present list — not a real drop-target section (see "sub-divider").
    listEl.appendChild(createDivider("On Bench", { subDivider: true }));
    if (onBench.length === 0) {
      listEl.appendChild(emptyRow("No players on the bench."));
    } else {
      onBench.forEach((player) => listEl.appendChild(createRow(player)));
    }

    listEl.appendChild(createDivider("Absent"));
    if (absent.length === 0) {
      listEl.appendChild(emptyRow("No absent players."));
    } else {
      absent.forEach((player) => listEl.appendChild(createRow(player)));
    }

    if (editingNumberId) {
      const input = listEl.querySelector(".player-number-input");
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

  const JERSEY_SVG_PATH =
    "M8 2 L10 2 L12 4 L14 2 L16 2 L20 5 L18 8 L16 7 L16 20 L8 20 L8 7 L6 8 L4 5 Z";

  function createNumberEl(player) {
    if (!locked && editingNumberId === player.id) {
      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.className = "player-number-input";
      input.value = player.number;
      input.addEventListener("pointerdown", (e) => e.stopPropagation());
      input.addEventListener("click", (e) => e.stopPropagation());
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
      <svg class="jersey-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="${JERSEY_SVG_PATH}"></path>
      </svg>
      <span class="jersey-number">${player.number}</span>
    `;

    if (!locked) {
      badge.title = "Tap to change number";
      badge.addEventListener("pointerdown", (e) => e.stopPropagation());
      badge.addEventListener("click", (e) => {
        e.stopPropagation();
        editingNumberId = player.id;
        render();
      });
    }
    return badge;
  }

  function createRow(player) {
    const row = document.createElement("div");
    row.className = "player-row";
    row.classList.toggle("locked", locked);
    row.dataset.id = player.id;

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "⋮⋮";
    row.appendChild(handle);

    row.appendChild(createNumberEl(player));

    const label = document.createElement("span");
    label.className = "player-name";
    label.textContent = player.name;
    row.appendChild(label);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove player";
    removeBtn.disabled = locked;
    removeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removePlayer(player.id);
    });
    row.appendChild(removeBtn);

    row.addEventListener("pointerdown", onRowPointerDown);

    return row;
  }

  // ---------- drag interaction (pointer events, works for mouse & touch) ----------

  let drag = null;

  function onRowPointerDown(e) {
    if (locked) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const row = e.currentTarget;
    const id = row.dataset.id;
    const rect = row.getBoundingClientRect();

    const others = [];
    for (const el of listEl.children) {
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
    if (index >= others.length) {
      listEl.appendChild(indicator);
    } else {
      listEl.insertBefore(indicator, others[index].el);
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
    render();
    persistState();
  });

  shareBtn.addEventListener("click", async () => {
    try {
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

  // ---------- init ----------

  const initial = loadInitialState();
  players = initial.players;
  locked = initial.locked;
  render();
  persistState();
})();
