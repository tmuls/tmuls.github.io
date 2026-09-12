(() => {
  "use strict";

  const STORAGE_KEY = "teamRosterData";
  const URL_PARAM = "data";

  const listEl = document.getElementById("player-list");
  const addForm = document.getElementById("add-form");
  const nameInput = document.getElementById("player-name");
  const shareBtn = document.getElementById("share-btn");
  const resetBtn = document.getElementById("reset-btn");

  /** @type {{ id: string, name: string, bench: boolean, number: number }[]} */
  let players = [];
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

  function sanitize(raw) {
    if (!Array.isArray(raw)) return [];
    const list = raw
      .filter((p) => p && typeof p.name === "string")
      .map((p) => ({
        id: typeof p.id === "string" ? p.id : makeId(),
        name: p.name,
        bench: p.bench !== false,
        number: Number.isInteger(p.number) && p.number > 0 ? p.number : null,
      }));
    assignMissingNumbers(list);
    return list;
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
        return sanitize(decodeState(fromUrl));
      } catch (err) {
        console.warn("Could not decode roster data from URL, falling back.", err);
      }
    }

    const fromStorage = localStorage.getItem(STORAGE_KEY);
    if (fromStorage) {
      try {
        return sanitize(decodeState(fromStorage));
      } catch (err) {
        console.warn("Could not decode roster data from localStorage.", err);
      }
    }

    return [];
  }

  function persistState() {
    const encoded = encodeState(players);
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
    players.push({ id: makeId(), name: name.trim(), bench: true, number: nextAvailableNumber() });
    render();
    persistState();
  }

  function setPlayerNumber(id, rawValue) {
    const player = players.find((p) => p.id === id);
    if (player) {
      const parsed = parseInt(rawValue, 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        player.number = parsed;
      }
    }
    editingNumberId = null;
    render();
    persistState();
  }

  function removePlayer(id) {
    players = players.filter((p) => p.id !== id);
    render();
    persistState();
  }

  function movePlayer(id, bench, index) {
    const dragged = players.find((p) => p.id === id);
    if (!dragged) return;

    const activeList = players.filter((p) => !p.bench && p.id !== id);
    const benchList = players.filter((p) => p.bench && p.id !== id);

    dragged.bench = bench;
    if (bench) {
      benchList.splice(index, 0, dragged);
    } else {
      activeList.splice(index, 0, dragged);
    }

    players = [...activeList, ...benchList];
    render();
    persistState();
  }

  // ---------- rendering ----------

  function render() {
    listEl.innerHTML = "";

    const active = players.filter((p) => !p.bench);
    const bench = players.filter((p) => p.bench);

    listEl.appendChild(sectionLabel("Active Roster"));
    if (active.length === 0) {
      listEl.appendChild(emptyRow("No active players. Drag a player above the line to activate them."));
    } else {
      active.forEach((player) => listEl.appendChild(createRow(player)));
    }

    listEl.appendChild(createDivider());

    if (bench.length === 0) {
      listEl.appendChild(emptyRow("No players on the bench."));
    } else {
      bench.forEach((player) => listEl.appendChild(createRow(player)));
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

  function createDivider() {
    const el = document.createElement("div");
    el.className = "divider-row";

    const lineLeft = document.createElement("span");
    lineLeft.className = "divider-line";
    el.appendChild(lineLeft);

    const label = document.createElement("span");
    label.className = "divider-label";
    label.textContent = "Bench";
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

  function createNumberEl(player) {
    if (editingNumberId === player.id) {
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
    badge.textContent = `#${player.number}`;
    badge.title = "Click to change number";
    badge.addEventListener("pointerdown", (e) => e.stopPropagation());
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      editingNumberId = player.id;
      render();
    });
    return badge;
  }

  function createRow(player) {
    const row = document.createElement("div");
    row.className = "player-row";
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
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const row = e.currentTarget;
    const id = row.dataset.id;
    const rect = row.getBoundingClientRect();

    const others = [];
    for (const el of listEl.children) {
      if (el === row) continue;
      if (el.classList.contains("player-row")) {
        const player = players.find((p) => p.id === el.dataset.id);
        others.push({ type: "player", bench: player ? player.bench : true, el, rect: el.getBoundingClientRect() });
      } else if (el.classList.contains("divider-row")) {
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
    const dividerPos = others.findIndex((o) => o.type === "divider");

    let bench;
    let targetIndex;
    if (dividerPos === -1 || index <= dividerPos) {
      bench = false;
      targetIndex = index;
    } else {
      bench = true;
      targetIndex = index - dividerPos - 1;
    }

    ghost.remove();
    indicator.remove();
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    drag = null;

    movePlayer(id, bench, targetIndex);
  }

  // ---------- misc UI ----------

  addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    addPlayer(name);
    nameInput.value = "";
    nameInput.focus();
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
    if (players.length === 0) return;
    if (!confirm("Remove all players from the roster and bench?")) return;
    players = [];
    render();
    persistState();
  });

  // ---------- init ----------

  players = loadInitialState();
  render();
  persistState();
})();
