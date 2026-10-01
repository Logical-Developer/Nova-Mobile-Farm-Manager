// ==UserScript==
// @name         Nova Farm Manager Mobile
// @name:fa      نوا فارم منیجر موبایل
// @namespace    local.travian.nova.farmmanager.mobile
// @version      2.0.0
// @description  Mobile-only farm manager with multi-list support, resume per list, and safer import/export.
// @author       Nova
// @match        https://*.travian.com/*
// @match        https://*.traviantop.com/*
// @match        https://*.international.travian.com/*
// @match        https://*.arabics.travian.com/*
// @match        https://*.america.travian.com/*
// @match        https://*.europe.travian.com/*
// @match        https://*.asia.travian.com/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/YOUR_USERNAME/Nova-Mobile-Farm-Manager/main/Nova-FarmManager-Mobile.user.js
// @downloadURL  https://raw.githubusercontent.com/YOUR_USERNAME/Nova-Mobile-Farm-Manager/main/Nova-FarmManager-Mobile.user.js
// ==/UserScript==

(function () {
  "use strict";

  const VERSION = "2.0.0";
  const STORAGE_KEY = "travian_farm_manager_mobile_v2";
  const RUNS_KEY = "travian_farm_manager_mobile_runs_v2";
  const MAP_BOX_ID = "fm_map_box_v2";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));
  const cleanText = (value) =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  const safeJsonParse = (raw, fallback) => {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  };

  function isMobilePage() {
    const pathname = location.pathname || "";
    return (
      pathname.includes("karte.php") ||
      pathname.includes("build.php") ||
      pathname.includes("dorf1.php") ||
      pathname.includes("dorf2.php")
    );
  }

  function getVillageIdFromPage() {
    const url = new URL(location.href);
    const param = url.searchParams.get("newdid");
    if (param && /^\d+$/.test(param)) return String(param);

    const active = document.querySelector(
      "#sidebarBoxVillageList .listEntry.active[data-did]",
    );
    if (active) return String(active.getAttribute("data-did"));

    const match = document.body?.textContent?.match(/villageId[\s:=]+(\d+)/i);
    if (match) return String(match[1]);

    return "current";
  }

  function getCurrentVillageId() {
    return String(getVillageIdFromPage());
  }

  function normalizeTarget(target) {
    if (!target || typeof target !== "object") return null;
    const x = Number(target.x);
    const y = Number(target.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      x,
      y,
      name: cleanText(target.name || ""),
      key: `${x}|${y}`,
    };
  }

  function readStorage() {
    const fallback = {
      version: 2,
      villages: {},
    };

    const parsed = safeJsonParse(localStorage.getItem(STORAGE_KEY), fallback);
    if (!parsed || typeof parsed !== "object") return fallback;
    parsed.villages = parsed.villages || {};
    return parsed;
  }

  function writeStorage(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function ensureVillageRecord(villageId) {
    const storage = readStorage();
    const key = String(villageId || getCurrentVillageId());
    if (!storage.villages[key]) {
      storage.villages[key] = {
        id: key,
        lists: [
          {
            id: "list_1",
            name: "List 1",
            targets: [],
          },
        ],
        activeListId: "list_1",
      };
      writeStorage(storage);
    }
    return storage.villages[key];
  }

  function getVillageLists(villageId) {
    const record = ensureVillageRecord(villageId);
    return record.lists || [];
  }

  function getListById(villageId, listId) {
    const list = getVillageLists(villageId).find(
      (entry) => String(entry.id) === String(listId),
    );
    return list || null;
  }

  function getSelectedList(villageId) {
    const record = ensureVillageRecord(villageId);
    const listId =
      record.activeListId ||
      (record.lists[0] && record.lists[0].id) ||
      "list_1";
    return getListById(villageId, listId);
  }

  function createList(villageId, name = "List", baseIndex = 1) {
    const storage = readStorage();
    const key = String(villageId || getCurrentVillageId());
    const record = storage.villages[key] || {
      id: key,
      lists: [],
      activeListId: null,
    };
    const nextId = `list_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const safeName = cleanText(name) || `List ${baseIndex}`;
    record.lists.push({
      id: nextId,
      name: safeName,
      targets: [],
    });
    record.activeListId = nextId;
    storage.villages[key] = record;
    writeStorage(storage);
    return record.lists[record.lists.length - 1];
  }

  function renameList(villageId, listId, newName) {
    const storage = readStorage();
    const key = String(villageId || getCurrentVillageId());
    const record = storage.villages[key];
    if (!record) return false;
    const target = record.lists.find(
      (list) => String(list.id) === String(listId),
    );
    if (!target) return false;
    target.name = cleanText(newName) || target.name;
    writeStorage(storage);
    return true;
  }

  function deleteList(villageId, listId) {
    const storage = readStorage();
    const key = String(villageId || getCurrentVillageId());
    const record = storage.villages[key];
    if (!record) return false;
    const filtered = record.lists.filter(
      (list) => String(list.id) !== String(listId),
    );
    if (filtered.length === record.lists.length) return false;
    record.lists = filtered;
    if (!record.lists.length) {
      record.lists.push({ id: "list_1", name: "List 1", targets: [] });
    }
    if (record.activeListId === listId) {
      record.activeListId = record.lists[0].id;
    }
    storage.villages[key] = record;
    writeStorage(storage);
    return true;
  }

  function listContainsTarget(list, target) {
    if (!list || !Array.isArray(list.targets)) return false;
    const key = target.key || `${target.x}|${target.y}`;
    return list.targets.some((entry) => `${entry.x}|${entry.y}` === key);
  }

  function addTargetToList(villageId, listId, target) {
    const normalized = normalizeTarget(target);
    if (!normalized) return false;
    const storage = readStorage();
    const key = String(villageId || getCurrentVillageId());
    const record = storage.villages[key];
    if (!record) return false;
    const list = record.lists.find(
      (entry) => String(entry.id) === String(listId),
    );
    if (!list) return false;
    if (!list.targets) list.targets = [];
    if (!listContainsTarget(list, normalized)) {
      list.targets.push({
        x: normalized.x,
        y: normalized.y,
        name: normalized.name || "",
      });
      writeStorage(storage);
      return true;
    }
    return false;
  }

  function removeTargetFromList(villageId, listId, target) {
    const normalized = normalizeTarget(target);
    if (!normalized) return false;
    const storage = readStorage();
    const key = String(villageId || getCurrentVillageId());
    const record = storage.villages[key];
    if (!record) return false;
    const list = record.lists.find(
      (entry) => String(entry.id) === String(listId),
    );
    if (!list || !list.targets) return false;
    const before = list.targets.length;
    list.targets = list.targets.filter(
      (entry) => `${entry.x}|${entry.y}` !== normalized.key,
    );
    const changed = list.targets.length !== before;
    if (changed) writeStorage(storage);
    return changed;
  }

  function getVillageNameFromMap() {
    const titleElement = document.querySelector("#tileDetails .titleInHeader");
    if (!titleElement) return "Unknown village";
    const nameText = titleElement.cloneNode(true);
    nameText.querySelector(".mainVillage")?.remove();
    nameText.querySelector(".clear")?.remove();
    nameText.querySelector(".coordinatesWrapper")?.remove();
    return cleanText(nameText.textContent || "Unknown village");
  }

  function getMapTargetFromPage() {
    const title = document.querySelector("#tileDetails .titleInHeader");
    if (!title) return null;
    const coordsText =
      title.querySelector(".coordinatesWrapper")?.textContent || "";
    const match = coordsText.match(/[-+]?\d+/g);
    const x = match && match[0] ? Number(match[0]) : NaN;
    const y = match && match[1] ? Number(match[1]) : NaN;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      x,
      y,
      name: getVillageNameFromMap(),
      key: `${x}|${y}`,
    };
  }

  function readRuns() {
    return safeJsonParse(sessionStorage.getItem(RUNS_KEY), {});
  }

  function writeRuns(data) {
    sessionStorage.setItem(RUNS_KEY, JSON.stringify(data));
  }

  function getRunKey(villageId, listId) {
    return `${String(villageId)}:${String(listId)}`;
  }

  function readRunForList(villageId, listId) {
    const data = readRuns();
    return data[getRunKey(villageId, listId)] || null;
  }

  function writeRunForList(villageId, listId, value) {
    const data = readRuns();
    data[getRunKey(villageId, listId)] = value;
    writeRuns(data);
  }

  function removeRunForList(villageId, listId) {
    const data = readRuns();
    const key = getRunKey(villageId, listId);
    if (data[key]) delete data[key];
    writeRuns(data);
  }

  function readCurrentListForRun(villageId) {
    const record = ensureVillageRecord(villageId);
    const listId = record.activeListId;
    return listId ? getListById(villageId, listId) : null;
  }

  function renderPauseRunSummary() {
    const panel = document.querySelector("#farmManagerPausedRuns");
    if (!panel) return;
    const villageId = getCurrentVillageId();
    const runs = readRuns();
    const current = Object.entries(runs).filter(([key]) =>
      key.startsWith(`${villageId}:`),
    );

    if (!current.length) {
      panel.innerHTML = '<div class="fm-muted">No paused runs</div>';
      return;
    }

    const html = current
      .map(([key, run]) => {
        const [runVillageId, listId] = key.split(":");
        const list = getListById(runVillageId, listId);
        const label = list ? list.name : "List";
        return `
        <div class="fm-run-row" style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid rgba(0,0,0,.08);">
          <span>${escapeHtml(label)} (${runVillageId})</span>
          <div>
            <button type="button" data-fm-resume="${runVillageId}|${listId}" style="margin-left:4px;">Resume</button>
            <button type="button" data-fm-stop-run="${runVillageId}|${listId}" style="margin-left:4px;">Discard</button>
          </div>
        </div>
      `;
      })
      .join("");

    panel.innerHTML = html;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function createListTabBar(villageId) {
    const wrap = document.querySelector("#fm_rally_list_tabs");
    if (!wrap) return;
    const record = ensureVillageRecord(villageId);
    if (!record.lists || !record.lists.length) return;

    const html = record.lists
      .map((list) => {
        const active =
          String(record.activeListId) === String(list.id)
            ? "background:#dfe8ff;"
            : "background:#f3f6ff;";
        return `
        <div class="fm-tab-item" data-fm-tab-id="${list.id}" style="display:flex;align-items:center;justify-content:space-between;gap:5px;padding:5px 7px;border:1px solid #b7c3df;border-radius:4px;${active};">
          <span class="fm-tab-name">${escapeHtml(list.name)} (${list.targets?.length || 0})</span>
          <span class="fm-tab-actions" style="display:flex;gap:4px;">
            <button type="button" data-fm-rename="${list.id}" title="Rename list">✎</button>
            <button type="button" data-fm-delete="${list.id}" title="Delete list">×</button>
          </span>
        </div>
      `;
      })
      .join("");

    wrap.innerHTML = html;
  }

  function bindListTabActions(villageId) {
    const wrap = document.querySelector("#fm_rally_list_tabs");
    if (!wrap) return;
    wrap.querySelectorAll("[data-fm-rename]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const listId = button.getAttribute("data-fm-rename");
        const list = getListById(villageId, listId);
        if (!list) return;
        const next = prompt("Rename list", list.name);
        if (next !== null) renameList(villageId, listId, next);
        createListTabBar(villageId);
      });
    });

    wrap.querySelectorAll("[data-fm-delete]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const listId = button.getAttribute("data-fm-delete");
        const list = getListById(villageId, listId);
        if (!list) return;
        const ok = confirm(`Delete list "${list.name}"?`);
        if (ok) {
          deleteList(villageId, listId);
        }
        createListTabBar(villageId);
      });
    });

    wrap.querySelectorAll(".fm-tab-item").forEach((item) => {
      item.addEventListener("click", (event) => {
        if (event.target.closest("button")) return;
        const listId = item.getAttribute("data-fm-tab-id");
        const storage = readStorage();
        const record =
          storage.villages[String(villageId)] || ensureVillageRecord(villageId);
        record.activeListId = listId;
        storage.villages[String(villageId)] = record;
        writeStorage(storage);
        createListTabBar(villageId);
      });
    });
  }

  function parseImportText(text) {
    const trimmed = cleanText(text);
    if (!trimmed) return { action: "add", targets: [] };

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.targets)) {
          return {
            action: parsed.action || "add",
            targets: parsed.targets.map(normalizeTarget).filter(Boolean),
          };
        }
        if (Array.isArray(parsed.list?.targets)) {
          return {
            action: "add",
            targets: parsed.list.targets.map(normalizeTarget).filter(Boolean),
          };
        }
      }
    } catch (error) {
      // continue with simple text parsing below
    }

    const lines = trimmed.split(/\r?\n/);
    const targets = [];
    for (const line of lines) {
      const s = cleanText(line);
      if (!s) continue;
      const match = s.match(/(-?\d+)\s*\|\s*(-?\d+)/);
      if (match) {
        targets.push({
          x: Number(match[1]),
          y: Number(match[2]),
          name: s.replace(match[0], "").trim(),
        });
        continue;
      }
      const coords = s.match(/(-?\d+)\s*[,;\s]\s*(-?\d+)/);
      if (coords) {
        targets.push({
          x: Number(coords[1]),
          y: Number(coords[2]),
          name: s.replace(coords[0], "").trim(),
        });
      }
    }
    return {
      action: "add",
      targets: targets.map(normalizeTarget).filter(Boolean),
    };
  }

  function applyBulkImport(villageId, listId, text) {
    const { action, targets } = parseImportText(text);
    const storage = readStorage();
    const record =
      storage.villages[String(villageId)] || ensureVillageRecord(villageId);
    const list = record.lists.find(
      (entry) => String(entry.id) === String(listId),
    );
    if (!list) return { ok: false, message: "List not found" };

    list.targets = list.targets || [];
    const existing = new Set(list.targets.map((item) => `${item.x}|${item.y}`));
    const valid = targets.filter((t) => !!t);

    if (action === "remove") {
      const before = list.targets.length;
      list.targets = list.targets.filter(
        (item) =>
          !existing.has(`${item.x}|${item.y}`) ||
          !valid.some(
            (target) => `${target.x}|${target.y}` === `${item.x}|${item.y}`,
          ),
      );
      writeStorage(storage);
      return {
        ok: true,
        action: "remove",
        count: before - list.targets.length,
      };
    }

    valid.forEach((target) => {
      const key = `${target.x}|${target.y}`;
      if (!existing.has(key)) {
        list.targets.push({
          x: target.x,
          y: target.y,
          name: target.name || "",
        });
        existing.add(key);
      }
    });

    writeStorage(storage);
    return { ok: true, action: "add", count: valid.length };
  }

  function injectMapFarmBox() {
    const existing = document.getElementById(MAP_BOX_ID);
    if (existing) return existing;

    const mapDetails = document.querySelector("#map_details");
    if (!mapDetails) return null;

    const target = getMapTargetFromPage();
    const villageId = getCurrentVillageId();
    const record = ensureVillageRecord(villageId);
    const lists = record.lists || [];
    const currentList = record.activeListId
      ? getListById(villageId, record.activeListId)
      : lists[0] || null;
    const selectedListId = currentList
      ? currentList.id
      : (lists[0] && lists[0].id) || "list_1";
    const alreadyIn =
      target &&
      currentList &&
      currentList.targets &&
      currentList.targets.some(
        (entry) => `${entry.x}|${entry.y}` === `${target.x}|${target.y}`,
      );

    const box = document.createElement("div");
    box.id = MAP_BOX_ID;
    box.className = "fm-map-box";
    box.style.cssText =
      "margin:12px 0 0; padding:12px; background:linear-gradient(#f5f8ff,#e3ecf7); border:1px solid #8a9ac0; border-radius:5px; font-family:Verdana,sans-serif; font-size:12px; color:#1a2050; box-sizing:border-box; max-width:600px; width:100%;";

    const optionsHtml = lists
      .map(
        (list) =>
          `<option value="${list.id}" ${String(list.id) === String(selectedListId) ? "selected" : ""}>${escapeHtml(list.name)} (${list.targets?.length || 0})</option>`,
      )
      .join("");

    box.innerHTML = `
      <div style="font-weight:bold;color:#2a4a70;margin-bottom:8px;display:flex;align-items:center;gap:6px;font-size:13px;">
        <span>Farm Manager (v${VERSION})</span>
        <span style="font-size:10px;color:#6a7a98;font-weight:normal;">mobile</span>
      </div>
      <div class="fm-map-fields">
        <label style="display:block;margin-bottom:6px;">
          <span style="display:inline-block;width:55px;font-weight:bold;">List:</span>
          <select class="fm-map-list" style="width:calc(100% - 110px);padding:3px;font-size:12px;">${optionsHtml}</select>
          <button type="button" class="fm-map-newlist" style="font-size:11px;margin-left:6px;color:#2a5a10;font-weight:bold;">+ new</button>
        </label>
        <div class="fm-map-status" style="margin-bottom:6px;font-size:10px;font-style:italic;color:#8a7050;display:block;">${alreadyIn ? "Already in: <b>" + escapeHtml(currentList?.name || "list") + "</b>" : "Not in current list"}</div>
        <div class="fm-map-troops" style="margin-top:8px;padding:8px;background:rgba(255,255,255,.55);border-radius:4px;">
          <div style="display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));gap:4px;">
            <label style="display:flex;align-items:center;gap:2px;font-size:11px;padding:2px 1px;min-width:0;">
              <span style="display:inline-block;width:14px;font-weight:bold;text-align:right;">1</span>
              <img class="unit u21" src="/img/x.gif" alt="Phalanx" title="Phalanx" style="width:18px;height:18px;vertical-align:middle;">
              <input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" class="fm-t-t1" value="0" maxlength="3" style="width:48px;min-width:0;padding:2px 4px;font-size:11px;text-align:center;border:1px solid #8a9ac0;border-radius:3px;box-sizing:border-box;">
            </label>
            <label style="display:flex;align-items:center;gap:2px;font-size:11px;padding:2px 1px;min-width:0;">
              <span style="display:inline-block;width:14px;font-weight:bold;text-align:right;">2</span>
              <img class="unit u22" src="/img/x.gif" alt="Swordsman" title="Swordsman" style="width:18px;height:18px;vertical-align:middle;">
              <input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" class="fm-t-t2" value="0" maxlength="3" style="width:48px;min-width:0;padding:2px 4px;font-size:11px;text-align:center;border:1px solid #8a9ac0;border-radius:3px;box-sizing:border-box;">
            </label>
            <label style="display:flex;align-items:center;gap:2px;font-size:11px;padding:2px 1px;min-width:0;">
              <span style="display:inline-block;width:14px;font-weight:bold;text-align:right;">3</span>
              <img class="unit u23" src="/img/x.gif" alt="Pathfinder" title="Pathfinder" style="width:18px;height:18px;vertical-align:middle;">
              <input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" class="fm-t-t3" value="0" maxlength="3" style="width:48px;min-width:0;padding:2px 4px;font-size:11px;text-align:center;border:1px solid #8a9ac0;border-radius:3px;box-sizing:border-box;">
            </label>
            <label style="display:flex;align-items:center;gap:2px;font-size:11px;padding:2px 1px;min-width:0;">
              <span style="display:inline-block;width:14px;font-weight:bold;text-align:right;">4</span>
              <img class="unit u24" src="/img/x.gif" alt="Theutates Thunder" title="Theutates Thunder" style="width:18px;height:18px;vertical-align:middle;">
              <input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" class="fm-t-t4" value="0" maxlength="3" style="width:48px;min-width:0;padding:2px 4px;font-size:11px;text-align:center;border:1px solid #8a9ac0;border-radius:3px;box-sizing:border-box;">
            </label>
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:space-between;margin-top:8px;">
          <button type="button" class="fm-map-save" style="flex:1;">Add to list</button>
          <button type="button" class="fm-map-remove" style="flex:1;">Remove from list</button>
        </div>
      </div>
    `;

    const select = box.querySelector(".fm-map-list");
    const saveBtn = box.querySelector(".fm-map-save");
    const removeBtn = box.querySelector(".fm-map-remove");
    const newBtn = box.querySelector(".fm-map-newlist");

    if (select) {
      select.addEventListener("change", () => {
        const record = ensureVillageRecord(villageId);
        record.activeListId = select.value;
        writeStorage({
          ...readStorage(),
          villages: { ...readStorage().villages, [String(villageId)]: record },
        });
      });
    }

    const onAdd = () => {
      const target = getMapTargetFromPage();
      if (!target) return;
      const listId = select ? select.value : selectedListId;
      const values = Array.from({ length: 4 }, (_, index) =>
        Number(box.querySelector(`.fm-t-t${index + 1}`)?.value || 0),
      );
      addTargetToList(villageId, listId, target);
      if (values.some((value) => value > 0)) {
        writeRunForList(villageId, listId, {
          timestamp: Date.now(),
          counts: values,
          target: target.name || "Map target",
        });
      }
      box.querySelector(".fm-map-status").innerHTML =
        `Added to: <b>${escapeHtml(getListById(villageId, listId)?.name || "List")}</b>`;
    };

    saveBtn?.addEventListener("click", onAdd);

    removeBtn?.addEventListener("click", () => {
      const target = getMapTargetFromPage();
      if (!target) return;
      const listId = select ? select.value : selectedListId;
      const removed = removeTargetFromList(villageId, listId, target);
      box.querySelector(".fm-map-status").innerHTML = removed
        ? "Removed from current list"
        : "Not found in selected list";
    });

    newBtn?.addEventListener("click", () => {
      const name = prompt("New farm list name", `List ${lists.length + 1}`);
      if (name !== null) {
        const list = createList(villageId, name);
        const newSelect = box.querySelector(".fm-map-list");
        if (newSelect) {
          const option = document.createElement("option");
          option.value = list.id;
          option.textContent = `${list.name} (${list.targets?.length || 0})`;
          option.selected = true;
          newSelect.appendChild(option);
        }
      }
    });

    const clear = document.querySelector("#tileDetails .clear");
    if (clear) {
      clear.parentNode.insertBefore(box, clear);
    } else {
      mapDetails.parentNode.insertBefore(box, mapDetails.nextSibling);
    }

    return box;
  }

  function ensureRallyPanel() {
    if (!document.querySelector("#fm_rally_list_tabs")) {
      const panel = document.createElement("div");
      panel.id = "fm_rally_list_tabs";
      panel.style.cssText =
        "display:flex;flex-direction:column;gap:8px;margin:10px 0;";
      const root =
        document.querySelector(".farmList") ||
        document.querySelector("#raidList") ||
        document.querySelector(".content") ||
        document.body;
      root.appendChild(panel);
    }

    if (!document.querySelector("#farmManagerPausedRuns")) {
      const paused = document.createElement("div");
      paused.id = "farmManagerPausedRuns";
      paused.style.cssText =
        "margin-top:12px;padding:8px;border:1px solid #d1d7eb;border-radius:5px;background:#f8faff;";
      const root =
        document.querySelector(".farmList") ||
        document.querySelector("#raidList") ||
        document.querySelector(".content") ||
        document.body;
      root.appendChild(paused);
    }
  }

  function renderRallyPanel() {
    const villageId = getCurrentVillageId();
    ensureRallyPanel();
    createListTabBar(villageId);
    bindListTabActions(villageId);
    renderPauseRunSummary();
  }

  function handleMutationObserver() {
    const targetNode = document.body;
    if (!targetNode) return;
    const observer = new MutationObserver(() => {
      if (document.querySelector("#map_details")) {
        injectMapFarmBox();
      }
      if (
        document.querySelector(".farmList") ||
        document.querySelector("#raidList")
      ) {
        renderRallyPanel();
      }
    });
    observer.observe(targetNode, { childList: true, subtree: true });
  }

  function install() {
    if (!isMobilePage()) return;
    try {
      window.addEventListener("load", () => {
        if (document.querySelector("#map_details")) injectMapFarmBox();
        if (
          document.querySelector(".farmList") ||
          document.querySelector("#raidList")
        )
          renderRallyPanel();
      });
      handleMutationObserver();
    } catch (error) {
      console.warn("[Nova FM Mobile]", error);
    }
  }

  install();
})();
