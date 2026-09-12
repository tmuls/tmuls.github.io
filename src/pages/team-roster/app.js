(() => {
  "use strict";

  const STORAGE_KEY = "teamRosterData";
  const URL_PARAM = "data";

  const rosterField = document.getElementById("roster-field");
  const benchList = document.getElementById("bench-list");
  const addForm = document.getElementById("add-form");
  const nameInput = document.getElementById("player-name");
  const shareBtn = document.getElementById("share-btn");
  const resetBtn = document.getElementById("reset-btn");

  /** @type {{ id: string, name: string, bench: boolean, x: number, y: number }[]} */
  let players = [];

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

  function loadInitialState() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get(URL_PARAM);

    if (fromUrl) {
      try {
        return decodeState(fromUrl);
      } catch (err) {
        console.warn("Could not decode roster data from URL, falling back.", err);
      }
    }

    const fromStorage = localStorage.getItem(STORAGE_KEY);
    if (fromStorage) {
      try {
        return decodeState(fromStorage);
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
    players.push({
      id: makeId(),
      name: name.trim(),
      bench: true,
      x: 50,
      y: 50,
    });
    render();
    persistState();
  }

  function removePlayer(id) {
    players = players.filter((p) => p.id !== id);
    render();
    persistState();
  }

  function movePlayerToRoster(id, x, y) {
    const player = players.find((p) => p.id === id);
    if (!player) return;
    player.bench = false;
    player.x = clamp(x, 3, 97);
    player.y = clamp(y, 3, 97);
    render();
    persistState();
  }

  function movePlayerToBench(id, beforeId) {
    const idx = players.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const [player] = players.splice(idx, 1);
    player.bench = true;

    if (beforeId) {
      const targetIdx = players.findIndex((p) => p.id === beforeId);
      players.splice(targetIdx === -1 ? players.length : targetIdx, 0, player);
    } else {
      players.push(player);
    }

    render();
    persistState();
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  // ---------- rendering ----------

  function render() {
    rosterField.querySelectorAll(".chip").forEach((el) => el.remove());
    benchList.querySelectorAll(".chip, .bench-empty").forEach((el) => el.remove());

    const rosterPlayers = players.filter((p) => !p.bench);
    const benchPlayers = players.filter((p) => p.bench);

    rosterPlayers.forEach((player) => {
      const chip = createChip(player);
      chip.style.left = `${player.x}%`;
      chip.style.top = `${player.y}%`;
      rosterField.appendChild(chip);
    });

    if (benchPlayers.length === 0) {
      const empty = document.createElement("div");
      empty.className = "bench-empty";
      empty.textContent = "No players on the bench.";
      benchList.appendChild(empty);
    } else {
      benchPlayers.forEach((player) => {
        benchList.appendChild(createChip(player));
      });
    }
  }

  function createChip(player) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.dataset.id = player.id;

    const label = document.createElement("span");
    label.textContent = player.name;
    chip.appendChild(label);

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
    chip.appendChild(removeBtn);

    chip.addEventListener("pointerdown", onChipPointerDown);

    return chip;
  }

  // ---------- drag interaction (pointer events, works for mouse & touch) ----------

  let drag = null;

  function onChipPointerDown(e) {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;

    const chip = e.currentTarget;
    const id = chip.dataset.id;
    const rect = chip.getBoundingClientRect();

    const ghost = chip.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.style.width = `${rect.width}px`;
    document.body.appendChild(ghost);

    drag = {
      id,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      ghost,
      originEl: chip,
    };

    chip.classList.add("dragging");
    positionGhost(e.clientX, e.clientY);

    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
    e.preventDefault();
  }

  function positionGhost(clientX, clientY) {
    if (!drag) return;
    drag.ghost.style.left = `${clientX - drag.offsetX}px`;
    drag.ghost.style.top = `${clientY - drag.offsetY}px`;
  }

  function onDragMove(e) {
    if (!drag) return;
    positionGhost(e.clientX, e.clientY);

    rosterField.classList.remove("drag-over");
    benchList.classList.remove("drag-over");

    const target = elementUnderGhost(e.clientX, e.clientY);
    if (target === rosterField || rosterField.contains(target)) {
      rosterField.classList.add("drag-over");
    } else if (target === benchList || benchList.contains(target)) {
      benchList.classList.add("drag-over");
    }
  }

  function elementUnderGhost(clientX, clientY) {
    drag.ghost.style.visibility = "hidden";
    const el = document.elementFromPoint(clientX, clientY);
    drag.ghost.style.visibility = "visible";
    return el;
  }

  function onDragEnd(e) {
    if (!drag) return;
    const { id, ghost, originEl } = drag;

    const target = elementUnderGhost(e.clientX, e.clientY);
    const droppedOnRoster = target === rosterField || rosterField.contains(target);
    const droppedOnBench = target === benchList || benchList.contains(target);

    if (droppedOnRoster) {
      const rect = rosterField.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      movePlayerToRoster(id, x, y);
    } else if (droppedOnBench) {
      const beforeChip = target.closest ? target.closest(".chip") : null;
      movePlayerToBench(id, beforeChip && beforeChip.dataset.id !== id ? beforeChip.dataset.id : null);
    } else {
      originEl.classList.remove("dragging");
    }

    ghost.remove();
    rosterField.classList.remove("drag-over");
    benchList.classList.remove("drag-over");
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    drag = null;
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
