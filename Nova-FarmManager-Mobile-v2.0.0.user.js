// ==UserScript==
// @name         Nova Farm Manager Mobile (v2.0.0)
// @name:fa      نوا فارم منیجر موبایل
// @namespace    local.travian.nova.farmmanager.mobile
// @version      2.0.0
// @description  Standalone Farm Manager for Travian Legends on mobile.
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
// @updateURL    https://raw.githubusercontent.com/Logical-Developer/Nova-Mobile-Farm-Manager/main/Nova-FarmManager-Mobile-v2.0.0.user.js
// @downloadURL  https://raw.githubusercontent.com/Logical-Developer/Nova-Mobile-Farm-Manager/main/Nova-FarmManager-Mobile-v2.0.0.user.js
// ==/UserScript==

(function () {
  "use strict";

  const VERSION = "2.0.0";
  const STORAGE_KEY = "travian_farm_manager_mobile_v1";
  const BACKUP_KEY = "travian_farm_manager_mobile_v2_backups";
  const STORAGE_VER = 1;
  const RUNS_KEY = "fm_mobile_runs_v2";
  const ACTIVE_RUN_KEY = "fm_mobile_active_run_v2";
  const LEGACY_RUN_KEY = "fm_mobile_run_v1";
  const DEBUG_KEY = "fm_mobile_debug_v1";
  const STOP_KEY = "fm_stop_requested_v1";
  const MAP_COLLAPSED_KEY = "fm_map_collapsed_v1";
  const POLL_MS = 1000;
  const STUCK_MS = 15000;
  const MAX_RETRIES = 2;
  const DEBUG = true;

  const TROOP_KEYS = [
    "t1",
    "t2",
    "t3",
    "t4",
    "t5",
    "t6",
    "t7",
    "t8",
    "t9",
    "t10",
    "t11",
  ];
  const TROOP_LABELS = {
    t1: "Phalanx",
    t2: "Swordsman",
    t3: "Pathfinder",
    t4: "Theutates Thunder",
    t5: "Druidrider",
    t6: "Haeduan",
    t7: "Ram",
    t8: "Trebuchet",
    t9: "Chieftain",
    t10: "Settler",
    t11: "Hero",
  };
  const TROOP_ICON_CLASS = {
    t1: "u21",
    t2: "u22",
    t3: "u23",
    t4: "u24",
    t5: "u25",
    t6: "u26",
    t7: "u27",
    t8: "u28",
    t9: "u29",
    t10: "u30",
    t11: "uhero",
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const now = () => Date.now();
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const uid = (p = "id") => p + "_" + Math.random().toString(36).slice(2, 9);
  const esc = (s) =>
    String(s == null ? "" : s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const cleanNum = (s) =>
    String(s || "")
      .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\ufeff]/g, "")
      .replace(/−/g, "-")
      .replace(/[^\d-]/g, "");
  const cleanInt = (s) => {
    const n = cleanNum(s);
    return n === "" || n === "-" ? null : parseInt(n, 10);
  };

  function isStopRequested() {
    try {
      return sessionStorage.getItem(STOP_KEY) === "1";
    } catch {
      return false;
    }
  }
  function requestStop() {
    try {
      sessionStorage.setItem(STOP_KEY, "1");
    } catch {}
  }
  function clearStopRequest() {
    try {
      sessionStorage.removeItem(STOP_KEY);
    } catch {}
  }

  // ─── Logger ───
  const _logBuf = [];
  function isDebugEnabled() {
    try {
      if (sessionStorage.getItem(DEBUG_KEY) === "1") return true;
      if (sessionStorage.getItem(DEBUG_KEY) === "0") return false;
    } catch {}
    return DEBUG;
  }
  function setDebugEnabled(v) {
    try {
      sessionStorage.setItem(DEBUG_KEY, v ? "1" : "0");
    } catch {}
  }
  function log(...args) {
    const msg = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    const ts = new Date().toLocaleTimeString();
    _logBuf.push(`[${ts}] ${msg}`);
    if (_logBuf.length > 100) _logBuf.shift();
    if (isDebugEnabled())
      console.log("%c[FM]", "color:#2a7a2a;font-weight:bold", ...args);
    updateDebugBadge();
  }
  function logErr(...args) {
    const msg = args
      .map((a) => (a && a.message ? a.message : String(a)))
      .join(" ");
    const ts = new Date().toLocaleTimeString();
    _logBuf.push(`[${ts}] ✗ ${msg}`);
    if (_logBuf.length > 100) _logBuf.shift();
    console.error("%c[FM]", "color:#c04030;font-weight:bold", ...args);
    updateDebugBadge();
  }

  // ─── Storage ───
  function defaultFM() {
    return {
      _version: STORAGE_VER,
      _updatedAt: 0,
      byVillage: {},
      settings: { notificationsEnabled: true },
    };
  }
  function readFM() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultFM();
      const d = JSON.parse(raw);
      if (!d.byVillage) d.byVillage = {};
      if (!d.settings) d.settings = { notificationsEnabled: true };
      if (d.settings.notificationsEnabled === undefined)
        d.settings.notificationsEnabled = true;
      return d;
    } catch (e) {
      return defaultFM();
    }
  }
  function writeFM(d) {
    try {
      d._version = STORAGE_VER;
      d._updatedAt = now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    } catch {}
  }
  function patchFM(fn) {
    const d = readFM();
    fn(d);
    writeFM(d);
  }
  function backupFM(reason) {
    try {
      const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || "[]");
      backups.unshift({ at: now(), reason, data: readFM() });
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(0, 5)));
      return true;
    } catch (e) {
      logErr("backup failed", e);
      showToast("Backup failed; no changes made");
      return false;
    }
  }
  function getBucket(vid) {
    return readFM().byVillage[String(vid)] || null;
  }
  function ensureBucket(vid) {
    const key = String(vid);
    if (!readFM().byVillage[key]) {
      patchFM((fm) => {
        fm.byVillage[key] = {
          lists: [],
          activeListId: null,
          snapshot: null,
          snapshotAt: 0,
        };
      });
    }
    return readFM().byVillage[key];
  }

  // ─── Run State ───
  function makeRunKey(vid, listId) {
    return `${String(vid)}::${String(listId)}`;
  }
  function readRunsMap() {
    try {
      const raw = sessionStorage.getItem(RUNS_KEY);
      const runs = raw ? JSON.parse(raw) : {};
      const safeRuns =
        runs && !Array.isArray(runs) && typeof runs === "object" ? runs : {};
      const legacyRaw = sessionStorage.getItem(LEGACY_RUN_KEY);
      if (legacyRaw) {
        let legacyRun = null;
        try {
          legacyRun = JSON.parse(legacyRaw);
        } catch {}
        if (legacyRun && legacyRun.sourceVid && legacyRun.listId) {
          const key = makeRunKey(legacyRun.sourceVid, legacyRun.listId);
          if (!safeRuns[key]) safeRuns[key] = legacyRun;
          sessionStorage.setItem(RUNS_KEY, JSON.stringify(safeRuns));
          if (!legacyRun.completed) sessionStorage.setItem(ACTIVE_RUN_KEY, key);
          sessionStorage.removeItem(LEGACY_RUN_KEY);
        }
      }
      return safeRuns;
    } catch {
      return {};
    }
  }
  function writeRunsMap(runs) {
    try {
      sessionStorage.setItem(RUNS_KEY, JSON.stringify(runs));
    } catch {}
  }
  function readRunByKey(vid, listId) {
    return readRunsMap()[makeRunKey(vid, listId)] || null;
  }
  function readAllRuns() {
    return Object.entries(readRunsMap()).map(([key, run]) => ({ key, run }));
  }
  function readResumableRuns(vid) {
    const activeRun = readRun();
    if (activeRun && !activeRun.completed && !activeRun.stopped) return [];
    return readAllRuns()
      .map(({ run }) => run)
      .filter(
        (run) =>
          run &&
          run.stopped === true &&
          !run.completed &&
          (!vid || String(run.sourceVid) === String(vid)),
      );
  }
  function readRun() {
    try {
      const key = sessionStorage.getItem(ACTIVE_RUN_KEY);
      return key ? readRunsMap()[key] || null : null;
    } catch {
      return null;
    }
  }
  function writeRun(run) {
    try {
      if (run == null) {
        sessionStorage.removeItem(ACTIVE_RUN_KEY);
        return;
      }
      const runs = readRunsMap();
      const key = makeRunKey(run.sourceVid, run.listId);
      runs[key] = run;
      writeRunsMap(runs);
      sessionStorage.setItem(ACTIVE_RUN_KEY, key);
    } catch {}
  }
  function writeRunByKey(vid, listId, run) {
    const runs = readRunsMap();
    const key = makeRunKey(vid, listId);
    if (run) runs[key] = run;
    else delete runs[key];
    writeRunsMap(runs);
    try {
      if (!run && sessionStorage.getItem(ACTIVE_RUN_KEY) === key)
        sessionStorage.removeItem(ACTIVE_RUN_KEY);
    } catch {}
  }
  function clearRun(vid, listId) {
    if (vid != null && listId != null) {
      writeRunByKey(vid, listId, null);
      return;
    }
    const run = readRun();
    if (run) writeRunByKey(run.sourceVid, run.listId, null);
    else {
      try {
        sessionStorage.removeItem(ACTIVE_RUN_KEY);
      } catch {}
    }
  }
  function clearAllRuns() {
    try {
      sessionStorage.removeItem(RUNS_KEY);
      sessionStorage.removeItem(ACTIVE_RUN_KEY);
      sessionStorage.removeItem(LEGACY_RUN_KEY);
    } catch {}
  }
  function resumeSavedRun(vid, listId) {
    const run = readRunByKey(vid, listId);
    if (!run || run.completed) return false;
    const activeRun = readRun();
    if (activeRun && !activeRun.completed && !activeRun.stopped) {
      showToast(
        `Stop ${activeRun.listName || "the active run"} before resuming another list`,
      );
      return false;
    }
    clearStopRequest();
    run.stopped = false;
    run.phase = "idle";
    run.phaseAt = now();
    run.floatingDismissed = false;
    writeRun(run);
    navigateToSendForm(run.sourceVid);
    return true;
  }

  // ─── Page Detection ───
  function getVillageId() {
    try {
      const q = new URL(location.href).searchParams.get("newdid");
      if (q && /^\d+$/.test(q)) return q;
      const el = document.querySelector(
        "#sidebarBoxVillageList .listEntry.active[data-did]",
      );
      if (el) return el.getAttribute("data-did");
      const inp = document.querySelector("#villageName input[data-did]");
      if (inp && inp.dataset.did) return inp.dataset.did;
    } catch {}
    return null;
  }
  function getMyVillageCoords() {
    try {
      const el = document.querySelector("#villageName");
      if (el) {
        const x = parseInt(el.dataset.x, 10);
        const y = parseInt(el.dataset.y, 10);
        if (!isNaN(x) && !isNaN(y)) return { x, y };
      }
    } catch {}
    return null;
  }
  function getVillageName(vid) {
    try {
      const entries = $$("#sidebarBoxVillageList .listEntry[data-did]");
      for (const el of entries) {
        if (String(el.getAttribute("data-did")) === String(vid)) {
          const nameEl = el.querySelector(".name");
          if (nameEl) return nameEl.textContent.trim();
        }
      }
      const scripts = document.querySelectorAll("script");
      for (const s of scripts) {
        const t = s.textContent || "";
        if (!t.includes("VillageBoxes.render")) continue;
        const m = t.match(
          /viewData:\s*(\{[\s\S]*?\})\s*,\s*knowledgeBaseLinkPlus/,
        );
        if (m) {
          try {
            const d = JSON.parse(m[1]);
            const list = d?.ownPlayer?.villageList || [];
            for (const v of list) {
              if (String(v.id) === String(vid)) return v.name;
            }
          } catch {}
        }
      }
    } catch {}
    return "Village " + vid;
  }
  function isRallyTt0() {
    try {
      const u = new URL(location.href);
      if (!u.pathname.includes("build.php")) return false;
      if (u.searchParams.get("gid") !== "16") return false;
      const tt = u.searchParams.get("tt");
      return tt === "0" || tt === null || tt === "";
    } catch {
      return false;
    }
  }
  function isRallyOverview() {
    try {
      const u = new URL(location.href);
      return (
        u.pathname.includes("build.php") &&
        u.searchParams.get("gid") === "16" &&
        u.searchParams.get("tt") === "1"
      );
    } catch {
      return false;
    }
  }
  function isRallySend() {
    try {
      const u = new URL(location.href);
      return (
        u.pathname.includes("build.php") &&
        u.searchParams.get("gid") === "16" &&
        u.searchParams.get("tt") === "2"
      );
    } catch {
      return false;
    }
  }
  function isMapPage() {
    try {
      return new URL(location.href).pathname.includes("karte.php");
    } catch {
      return false;
    }
  }
  function detectSendTroopsForm() {
    try {
      return !!(
        document.querySelector('#troops input[name="troop[t1]"]') &&
        document.getElementById("ok")
      );
    } catch {
      return false;
    }
  }
  function detectConfirmForm() {
    try {
      return !!document.getElementById("confirmSendTroops");
    } catch {
      return false;
    }
  }
  function detectInvalidVillageError() {
    try {
      const body = (document.body.textContent || "").toLowerCase();
      if (body.includes("there is no village at these coordinates"))
        return true;
      if (body.includes("no village at these coordinates")) return true;
    } catch {}
    return false;
  }

  // ─── Troop Helpers ───
  function troopIconHTML(k, size = 16) {
    return `<img class="unit ${TROOP_ICON_CLASS[k]}" src="/img/x.gif" alt="${esc(TROOP_LABELS[k])}" title="${esc(TROOP_LABELS[k])}" style="width:${size}px;height:${size}px;vertical-align:middle;">`;
  }
  function troopsInlineHTML(troops, size = 14) {
    if (!troops) return "";
    const parts = [];
    for (const k of TROOP_KEYS) {
      const v = troops[k] | 0;
      if (!v) continue;
      parts.push(
        `<span style="display:inline-flex;align-items:center;gap:2px;background:rgba(255,255,255,.7);padding:1px 4px;border-radius:3px;" title="${esc(TROOP_LABELS[k])} ${v}">${troopIconHTML(k, size)}<b style="font-size:10px;color:#2a5a10;">${v}</b></span>`,
      );
    }
    return parts.join("");
  }

  // ─── Smart Input ───
  async function smartFillInput(input, value) {
    try {
      if (!input || input.disabled) return false;
      input.focus();
      await delay(30 + Math.random() * 50);
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      if (setter) setter.call(input, String(value));
      else input.value = String(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await delay(20 + Math.random() * 30);
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.blur();
      return true;
    } catch (e) {
      return false;
    }
  }

  // ─── Snapshot ───
  function readOwnTroopsSnapshot() {
    try {
      const tables = $$(
        ".rallyPointOverviewContainer table.troop_details, #build table.troop_details",
      );
      for (const tbl of tables) {
        const headline = tbl.querySelector("thead td.troopHeadline");
        if (!headline) continue;
        const text = (headline.textContent || "").trim().toLowerCase();
        if (!text.includes("own troops")) continue;
        const cells = $$("tbody.units.last tr td.unit", tbl);
        if (!cells.length) continue;
        const troops = {};
        for (let i = 0; i < TROOP_KEYS.length; i++) {
          const c = cells[i];
          troops[TROOP_KEYS[i]] = c
            ? parseInt((c.textContent || "").replace(/[^\d]/g, ""), 10) || 0
            : 0;
        }
        return troops;
      }
    } catch {}
    return null;
  }

  // ─── Form Filler ───
  async function fillSendTroopsForm(target, snapshot) {
    try {
      if (isStopRequested()) return { ok: false, reason: "stop-requested" };
      const troops = {};
      for (const k of TROOP_KEYS) {
        if (k === "t11") {
          if (target.heroFollow) {
            const have =
              snapshot && typeof snapshot.t11 === "number" ? snapshot.t11 : 1;
            troops.t11 = have > 0 ? 1 : 0;
          } else troops.t11 = 0;
          continue;
        }
        const want = target.troops[k] | 0;
        if (want <= 0) {
          troops[k] = 0;
          continue;
        }
        if (snapshot && typeof snapshot[k] === "number") {
          troops[k] = Math.min(want, snapshot[k] | 0);
        } else {
          troops[k] = want;
        }
      }
      const total = Object.values(troops).reduce((a, b) => a + b, 0);
      if (total === 0) return { ok: false, reason: "no-troops" };

      for (const k of TROOP_KEYS) {
        if (isStopRequested()) return { ok: false, reason: "stop-requested" };
        const inp = document.querySelector(`#troops input[name="troop[${k}]"]`);
        if (!inp || inp.disabled) continue;
        await smartFillInput(inp, troops[k]);
      }

      const xInp = document.getElementById("xCoordInput");
      const yInp = document.getElementById("yCoordInput");
      if (!xInp || !yInp) return { ok: false, reason: "no-coords-input" };
      await smartFillInput(xInp, target.x);
      await smartFillInput(yInp, target.y);

      const raidRadio = document.querySelector(
        'input[name="eventType"][value="4"]',
      );
      if (!raidRadio) return { ok: false, reason: "no-raid-radio" };
      raidRadio.checked = true;
      raidRadio.dispatchEvent(new Event("change", { bubbles: true }));

      await delay(200);
      if (
        parseInt(xInp.value, 10) !== target.x ||
        parseInt(yInp.value, 10) !== target.y
      )
        return { ok: false, reason: "coords-mismatch" };
      if (!raidRadio.checked) return { ok: false, reason: "raid-not-checked" };

      return { ok: true, troops };
    } catch (e) {
      return { ok: false, reason: "exception:" + e.message };
    }
  }
  async function clickSendButton() {
    try {
      if (isStopRequested()) return { ok: false, reason: "stop-requested" };
      const btn = document.getElementById("ok");
      if (!btn || btn.disabled) return { ok: false, reason: "no-ok-button" };
      await delay(120);
      if (isStopRequested()) return { ok: false, reason: "stop-requested" };
      btn.click();
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "exception:" + e.message };
    }
  }
  async function clickConfirmButton() {
    try {
      if (isStopRequested()) return { ok: false, reason: "stop-requested" };
      const btn = document.getElementById("confirmSendTroops");
      if (!btn) return { ok: false, reason: "no-confirm-button" };
      await delay(100);
      if (isStopRequested()) return { ok: false, reason: "stop-requested" };
      btn.click();
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "exception:" + e.message };
    }
  }

  // ─── Navigation ───
  function navigateToSendForm(vid) {
    if (isStopRequested()) {
      log("navigateToSendForm blocked by stop");
      return;
    }
    log("→ tt=2 vid=" + vid);
    location.href = `/build.php?id=39&gid=16&tt=2&newdid=${vid}`;
  }
  function navigateToTt0(vid) {
    log("→ tt=0 vid=" + vid);
    location.href = `/build.php?id=39&gid=16&tt=0&newdid=${vid}`;
  }

  // ─── Run Engine ───
  function markTargetResult(run, target, status, reason, extra = {}) {
    try {
      patchFM((fm) => {
        const b = fm.byVillage[run.sourceVid];
        if (!b) return;
        const list = b.lists.find((l) => l.id === run.listId);
        if (!list) return;
        const t = list.targets.find((x) => x.id === target.id);
        if (!t) return;
        t.status = status;
        t.lastRaid = { at: now(), status, reason: reason || null, ...extra };
        if (
          status === "failed" &&
          reason &&
          reason.includes("no-village-at-coordinates")
        ) {
          t.invalid = true;
          t.selected = false;
        }
        if (extra.partialRemaining) t.partialRemaining = extra.partialRemaining;
        else if (status === "sent") t.partialRemaining = null;
      });
      if (status === "sent") run.stats.sent++;
      else if (status === "failed") run.stats.failed++;
      else if (status === "skipped") run.stats.skipped++;
      writeRun(run);
    } catch {}
  }

  function finishRun(run, reason) {
    try {
      log("finishRun:", reason, run.stats);
      const stopReason = reason || "complete";
      run.finishedAt = now();
      run.stopReason = stopReason;
      run.finalStats = { ...run.stats };
      run.completed = true;
      run.remaining = [];
      run.current = null;
      writeRun(run);
      showFinalReport(run);
      sendNotification(run);
      removeFloatingStatus();
    } catch (e) {
      logErr("finishRun failed", e);
    }
  }

  function advanceToNext(run) {
    try {
      if (isStopRequested()) {
        log("advanceToNext: STOP");
        return;
      }
      if (run.stopped || run.completed) {
        log("advanceToNext: stopped/completed");
        return;
      }
      if (!run.remaining.length && !run.current) {
        finishRun(run, "all-done");
        return;
      }
      if (detectSendTroopsForm()) {
        setTimeout(() => {
          if (isStopRequested()) return;
          location.reload();
        }, 400);
      } else {
        setTimeout(() => {
          if (isStopRequested()) return;
          navigateToSendForm(run.sourceVid);
        }, 400);
      }
    } catch (e) {
      logErr("advanceToNext failed", e);
    }
  }

  // ★★★ CRITICAL FIX: "stopped" run نباید خودش navigate کند ★★★
  async function handlePageLoad() {
    try {
      if (isStopRequested()) {
        log("handlePageLoad: STOP requested");
        const r0 = readRun();
        const vid = (r0 && r0.sourceVid) || getVillageId() || "";
        if (isRallyTt0()) {
          clearStopRequest();
          log("at tt=0 — flag cleared");
          return;
        }
        if (vid) location.href = `/build.php?id=39&gid=16&tt=0&newdid=${vid}`;
        return;
      }

      const run = readRun();
      const onSendForm = detectSendTroopsForm();
      const onConfirmForm = detectConfirmForm();
      const onTt0Url = isRallyTt0();
      const onOverviewUrl = isRallyOverview();
      const onSendUrl = isRallySend();

      log(
        `handlePageLoad: sendForm=${onSendForm} confirm=${onConfirmForm} onTt0=${onTt0Url} hasRun=${!!run}`,
      );

      // ★★★ FIX: اگر run stopped/completed → هیچ کاری نکن (نه navigate، نه فرم) ★★★
      // فقط روی tt=0 برو که خودش می‌رود
      if (run && (run.stopped === true || run.completed === true)) {
        log(
          `run is ${run.stopped ? "stopped" : "completed"} — DOING NOTHING (waiting for user)`,
        );
        // ★ به هیچ URL دیگری نمی‌رویم. اگر کاربر در tt=2 است، خودش تصمیم می‌گیرد.
        return;
      }

      if (!run) {
        if (onTt0Url) injectPanel();
        return;
      }

      if (run.current && run.phaseAt && now() - run.phaseAt > STUCK_MS * 2) {
        log("stuck too long → skip current");
        markTargetResult(run, run.current, "failed", "timeout");
        run.current = null;
        run.phase = "idle";
        run.phaseAt = now();
        writeRun(run);
      }

      if (detectInvalidVillageError()) {
        const cur = run.current || run.remaining[0];
        log("INVALID VILLAGE ERROR");
        if (cur) {
          showToast(`⊘ Invalid: (${cur.x}|${cur.y})`, 3000);
          markTargetResult(run, cur, "failed", "no-village-at-coordinates");
        }
        run.current = null;
        run.phase = "idle";
        run.phaseAt = now();
        writeRun(run);
        setTimeout(() => {
          if (isStopRequested()) return;
          const r2 = readRun();
          if (r2 && !r2.stopped && !r2.completed)
            navigateToSendForm(r2.sourceVid);
          else if (r2) navigateToTt0(r2.sourceVid);
        }, 500);
        return;
      }

      if (onSendForm) {
        if (isStopRequested()) return;
        if (run.phase === "submitted" && run.current) {
          if (now() - run.phaseAt < 3000) return;
          run.phase = "idle";
          writeRun(run);
        }
        if (!run.current) {
          if (!run.remaining.length) {
            finishRun(run, "all-done");
            return;
          }
          run.current = run.remaining.shift();
          run.current._retries = run.current._retries || 0;
          writeRun(run);
        }
        updateFloatingStatus(run);

        const fillRes = await fillSendTroopsForm(run.current, run.snapshot);
        if (!fillRes.ok) {
          if (fillRes.reason === "stop-requested") return;
          log("fill failed:", fillRes.reason);
          markTargetResult(run, run.current, "failed", fillRes.reason);
          run.current = null;
          run.phase = "idle";
          run.phaseAt = now();
          writeRun(run);
          advanceToNext(run);
          return;
        }

        if (isStopRequested()) return;

        run.phase = "submitted";
        run.phaseAt = now();
        writeRun(run);

        const clickRes = await clickSendButton();
        if (!clickRes.ok) {
          if (clickRes.reason === "stop-requested") return;
          markTargetResult(run, run.current, "failed", clickRes.reason);
          run.current = null;
          run.phase = "idle";
          writeRun(run);
          advanceToNext(run);
          return;
        }

        setTimeout(() => {
          if (isStopRequested()) return;
          const r2 = readRun();
          if (!r2 || !r2.current || r2.phase !== "submitted") return;
          if (r2.stopped || r2.completed) return;
          if (detectSendTroopsForm()) {
            log("submit timeout → reload");
            location.reload();
          }
        }, 8000);
        return;
      }

      if (onConfirmForm) {
        if (isStopRequested()) return;
        if (run.current) {
          updateFloatingStatus(run);
          markTargetResult(run, run.current, "sent");
          run.current = null;
          run.phase = "idle";
          run.phaseAt = now();
          writeRun(run);
        }
        await clickConfirmButton();
        return;
      }

      if (onSendUrl) {
        if (isStopRequested()) return;
        if (run.current) {
          if ((run.current._retries || 0) < MAX_RETRIES) {
            run.current._retries = (run.current._retries || 0) + 1;
            writeRun(run);
            setTimeout(() => {
              if (!isStopRequested()) navigateToSendForm(run.sourceVid);
            }, 600);
            return;
          }
          markTargetResult(run, run.current, "failed", "no-confirm-form");
          run.current = null;
          writeRun(run);
        }
        if (run.remaining.length)
          setTimeout(() => {
            if (!isStopRequested()) navigateToSendForm(run.sourceVid);
          }, 800);
        else finishRun(run, "all-done");
        return;
      }

      if (onOverviewUrl) {
        if (isStopRequested()) return;
        const snap = readOwnTroopsSnapshot();
        if (snap) {
          patchFM((fm) => {
            const b = fm.byVillage[run.sourceVid];
            if (b) {
              b.snapshot = snap;
              b.snapshotAt = now();
            }
          });
          run.snapshot = snap;
          writeRun(run);
        }
        if (run.current || run.remaining.length)
          setTimeout(() => {
            if (!isStopRequested()) navigateToSendForm(run.sourceVid);
          }, 500);
        else finishRun(run, "all-done");
        return;
      }

      if (run.current || run.remaining.length) {
        setTimeout(() => {
          if (!isStopRequested()) navigateToSendForm(run.sourceVid);
        }, 1200);
      }
    } catch (e) {
      logErr("handlePageLoad failed", e);
    }
  }

  function startRun(vid, listId, mode) {
    try {
      const activeRun = readRun();
      if (activeRun && !activeRun.completed && !activeRun.stopped) {
        showToast(
          `Another run is active: ${activeRun.listName || "Farm list"}`,
        );
        return;
      }
      const pausedRun = readRunByKey(vid, listId);
      if (pausedRun && pausedRun.stopped && !pausedRun.completed) {
        resumeSavedRun(vid, listId);
        return;
      }
      clearStopRequest();
      const bucket = getBucket(vid);
      if (!bucket) {
        showToast("No data");
        return;
      }
      const list = bucket.lists.find((l) => l.id === listId);
      if (!list) {
        showToast("List not found");
        return;
      }

      let candidates = list.targets.filter(
        (t) => t.selected !== false && t.invalid !== true,
      );
      if (!candidates.length) {
        showToast("No valid targets");
        return;
      }

      let targets;
      if (mode === "resume") {
        targets = candidates.filter(
          (t) =>
            t.status === "pending" ||
            t.status === "skipped" ||
            t.status === "failed" ||
            !t.status,
        );
      } else {
        targets = candidates.filter((t) => t.status !== "sent");
      }
      if (!targets.length) {
        showToast("Nothing to send");
        return;
      }

      targets.sort((a, b) => {
        const da = a.distance == null ? 1e9 : a.distance;
        const db = b.distance == null ? 1e9 : b.distance;
        if (da !== db) return da - db;
        return (a.addedAt || 0) - (b.addedAt || 0);
      });

      let snapshot = readOwnTroopsSnapshot();
      if (!snapshot) snapshot = bucket.snapshot || null;
      if (snapshot) {
        patchFM((fm) => {
          const b = fm.byVillage[String(vid)];
          if (b) {
            b.snapshot = snapshot;
            b.snapshotAt = now();
          }
        });
      }

      const runTargets = targets.map((t) => ({
        id: t.id,
        name: t.name,
        x: t.x,
        y: t.y,
        distance: t.distance,
        troops: t.troops || list.troops,
        heroFollow:
          t.heroFollow !== undefined ? t.heroFollow : list.heroFollow === true,
        _retries: 0,
      }));

      const run = {
        runId: uid("run"),
        sourceVid: String(vid),
        sourceVillageName: getVillageName(vid),
        listId: list.id,
        listName: list.name,
        startedAt: now(),
        phaseAt: now(),
        phase: "idle",
        current: null,
        remaining: runTargets,
        totalPlanned: runTargets.length,
        snapshot: snapshot || null,
        stats: { sent: 0, failed: 0, skipped: 0 },
        completed: false,
        stopped: false,
        reportDismissed: false,
        floatingDismissed: false,
      };

      writeRun(run);
      log(
        "run started:",
        runTargets.length,
        "targets on",
        run.sourceVillageName,
      );
      showToast(
        `🚀 ${run.sourceVillageName} → ${run.listName} (${runTargets.length})`,
        3000,
      );
      setTimeout(() => navigateToSendForm(vid), 700);
    } catch (e) {
      logErr("startRun failed", e);
    }
  }

  // ─── Toast ───
  function showToast(msg, ms = 2500) {
    try {
      let el = document.getElementById("fm-toast");
      if (el) el.remove();
      el = document.createElement("div");
      el.id = "fm-toast";
      el.textContent = msg;
      el.style.cssText = `position:fixed;top:60px;left:50%;transform:translateX(-50%);background:linear-gradient(180deg,#ffe9a8,#f0c860);border:2px solid #7a5c30;border-radius:8px;padding:10px 16px;color:#5a2a08;font-weight:bold;font-size:13px;z-index:2147483647;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:90vw;text-align:center;font-family:Verdana,sans-serif;word-wrap:break-word;box-sizing:border-box;`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), ms);
    } catch {}
  }

  function updateFloatingStatus(run) {
    try {
      if (run.stopped || run.completed) {
        removeFloatingStatus();
        return;
      }
      let el = document.getElementById("fm-float");
      if (!el) {
        el = document.createElement("div");
        el.id = "fm-float";
        el.style.cssText =
          "position:fixed;top:8px;left:8px;right:8px;background:linear-gradient(180deg,rgba(249,251,255,.98),rgba(232,239,249,.98));border:2px solid #8a9ac0;border-radius:8px;padding:8px 12px;font-family:Verdana,sans-serif;font-size:12px;color:#1a2050;z-index:2147483646;box-shadow:0 4px 12px rgba(0,0,0,.3);display:flex;align-items:center;gap:8px;box-sizing:border-box;";
        document.body.appendChild(el);
      }
      const total = run.totalPlanned || 0;
      const done = run.stats.sent + run.stats.failed + run.stats.skipped;
      const pct = total ? Math.round((done / total) * 100) : 0;
      const currentName = run.current
        ? run.current.name
        : run.remaining[0]
          ? run.remaining[0].name
          : "...";
      el.innerHTML = `<div style="flex:1;min-width:0;"><div style="font-weight:bold;font-size:11px;margin-bottom:3px;">🌾 ${esc(run.sourceVillageName || "?")} · ${esc(run.listName || "?")}</div><div style="font-size:10px;color:#4a5a70;margin-bottom:3px;">${done}/${total} (${pct}%)</div><div style="height:4px;background:#d0d8e8;border-radius:2px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:#6a9e40;"></div></div><div style="font-size:10px;margin-top:3px;color:#4a5a70;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(currentName)} · ${run.stats.sent} sent</div></div><button type="button" id="fm-float-stop" style="padding:8px 14px;background:#b03020;color:#fff;border:1px solid #601010;border-radius:5px;font-weight:bold;cursor:pointer;font-family:inherit;font-size:13px;flex-shrink:0;">■ Stop</button>`;
      const stopBtn = document.getElementById("fm-float-stop");
      if (stopBtn) stopBtn.onclick = handleStopClick;
    } catch (e) {
      logErr("updateFloatingStatus failed", e);
    }
  }

  function handleStopClick() {
    requestStop();
    const run = readRun();
    if (run) {
      run.stopped = true;
      run.stoppedAt = now();
      run.phase = "stopped";
      if (run.current) run.remaining.unshift(run.current);
      run.current = null;
      writeRun(run);
    }
    removeFloatingStatus();
    const vid = (run && run.sourceVid) || getVillageId() || "";
    if (vid)
      window.location.replace(`/build.php?id=39&gid=16&tt=0&newdid=${vid}`);
    else window.location.href = "/build.php?id=39&gid=16&tt=0";
  }

  function removeFloatingStatus() {
    try {
      const el = document.getElementById("fm-float");
      if (el) el.remove();
    } catch {}
  }

  // ─── Resume Floating ───
  function updateResumeFloating() {
    try {
      const runs = readResumableRuns(getVillageId());
      let el = document.getElementById("fm-resume-float");
      if (!runs.length) {
        if (el) el.remove();
        return;
      }
      if (!el) {
        el = document.createElement("div");
        el.id = "fm-resume-float";
        el.style.cssText =
          "position:fixed;bottom:80px;right:12px;left:12px;max-height:45vh;overflow-y:auto;background:linear-gradient(180deg,#d09030,#a06020);border:2px solid #603010;border-radius:8px;padding:10px;color:#fff;font-family:Verdana,sans-serif;font-size:12px;z-index:2147483646;box-shadow:0 6px 20px rgba(0,0,0,.45);box-sizing:border-box;";
        document.body.appendChild(el);
      }
      const signature = runs
        .map(
          (run) =>
            `${run.runId}:${run.stats.sent}:${run.remaining.length}:${!!run.current}`,
        )
        .join("|");
      if (el.dataset.signature === signature) return;
      el.dataset.signature = signature;
      el.innerHTML =
        `<div style="font-weight:bold;margin-bottom:6px;">Paused Farm Runs (${runs.length})</div>` +
        runs
          .map((run, index) => {
            const done = run.stats.sent + run.stats.failed + run.stats.skipped;
            const remain = run.remaining.length + (run.current ? 1 : 0);
            return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid rgba(255,255,255,.35);"><div style="flex:1;min-width:0;"><b>${esc(run.sourceVillageName || "?")} · ${esc(run.listName || "?")}</b><div style="font-size:10px;opacity:.9;">${done}/${run.totalPlanned} processed · ${remain} remaining</div></div><button type="button" data-resume-index="${index}" style="padding:7px 9px;background:#fff;color:#805020;border:0;border-radius:4px;font-weight:bold;">Resume</button><button type="button" data-discard-index="${index}" title="Discard run" style="padding:7px 9px;background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.6);border-radius:4px;">×</button></div>`;
          })
          .join("");
      el.querySelectorAll("[data-resume-index]").forEach((button) => {
        button.onclick = () => {
          const run = runs[Number(button.dataset.resumeIndex)];
          if (run) resumeSavedRun(run.sourceVid, run.listId);
        };
      });
      el.querySelectorAll("[data-discard-index]").forEach((button) => {
        button.onclick = () => {
          const run = runs[Number(button.dataset.discardIndex)];
          if (!run || !confirm(`Discard paused run "${run.listName}"?`)) return;
          clearRun(run.sourceVid, run.listId);
          updateResumeFloating();
        };
      });
    } catch {}
  }

  // ─── Debug Badge ───
  function updateDebugBadge() {
    if (!isDebugEnabled()) {
      const b = document.getElementById("fm-debug-badge");
      if (b) b.remove();
      return;
    }
    try {
      let el = document.getElementById("fm-debug-badge");
      if (!el) {
        el = document.createElement("div");
        el.id = "fm-debug-badge";
        el.style.cssText = `position:fixed;bottom:6px;left:6px;z-index:2147483645;background:rgba(0,0,0,.88);color:#0f0;padding:4px 8px;font-family:monospace;font-size:10px;border-radius:4px;max-width:60vw;white-space:pre-wrap;word-break:break-all;line-height:1.3;pointer-events:none;user-select:none;`;
        document.body.appendChild(el);
      }
      const run = readRun();
      let runStr = "-";
      if (run) {
        if (run.completed) runStr = "done";
        else if (run.stopped) runStr = "stopped";
        else runStr = "active";
      }
      const stopStr = isStopRequested() ? "STOP!" : "-";
      const lastLines = _logBuf.slice(-4).join("\n");
      el.textContent = `v${VERSION} | vid:${getVillageId() || "-"} | ${isRallyTt0() ? "tt=0" : isRallyOverview() ? "tt=1" : isRallySend() ? "tt=2" : isMapPage() ? "map" : "?"} | run:${runStr} | stop:${stopStr}\n${lastLines}`;
    } catch {}
  }

  // ─── Notifications ───
  function sendNotification(run) {
    try {
      const fm = readFM();
      if (fm.settings.notificationsEnabled === false) return;
      if (typeof Notification === "undefined") return;
      const stats = run.finalStats || run.stats;
      const total = run.totalPlanned || 0;
      const stopReason = run.stopReason || "complete";
      let title, body;
      if (stopReason === "stopped") {
        title = "⏹ Farm Run Paused";
        body = `${run.sourceVillageName || "?"} · ${stats.sent}/${total}`;
      } else if (stopReason === "all-done") {
        title =
          stats.failed === 0 ? "✅ Farm Run Complete" : "⚠ Farm Run Finished";
        body =
          `${run.sourceVillageName || "?"} · ${stats.sent}/${total}` +
          (stats.failed ? ` · ${stats.failed} failed` : "");
      } else {
        title = "Farm Run Update";
        body = `${stats.sent}/${total} sent`;
      }
      const fire = () => {
        try {
          new Notification(title, { body, icon: "/favicon.ico" });
        } catch {}
      };
      if (Notification.permission === "granted") fire();
      else if (Notification.permission !== "denied")
        Notification.requestPermission().then((p) => {
          if (p === "granted") fire();
        });
    } catch {}
  }

  // ─── Final Report ───
  function showFinalReport(run) {
    try {
      const old = document.getElementById("fm-final-overlay");
      if (old) old.remove();
      const stats = run.finalStats || run.stats;
      const total = run.totalPlanned || 0;
      const pct = total ? Math.round((stats.sent / total) * 100) : 0;
      const stopReason = run.stopReason || "complete";
      const remaining = run.remaining.length + (run.current ? 1 : 0);
      const elapsedMs = run.finishedAt ? run.finishedAt - run.startedAt : 0;

      let headerColor, headerBg, title;
      if (stopReason === "stopped") {
        headerColor = "#a06020";
        headerBg = "rgba(240,180,80,.35)";
        title = "⏹ Farm Run Paused";
      } else if (stats.failed === 0 && stats.skipped === 0) {
        headerColor = "#4a7a30";
        headerBg = "rgba(120,200,80,.30)";
        title = "✅ Farm Run Complete";
      } else if (stats.failed > 0) {
        headerColor = "#a03020";
        headerBg = "rgba(200,80,60,.30)";
        title = "⚠ Farm Run Finished (with errors)";
      } else {
        headerColor = "#a06020";
        headerBg = "rgba(200,140,60,.30)";
        title = "✔ Farm Run Finished";
      }

      const overlay = document.createElement("div");
      overlay.id = "fm-final-overlay";
      overlay.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;";
      const modal = document.createElement("div");
      modal.style.cssText =
        "background:linear-gradient(180deg,#f9fbff,#e8eff9);border:2px solid #8a9ac0;border-radius:12px;padding:18px;font-family:Verdana,sans-serif;font-size:13px;color:#1a2050;max-width:520px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.6);max-height:92vh;overflow-y:auto;box-sizing:border-box;";

      modal.innerHTML = `
        <div style="background:${headerBg};border-radius:8px;padding:14px;margin-bottom:14px;text-align:center;">
          <div style="font-weight:bold;font-size:17px;color:${headerColor};">${esc(title)}</div>
          <div style="font-size:11px;color:#5a6a80;margin-top:6px;">🏛 ${esc(run.sourceVillageName || "?")} · 📋 ${esc(run.listName || "-")}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin-bottom:14px;">
          <div style="padding:12px;background:rgba(200,240,200,.5);border-radius:8px;text-align:center;"><div style="font-size:26px;font-weight:bold;color:#2a7a2a;">${stats.sent}</div><div style="font-size:10px;color:#4a7a30;margin-top:2px;">Sent</div></div>
          <div style="padding:12px;background:rgba(240,200,200,.5);border-radius:8px;text-align:center;"><div style="font-size:26px;font-weight:bold;color:#a03020;">${stats.failed}</div><div style="font-size:10px;color:#7a2010;margin-top:2px;">Failed</div></div>
          <div style="padding:12px;background:rgba(240,220,180,.5);border-radius:8px;text-align:center;"><div style="font-size:26px;font-weight:bold;color:#a06020;">${stats.skipped}</div><div style="font-size:10px;color:#7a4020;margin-top:2px;">Skipped</div></div>
        </div>
        ${remaining > 0 ? `<div style="padding:12px;background:rgba(255,220,150,.55);border-radius:8px;text-align:center;margin-bottom:14px;"><div style="font-size:26px;font-weight:bold;color:#a06020;">${remaining}</div><div style="font-size:10px;color:#7a4020;margin-top:2px;">Targets pending</div></div>` : ""}
        <div style="font-family:'Courier New',monospace;font-size:11px;color:#4a5a70;margin-bottom:14px;padding:10px;background:rgba(255,255,255,.5);border-radius:6px;">
          <div>Total planned: <b>${total}</b></div>
          <div>Duration: <b>${formatDuration(elapsedMs)}</b></div>
          <div>Success rate: <b>${pct}%</b></div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${remaining > 0 ? `<button type="button" id="fm-final-resume" style="flex:1;min-width:120px;padding:12px 20px;background:linear-gradient(180deg,#d09030,#a06020);color:#fff;border:1px solid #603010;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;">▶ Resume</button>` : ""}
          <button type="button" id="fm-final-close" style="flex:1;min-width:120px;padding:12px 20px;background:linear-gradient(180deg,#7ab04a,#4a7a30);color:#fff;border:1px solid #2a5a10;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;">✓ Close</button>
        </div>
      `;
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const closeBtn = document.getElementById("fm-final-close");
      if (closeBtn)
        closeBtn.onclick = () => {
          const r = readRun();
          if (r) {
            r.reportDismissed = true;
            writeRun(r);
          }
          overlay.remove();
          updateResumeFloating();
        };
      const resumeBtn = document.getElementById("fm-final-resume");
      if (resumeBtn)
        resumeBtn.onclick = () => {
          const r = readRun();
          if (r) {
            clearStopRequest();
            r.reportDismissed = true;
            r.stopped = false;
            r.completed = false;
            r.phase = "idle";
            r.phaseAt = now();
            writeRun(r);
          }
          overlay.remove();
          navigateToSendForm(run.sourceVid);
        };
    } catch {}
  }

  function formatDuration(ms) {
    const sec = Math.max(0, Math.round(ms / 1000));
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m < 60) return `${m}m ${String(s).padStart(2, "0")}s`;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}h ${String(mm).padStart(2, "0")}m`;
  }

  // ─── Styles ───
  function injectStyles() {
    if (document.getElementById("fm-style")) return;
    const st = document.createElement("style");
    st.id = "fm-style";
    st.textContent = `
      .fm-panel, .fm-panel * { box-sizing: border-box; font-family: Verdana, sans-serif; }
      .fm-btn { cursor: pointer; touch-action: manipulation; }
      .fm-btn:active { transform: translateY(1px); filter: brightness(1.05); }
      .fm-panel img.unit { vertical-align: middle; width: 16px; height: 16px; }
      .fm-tab-active { background: linear-gradient(180deg, #a0d070, #6aa040) !important; color: #fff !important; border-color: #2a5a10 !important; }
      .fm-target-cb { width: 22px; height: 22px; flex-shrink: 0; accent-color: #4a7a30; }
    `;
    document.head.appendChild(st);
  }

  function attachNumericFilter(root) {
    root.querySelectorAll('input[inputmode="numeric"]').forEach((inp) => {
      if (inp.dataset.fmNumAttached) return;
      inp.dataset.fmNumAttached = "1";
      inp.addEventListener("input", () => {
        const cleaned = inp.value.replace(/[^\d]/g, "").slice(0, 5);
        if (cleaned !== inp.value) inp.value = cleaned;
      });
    });
  }

  // ─── Edit Target Dialog ───
  function openEditTargetDialog(vid, listId, targetId, onSave) {
    try {
      const data = readFM();
      const list = data.byVillage[String(vid)]?.lists.find(
        (l) => l.id === listId,
      );
      const target = list?.targets.find((t) => t.id === targetId);
      if (!target) return;
      const overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;";
      const dlg = document.createElement("div");
      dlg.style.cssText =
        "background:linear-gradient(180deg,#f9fbff,#e8eff9);border:2px solid #8a9ac0;border-radius:10px;padding:14px;font-family:Verdana,sans-serif;font-size:13px;color:#1a2050;max-width:520px;width:100%;max-height:92vh;overflow-y:auto;box-sizing:border-box;";
      const currentTroops = target.troops || list.troops;
      const currentHeroFollow =
        target.heroFollow !== undefined
          ? target.heroFollow
          : list.heroFollow === true;
      dlg.innerHTML = `
        <div style="font-weight:bold;color:#2a4a70;margin-bottom:8px;font-size:15px;">✎ Edit: ${esc(target.name)}</div>
        <div style="font-size:11px;color:#5a6a80;margin-bottom:10px;">(${target.x}|${target.y})${target.distance != null ? " · " + target.distance + "f" : ""}</div>
        <div style="margin-bottom:10px;padding:8px;background:rgba(255,255,255,.6);border-radius:5px;">
          <div style="font-size:11px;color:#5a6a80;margin-bottom:6px;">Override troops:</div>
          <div class="fm-edit-troops"></div>
          <label style="display:block;font-size:12px;margin-top:8px;"><input type="checkbox" class="fm-edit-hero" ${currentHeroFollow ? "checked" : ""} style="width:18px;height:18px;vertical-align:middle;"> Hero follows</label>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="fm-edit-save fm-btn" style="flex:1;min-width:100px;padding:12px;background:linear-gradient(180deg,#7ab04a,#4a7a30);color:#fff;border:1px solid #2a5a10;border-radius:5px;font-weight:bold;font-size:13px;">💾 Save</button>
          <button type="button" class="fm-edit-reset fm-btn" style="padding:12px;background:#f0d0c0;border:1px solid #b07050;border-radius:5px;cursor:pointer;font-size:12px;">↺ Reset</button>
          <button type="button" class="fm-edit-cancel fm-btn" style="padding:12px;background:#ddd;border:1px solid #999;border-radius:5px;cursor:pointer;font-size:12px;">Cancel</button>
        </div>
      `;
      overlay.appendChild(dlg);
      document.body.appendChild(overlay);
      const troopsBox = dlg.querySelector(".fm-edit-troops");
      troopsBox.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:4px;">${TROOP_KEYS.map((k) => `<label style="display:flex;align-items:center;gap:4px;font-size:11px;"><span style="width:14px;font-weight:bold;text-align:right;">${k.replace("t", "")}</span>${troopIconHTML(k, 16)}<input type="text" inputmode="numeric" class="fm-edit-t-${k}" value="${currentTroops[k] | 0}" maxlength="5" style="flex:1;min-width:0;padding:4px 6px;font-size:12px;text-align:center;border:1px solid #8a9ac0;border-radius:3px;"></label>`).join("")}</div>`;
      attachNumericFilter(troopsBox);
      const heroChk = dlg.querySelector(".fm-edit-hero");
      heroChk.onchange = () => {
        const on = heroChk.checked;
        const hi = troopsBox.querySelector(".fm-edit-t-t11");
        if (hi) {
          hi.disabled = !on;
          if (!on) hi.value = 0;
          else if (!parseInt(hi.value, 10)) hi.value = 1;
        }
      };
      dlg.querySelector(".fm-edit-save").onclick = () => {
        const troops = {};
        for (const k of TROOP_KEYS) {
          const inp = troopsBox.querySelector(".fm-edit-t-" + k);
          let v = inp ? parseInt(inp.value, 10) : 0;
          if (isNaN(v) || v < 0) v = 0;
          troops[k] = v;
        }
        if (!heroChk.checked) troops.t11 = 0;
        patchFM((fm) => {
          const ll = fm.byVillage[String(vid)].lists.find(
            (l) => l.id === listId,
          );
          if (!ll) return;
          const t = ll.targets.find((x) => x.id === targetId);
          if (!t) return;
          const isSame =
            TROOP_KEYS.every((k) => (troops[k] | 0) === (ll.troops[k] | 0)) &&
            heroChk.checked === (ll.heroFollow === true);
          t.troops = isSame ? null : { ...troops };
          t.heroFollow = heroChk.checked;
          t.invalid = false;
        });
        overlay.remove();
        if (onSave) onSave();
        showToast("✓ Saved");
      };
      dlg.querySelector(".fm-edit-reset").onclick = () => {
        patchFM((fm) => {
          const ll = fm.byVillage[String(vid)].lists.find(
            (l) => l.id === listId,
          );
          if (!ll) return;
          const t = ll.targets.find((x) => x.id === targetId);
          if (!t) return;
          t.troops = null;
          t.heroFollow = undefined;
        });
        overlay.remove();
        if (onSave) onSave();
        showToast("↺ Reset");
      };
      dlg.querySelector(".fm-edit-cancel").onclick = () => overlay.remove();
      overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
      };
    } catch (e) {
      logErr("openEditTargetDialog failed", e);
    }
  }

  // ─── Village Info Dialog ───
  function openVillageInfoDialog(vid, target) {
    try {
      const overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;";
      const dlg = document.createElement("div");
      dlg.style.cssText =
        "background:linear-gradient(180deg,#f9fbff,#e8eff9);border:2px solid #8a9ac0;border-radius:10px;padding:16px;font-family:Verdana,sans-serif;font-size:13px;color:#1a2050;max-width:480px;width:100%;box-sizing:border-box;";
      const rows = [];
      rows.push(["Name", target.name || "-"]);
      rows.push(["Coordinates", `(${target.x}|${target.y})`]);
      if (target.distance != null)
        rows.push(["Distance", `${target.distance} fields`]);
      if (target.player)
        rows.push([
          "Owner",
          target.player + (target.playerId ? ` (#${target.playerId})` : ""),
        ]);
      if (target.tribe) rows.push(["Tribe", target.tribe]);
      if (target.population != null)
        rows.push(["Population", String(target.population)]);
      if (target.isOasis) rows.push(["Type", "Oasis"]);
      if (target.status) rows.push(["Status", target.status]);
      if (target.invalid) rows.push(["⚠", "Marked invalid"]);
      dlg.innerHTML = `
        <div style="font-weight:bold;color:#2a4a70;margin-bottom:10px;font-size:15px;">ℹ️ ${esc(target.name || "Village")}</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px;">${rows.map(([k, v]) => `<tr><td style="padding:6px 8px;border-bottom:1px dashed #c0cde0;color:#5a6a80;width:110px;font-weight:bold;">${esc(k)}</td><td style="padding:6px 8px;border-bottom:1px dashed #c0cde0;word-break:break-all;">${esc(v)}</td></tr>`).join("")}</table>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="fm-info-karte fm-btn" style="flex:1;min-width:100px;padding:12px;background:linear-gradient(180deg,#6a9ee8,#3060b0);color:#fff;border:1px solid #204080;border-radius:5px;font-weight:bold;font-size:13px;">🗺️ View on Map</button>
          <button type="button" class="fm-info-close fm-btn" style="padding:12px 16px;background:#ddd;border:1px solid #999;border-radius:5px;font-size:13px;">Close</button>
        </div>
      `;
      overlay.appendChild(dlg);
      document.body.appendChild(overlay);
      dlg.querySelector(".fm-info-karte").onclick = () => {
        overlay.remove();
        location.href = `/karte.php?x=${target.x}&y=${target.y}`;
      };
      dlg.querySelector(".fm-info-close").onclick = () => overlay.remove();
      overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
      };
    } catch (e) {
      logErr("openVillageInfoDialog failed", e);
    }
  }

  // ─── Panel (tt=0) ───
  function findTt0Container() {
    const selectors = [
      "#build.gid16",
      "#build",
      "#content.build.buildRallyPoint",
      "#content.build",
      "#content",
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return { el, sel };
      } catch {}
    }
    return null;
  }

  function injectPanel() {
    try {
      if (document.querySelector(".fm-panel")) return;
      const found = findTt0Container();
      if (!found) return;
      const vid = getVillageId();
      if (!vid) return;
      ensureBucket(vid);
      injectStyles();
      const container = found.el;

      const wrap = document.createElement("div");
      wrap.className = "fm-panel";
      wrap.style.cssText = `margin:14px 0;padding:12px;background:linear-gradient(180deg,#f9fbff,#e8eff9);border:1px solid #8a9ac0;border-radius:8px;font-size:12px;color:#1a2050;box-sizing:border-box;width:100%;position:relative;z-index:1;`;

      wrap.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          <span style="font-weight:bold;font-size:15px;color:#2a4a70;">🌾 Farm Manager</span>
          <span style="font-size:10px;color:#6a7a98;">v${VERSION}</span>
          <span style="margin-left:auto;font-size:10px;color:#6a7a98;">vid: ${esc(vid)}</span>
        </div>
        <div class="fm-paused-runs" style="margin-bottom:10px;"></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
          <button type="button" class="fm-btn fm-btn-import" style="padding:8px 12px;background:linear-gradient(180deg,#7ab04a,#4a7a30);color:#fff;border:1px solid #2a5a10;border-radius:5px;font-weight:bold;font-size:12px;">📥 Import</button>
          <button type="button" class="fm-btn fm-btn-export" style="padding:8px 12px;background:#e0e8f0;border:1px solid #8a9ac0;border-radius:5px;font-size:12px;">📤 Export</button>
          <button type="button" class="fm-btn fm-btn-new" style="padding:8px 12px;background:#e0e8f0;border:1px solid #8a9ac0;border-radius:5px;font-size:12px;">+ New</button>
          <button type="button" class="fm-btn fm-btn-dbg" style="padding:8px 12px;background:${isDebugEnabled() ? "#d09030" : "#e0e8f0"};color:${isDebugEnabled() ? "#fff" : "#1a2050"};border:1px solid #8a9ac0;border-radius:5px;font-size:12px;">🐛</button>
        </div>
        <div class="fm-tabs" style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;"></div>
        <div class="fm-troop-editor" style="padding:8px;background:rgba(255,255,255,.5);border-radius:5px;margin-bottom:8px;"></div>
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">
          <button type="button" class="fm-btn fm-btn-selall" style="padding:6px 10px;background:#e0e8f0;border:1px solid #8a9ac0;border-radius:4px;font-size:11px;">Select all</button>
          <button type="button" class="fm-btn fm-btn-selnone" style="padding:6px 10px;background:#e0e8f0;border:1px solid #8a9ac0;border-radius:4px;font-size:11px;">Select none</button>
          <span class="fm-selected-info" style="margin-left:auto;color:#5a6a80;font-size:11px;"></span>
        </div>
        <div class="fm-targets-wrap" style="max-height:400px;overflow-y:auto;border:1px solid #c0cde0;border-radius:5px;background:#fff;margin-bottom:10px;"></div>
        <div style="display:flex;gap:6px;">
          <button type="button" class="fm-btn fm-btn-start" style="flex:1;padding:14px;background:linear-gradient(180deg,#d04a30,#a03020);color:#fff;border:1px solid #601010;border-radius:6px;font-weight:bold;font-size:14px;">Start Raid</button>
          <button type="button" class="fm-btn fm-btn-reset" style="padding:14px 16px;background:#e0e0e0;border:1px solid #999;border-radius:6px;font-size:12px;display:none;">Reset</button>
        </div>
      `;

      if (container.id === "build" || container.id === "content")
        container.insertBefore(wrap, container.firstChild);
      else if (container.classList.contains("rallyPointOverviewContainer"))
        container.parentNode.insertBefore(wrap, container);
      else container.insertBefore(wrap, container.firstChild);

      const tabsEl = wrap.querySelector(".fm-tabs");
      const troopEditor = wrap.querySelector(".fm-troop-editor");
      const targetsWrap = wrap.querySelector(".fm-targets-wrap");
      const selInfoEl = wrap.querySelector(".fm-selected-info");
      const btnStart = wrap.querySelector(".fm-btn-start");
      const btnReset = wrap.querySelector(".fm-btn-reset");
      const btnNew = wrap.querySelector(".fm-btn-new");
      const btnExport = wrap.querySelector(".fm-btn-export");
      const btnImport = wrap.querySelector(".fm-btn-import");
      const btnSelAll = wrap.querySelector(".fm-btn-selall");
      const btnSelNone = wrap.querySelector(".fm-btn-selnone");
      const btnDbg = wrap.querySelector(".fm-btn-dbg");
      const pausedRunsWrap = wrap.querySelector(".fm-paused-runs");

      let activeListId = (getBucket(vid) || {}).activeListId || null;
      function currentBucket() {
        return getBucket(vid) || { lists: [] };
      }
      function activeList() {
        const b = currentBucket();
        if (!b.lists.length) return null;
        return b.lists.find((l) => l.id === activeListId) || b.lists[0];
      }
      function renderAll() {
        renderPausedRuns();
        renderTabs();
        renderTroopEditor();
        renderTargets();
        renderStartButton();
      }

      function renderPausedRuns() {
        const runs = readResumableRuns(vid);
        if (!runs.length) {
          pausedRunsWrap.innerHTML = "";
          return;
        }
        pausedRunsWrap.innerHTML = `<div style="padding:10px;background:rgba(255,220,150,.45);border:1px solid #d09030;border-radius:5px;"><b style="color:#7a4020;">Paused Runs (${runs.length})</b>${runs
          .map((run, index) => {
            const remaining = run.remaining.length + (run.current ? 1 : 0);
            return `<div style="display:flex;align-items:center;gap:6px;padding:7px 0;border-top:1px solid rgba(122,64,32,.2);"><span style="flex:1;min-width:0;">${esc(run.listName || "List")} · ${run.stats.sent}/${run.totalPlanned} sent · ${remaining} left</span><button type="button" data-fm-resume-run="${index}" class="fm-btn" style="padding:6px 9px;">Resume</button><button type="button" data-fm-discard-run="${index}" class="fm-btn" style="padding:6px 9px;">Discard</button></div>`;
          })
          .join("")}</div>`;
        pausedRunsWrap
          .querySelectorAll("[data-fm-resume-run]")
          .forEach((button) => {
            button.onclick = () => {
              const run = runs[Number(button.dataset.fmResumeRun)];
              if (run) resumeSavedRun(run.sourceVid, run.listId);
            };
          });
        pausedRunsWrap
          .querySelectorAll("[data-fm-discard-run]")
          .forEach((button) => {
            button.onclick = () => {
              const run = runs[Number(button.dataset.fmDiscardRun)];
              if (!run || !confirm(`Discard paused run "${run.listName}"?`))
                return;
              clearRun(run.sourceVid, run.listId);
              renderPausedRuns();
            };
          });
      }

      // ★★★ NEW: Tabs with rename/delete capability ★★★
      function renderTabs() {
        const b = currentBucket();
        if (!b.lists.length) {
          tabsEl.innerHTML =
            '<span style="font-size:11px;color:#8a7050;font-style:italic;">No lists</span>';
          return;
        }
        tabsEl.innerHTML = b.lists
          .map((list) => {
            const active = list.id === activeListId;
            return `<div style="display:flex;align-items:center;gap:3px;"><button type="button" class="fm-tab-label fm-btn ${active ? "fm-tab-active" : ""}" data-id="${esc(list.id)}" style="padding:6px 9px;border:1px solid #8a9ac0;background:#f0f5ff;color:#2a4a70;border-radius:4px;font-size:11px;font-weight:bold;">${esc(list.name)} <span style="opacity:.7;">(${list.targets.length})</span></button><button type="button" class="fm-list-rename fm-btn" data-id="${esc(list.id)}" title="Rename list" aria-label="Rename ${esc(list.name)}" style="padding:6px 8px;">✎</button><button type="button" class="fm-list-delete fm-btn" data-id="${esc(list.id)}" title="Delete list" aria-label="Delete ${esc(list.name)}" style="padding:6px 8px;">×</button></div>`;
          })
          .join("");
        tabsEl.querySelectorAll(".fm-tab-label").forEach((button) => {
          button.onclick = () => {
            activeListId = button.dataset.id;
            patchFM((fm) => {
              fm.byVillage[String(vid)].activeListId = activeListId;
            });
            renderAll();
          };
        });
        tabsEl.querySelectorAll(".fm-list-rename").forEach((button) => {
          button.onclick = () => {
            const list = currentBucket().lists.find(
              (item) => item.id === button.dataset.id,
            );
            const tab = button.parentElement.querySelector(".fm-tab-label");
            if (list && tab) startInlineRename(tab, list);
          };
        });
        tabsEl.querySelectorAll(".fm-list-delete").forEach((button) => {
          button.onclick = () => {
            const list = currentBucket().lists.find(
              (item) => item.id === button.dataset.id,
            );
            if (!list) return;
            const run = readRunByKey(vid, list.id);
            if (run && !run.stopped && !run.completed) {
              showToast("Stop this list's run before deleting it");
              return;
            }
            if (
              !confirm(
                `Delete list "${list.name}" and its ${list.targets.length} targets?`,
              )
            )
              return;
            if (!backupFM(`delete list ${list.name}`)) return;
            patchFM((fm) => {
              const bucket = fm.byVillage[String(vid)];
              if (!bucket) return;
              bucket.lists = bucket.lists.filter((item) => item.id !== list.id);
              if (bucket.activeListId === list.id)
                bucket.activeListId = bucket.lists[0]?.id || null;
            });
            clearRun(vid, list.id);
            activeListId = getBucket(vid)?.activeListId || null;
            renderAll();
          };
        });
      }

      function startInlineRename(el, list) {
        const originalHTML = el.innerHTML;
        el.innerHTML = "";
        const input = document.createElement("input");
        input.type = "text";
        input.value = list.name;
        input.maxLength = 30;
        input.style.cssText =
          "padding:2px 4px;font-size:11px;border:1px solid #2a5a10;border-radius:3px;width:110px;font-family:Verdana,sans-serif;";
        el.appendChild(input);
        input.focus();
        input.select();
        let committed = false;
        const commit = () => {
          if (committed) return;
          committed = true;
          const newName = input.value.trim();
          if (newName && newName !== list.name) {
            patchFM((fm) => {
              const ll = fm.byVillage[String(vid)].lists.find(
                (x) => x.id === list.id,
              );
              if (ll) ll.name = newName;
            });
            log("list renamed:", list.name, "→", newName);
          }
          renderAll();
        };
        input.onblur = commit;
        input.onkeydown = (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            commit();
          }
          if (ev.key === "Escape") {
            ev.preventDefault();
            committed = true;
            el.innerHTML = originalHTML;
            // Re-bind
            el.onclick = () => {
              activeListId = el.dataset.id;
              patchFM((fm) => {
                fm.byVillage[String(vid)].activeListId = activeListId;
              });
              renderAll();
            };
            el.ondblclick = (e) => {
              e.preventDefault();
              const l = getBucket(vid).lists.find(
                (x) => x.id === el.dataset.id,
              );
              if (l) startInlineRename(el, l);
            };
          }
        };
      }

      function renderTroopEditor() {
        const l = activeList();
        if (!l) {
          troopEditor.innerHTML = "";
          return;
        }
        troopEditor.innerHTML = `
          <div style="font-size:11px;color:#5a6a80;margin-bottom:6px;">Troops per attack (template):</div>
          <div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:4px;">
            ${TROOP_KEYS.map((k) => `<label style="display:flex;align-items:center;gap:3px;font-size:11px;min-width:0;"><span style="width:14px;font-weight:bold;text-align:right;flex-shrink:0;">${k.replace("t", "")}</span>${troopIconHTML(k, 16)}<input type="text" inputmode="numeric" class="fm-troop-input fm-t-${k}" value="${l.troops[k] | 0}" maxlength="5" style="width:48px;min-width:0;flex:0 1 48px;padding:3px 4px;font-size:12px;text-align:center;border:1px solid #8a9ac0;border-radius:3px;"></label>`).join("")}
          </div>
          <label style="display:block;margin-top:8px;font-size:11px;"><input type="checkbox" class="fm-hero-follow" ${l.heroFollow ? "checked" : ""} style="width:18px;height:18px;vertical-align:middle;"> Hero follows</label>
        `;
        attachNumericFilter(troopEditor);
        troopEditor.querySelectorAll(".fm-troop-input").forEach((inp) => {
          inp.onchange = () => {
            const m = inp.className.match(/fm-(t\d+)/);
            if (!m) return;
            const k = m[1];
            const v = Math.max(0, parseInt(inp.value, 10) || 0);
            patchFM((fm) => {
              const ll = fm.byVillage[String(vid)].lists.find(
                (x) => x.id === l.id,
              );
              if (ll) ll.troops[k] = v;
            });
          };
        });
        const hfEl = troopEditor.querySelector(".fm-hero-follow");
        if (hfEl)
          hfEl.onchange = (e) => {
            patchFM((fm) => {
              const ll = fm.byVillage[String(vid)].lists.find(
                (x) => x.id === l.id,
              );
              if (ll) ll.heroFollow = e.target.checked;
            });
          };
      }

      function renderTargets() {
        const l = activeList();
        if (!l || !l.targets.length) {
          targetsWrap.innerHTML =
            '<div style="padding:24px;text-align:center;color:#8a7050;font-style:italic;">Empty</div>';
          renderSelInfo();
          return;
        }
        const sorted = l.targets.slice().sort((a, b) => {
          const da = a.distance == null ? 1e9 : a.distance;
          const db = b.distance == null ? 1e9 : b.distance;
          if (da !== db) return da - db;
          return (a.addedAt || 0) - (b.addedAt || 0);
        });
        targetsWrap.innerHTML = sorted
          .map((t) => {
            const isInvalid = t.invalid === true;
            const badge = isInvalid
              ? "⊘"
              : t.status === "sent"
                ? "✓"
                : t.status === "failed"
                  ? "✗"
                  : t.status === "skipped"
                    ? "–"
                    : "·";
            const badgeColor = isInvalid
              ? "#888"
              : t.status === "sent"
                ? "#2a7a2a"
                : t.status === "failed"
                  ? "#c04030"
                  : t.status === "skipped"
                    ? "#8a7050"
                    : "#6a7a98";
            const dist =
              t.distance != null
                ? `<span style="color:#8a7050;">· ${t.distance}f</span>`
                : "";
            const rowBg = isInvalid
              ? "rgba(220,220,220,.5)"
              : t.status === "sent"
                ? "rgba(200,240,200,.4)"
                : t.status === "failed"
                  ? "rgba(240,200,200,.4)"
                  : t.status === "skipped"
                    ? "rgba(240,220,180,.4)"
                    : "transparent";
            const troopsHtml = troopsInlineHTML(t.troops || l.troops, 13);
            return `
            <div class="fm-target" data-id="${esc(t.id)}" style="display:flex;gap:8px;padding:8px;border-bottom:1px dashed #c0cde0;background:${rowBg};align-items:center;">
              <input type="checkbox" class="fm-target-cb" ${t.selected !== false ? "checked" : ""} style="flex-shrink:0;">
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
                  <span style="font-weight:bold;color:${badgeColor};flex-shrink:0;font-size:12px;">${badge}</span>
                  <b style="font-size:12px;color:#2a4a70;word-break:break-word;line-height:1.2;">${esc(t.name)}</b>
                  <span style="color:#6a7a98;font-size:10px;">(${t.x}|${t.y})</span>
                  ${dist}
                </div>
                ${troopsHtml ? `<div style="margin-top:3px;font-size:11px;line-height:1.5;">${troopsHtml}</div>` : ""}
              </div>
              <div style="display:flex;gap:4px;flex-shrink:0;">
                <button type="button" class="fm-target-info fm-btn" title="Info" style="padding:6px 8px;background:#e0e8f0;border:1px solid #8a9ac0;border-radius:4px;font-size:13px;min-width:34px;">ℹ️</button>
                <button type="button" class="fm-target-edit fm-btn" title="Edit" style="padding:6px 8px;background:#f0e0c0;border:1px solid #b09050;border-radius:4px;font-size:13px;min-width:34px;">✎</button>
                <button type="button" class="fm-target-remove fm-btn" title="Remove" style="padding:6px 8px;background:#f0d0c0;border:1px solid #b07050;border-radius:4px;font-size:13px;min-width:34px;">×</button>
              </div>
            </div>
          `;
          })
          .join("");
        targetsWrap.querySelectorAll(".fm-target").forEach((rowEl) => {
          const id = rowEl.dataset.id;
          const cb = rowEl.querySelector(".fm-target-cb");
          if (cb)
            cb.onchange = () => {
              patchFM((fm) => {
                const ll = fm.byVillage[String(vid)].lists.find(
                  (x) => x.id === l.id,
                );
                if (!ll) return;
                const t = ll.targets.find((x) => x.id === id);
                if (t) {
                  t.selected = cb.checked;
                  if (cb.checked) t.invalid = false;
                }
              });
              renderSelInfo();
              renderStartButton();
            };
          const infoBtn = rowEl.querySelector(".fm-target-info");
          if (infoBtn)
            infoBtn.onclick = (e) => {
              e.stopPropagation();
              const t = l.targets.find((x) => x.id === id);
              if (t) openVillageInfoDialog(vid, t);
            };
          const editBtn = rowEl.querySelector(".fm-target-edit");
          if (editBtn)
            editBtn.onclick = (e) => {
              e.stopPropagation();
              openEditTargetDialog(vid, l.id, id, () => {
                renderTargets();
                renderStartButton();
              });
            };
          const rm = rowEl.querySelector(".fm-target-remove");
          if (rm)
            rm.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!confirm("Remove?")) return;
              patchFM((fm) => {
                const ll = fm.byVillage[String(vid)].lists.find(
                  (x) => x.id === l.id,
                );
                if (ll) ll.targets = ll.targets.filter((t) => t.id !== id);
              });
              renderAll();
            };
        });
        renderSelInfo();
      }

      function renderSelInfo() {
        const l = activeList();
        if (!l) {
          selInfoEl.textContent = "";
          return;
        }
        const sel = l.targets.filter(
          (t) => t.selected !== false && !t.invalid,
        ).length;
        const invalid = l.targets.filter((t) => t.invalid).length;
        selInfoEl.textContent = `${sel} / ${l.targets.length}${invalid ? " (" + invalid + " invalid)" : ""}`;
      }
      function renderStartButton() {
        const l = activeList();
        if (!l || !l.targets.length) {
          btnStart.textContent = "No targets";
          btnStart.disabled = true;
          btnReset.style.display = "none";
          return;
        }
        const sel = l.targets.filter(
          (t) => t.selected !== false && t.status !== "sent" && !t.invalid,
        ).length;
        const hasDone = l.targets.some((t) => t.status === "sent");
        if (hasDone && sel === 0) {
          btnStart.textContent = "All done";
          btnStart.disabled = true;
          btnReset.style.display = "inline-block";
        } else if (hasDone) {
          btnStart.textContent = `Resume Raid (${sel})`;
          btnStart.disabled = false;
          btnReset.style.display = "inline-block";
        } else {
          btnStart.textContent = sel ? `Start Raid (${sel})` : "No targets";
          btnStart.disabled = sel === 0;
          btnReset.style.display = "none";
        }
      }

      btnStart.onclick = () => {
        const l = activeList();
        if (!l) return;
        const mode = l.targets.some((t) => t.status === "sent")
          ? "resume"
          : "start";
        startRun(vid, l.id, mode);
      };
      // ★★★ FIX: Reset حالا `invalid` را نگه می‌دارد (فقط `status` را ریست می‌کند) ★★★
      btnReset.onclick = () => {
        const l = activeList();
        if (!l) return;
        const invalidCount = l.targets.filter((t) => t.invalid).length;
        const msg =
          `Reset all ${l.targets.length} targets to pending?\n\n` +
          (invalidCount > 0
            ? `⚠ ${invalidCount} invalid target(s) will stay INVALID (not cleared).\n\n`
            : "") +
          `To clear invalid flags too, use the "Clear invalid" button (coming soon) or edit each target.`;
        if (!confirm(msg)) return;
        patchFM((fm) => {
          const ll = fm.byVillage[String(vid)].lists.find((x) => x.id === l.id);
          if (ll)
            ll.targets.forEach((t) => {
              // ★ فقط status را ریست کن، invalid را نگه‌دار
              if (!t.invalid) {
                t.status = "pending";
                t.lastRaid = null;
              }
              // invalid targets: status='failed', invalid=true (نگه‌داری)
            });
        });
        renderAll();
      };
      btnNew.onclick = () => {
        const name = prompt(
          "New list name:",
          "List " + (currentBucket().lists.length + 1),
        );
        if (!name) return;
        const newList = {
          id: uid("L"),
          name: name.trim(),
          troops: Object.fromEntries(TROOP_KEYS.map((k) => [k, 0])),
          heroFollow: false,
          targets: [],
          createdAt: now(),
        };
        patchFM((fm) => {
          fm.byVillage[String(vid)].lists.push(newList);
          fm.byVillage[String(vid)].activeListId = newList.id;
        });
        activeListId = newList.id;
        renderAll();
      };
      btnExport.onclick = () => {
        try {
          const l = activeList();
          if (!l || !l.targets.length) {
            showToast("Nothing to export");
            return;
          }
          const onlySel = confirm(
            "Export only SELECTED?\n\nOK = selected\nCancel = all",
          );
          const targets = onlySel
            ? l.targets.filter((t) => t.selected !== false)
            : l.targets;
          const exportData = {
            _format: "farm-list-v1",
            _exported: now(),
            list: {
              name: l.name,
              troops: { ...l.troops },
              heroFollow: l.heroFollow === true,
              targets: targets.map((t) => {
                const out = {
                  name: t.name,
                  x: t.x,
                  y: t.y,
                  distance: t.distance,
                };
                if (t.troops && Object.values(t.troops).some((v) => v > 0))
                  out.troops = { ...t.troops };
                if (t.heroFollow !== undefined) out.heroFollow = t.heroFollow;
                return out;
              }),
            },
          };
          const json = JSON.stringify(exportData, null, 2);
          try {
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `farm-list-${(l.name || "list").replace(/[^a-z0-9_-]/gi, "_")}-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }, 100);
            showToast("📤 Exported");
          } catch {
            showTextDialog("Export", json);
          }
        } catch (e) {
          logErr("export failed", e);
        }
      };
      btnImport.onclick = () => showImportDialog();
      btnSelAll.onclick = () => {
        const l = activeList();
        if (!l) return;
        patchFM((fm) => {
          const ll = fm.byVillage[String(vid)].lists.find((x) => x.id === l.id);
          if (ll)
            ll.targets.forEach((t) => {
              t.selected = true;
              if (!t.invalid) t.invalid = false;
            });
        });
        renderTargets();
        renderStartButton();
      };
      btnSelNone.onclick = () => {
        const l = activeList();
        if (!l) return;
        patchFM((fm) => {
          const ll = fm.byVillage[String(vid)].lists.find((x) => x.id === l.id);
          if (ll) ll.targets.forEach((t) => (t.selected = false));
        });
        renderTargets();
        renderStartButton();
      };
      btnDbg.onclick = () => {
        const next = !isDebugEnabled();
        setDebugEnabled(next);
        btnDbg.style.background = next ? "#d09030" : "#e0e8f0";
        btnDbg.style.color = next ? "#fff" : "#1a2050";
        if (next) {
          updateDebugBadge();
          showToast("🐛 Debug ON");
        } else {
          const b = document.getElementById("fm-debug-badge");
          if (b) b.remove();
          showToast("Debug OFF");
        }
      };

      function showImportDialog() {
        try {
          const overlay = document.createElement("div");
          overlay.style.cssText =
            "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;";
          const dlg = document.createElement("div");
          dlg.style.cssText =
            "background:linear-gradient(180deg,#f9fbff,#e8eff9);border:2px solid #8a9ac0;border-radius:10px;padding:16px;font-family:Verdana,sans-serif;font-size:13px;color:#1a2050;max-width:520px;width:100%;max-height:92vh;overflow-y:auto;box-sizing:border-box;";
          dlg.innerHTML = `
            <div style="font-weight:bold;font-size:15px;margin-bottom:10px;color:#2a4a70;">📥 Import</div>
            <input type="file" class="fm-import-file" accept=".json,application/json" style="margin-bottom:10px;width:100%;font-size:12px;">
            <textarea class="fm-import-text" placeholder="...or paste JSON" style="width:100%;min-height:140px;padding:8px;border:1px solid #8a9ac0;border-radius:4px;font-family:monospace;font-size:11px;box-sizing:border-box;"></textarea>
            <div style="display:flex;gap:14px;margin-top:10px;font-size:12px;">
              <label><input type="radio" name="fm-import-action" value="add" checked> Add</label>
              <label><input type="radio" name="fm-import-action" value="remove"> Remove</label>
            </div>
            <label style="display:block;margin-top:10px;font-size:12px;">Target list
              <select class="fm-import-list" style="display:block;width:100%;margin-top:4px;padding:8px;border:1px solid #8a9ac0;border-radius:4px;">${currentBucket()
                .lists.map(
                  (list) =>
                    `<option value="${esc(list.id)}" ${list.id === activeListId ? "selected" : ""}>${esc(list.name)} (${list.targets.length})</option>`,
                )
                .join("")}</select>
            </label>
            <div class="fm-import-msg" style="font-size:11px;margin-top:8px;min-height:16px;"></div>
            <div style="display:flex;gap:8px;margin-top:12px;">
              <button type="button" class="fm-import-confirm fm-btn" style="flex:1;padding:12px;background:linear-gradient(180deg,#7ab04a,#4a7a30);color:#fff;border:1px solid #2a5a10;border-radius:5px;font-weight:bold;font-size:13px;">Import</button>
              <button type="button" class="fm-import-cancel fm-btn" style="padding:12px 16px;background:#ddd;border:1px solid #999;border-radius:5px;font-size:13px;">Cancel</button>
            </div>
          `;
          overlay.appendChild(dlg);
          document.body.appendChild(overlay);
          const fileInp = dlg.querySelector(".fm-import-file");
          const textInp = dlg.querySelector(".fm-import-text");
          const listInp = dlg.querySelector(".fm-import-list");
          const msgEl = dlg.querySelector(".fm-import-msg");
          fileInp.onchange = () => {
            const file = fileInp.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              textInp.value = reader.result;
            };
            reader.readAsText(file);
          };
          dlg.querySelector(".fm-import-confirm").onclick = () => {
            const txt = textInp.value.trim();
            if (!txt) {
              msgEl.textContent = "No data";
              msgEl.style.color = "#c04030";
              return;
            }
            if (!listInp.value) {
              msgEl.textContent = "Create a list before importing";
              msgEl.style.color = "#c04030";
              return;
            }
            const action =
              dlg.querySelector('input[name="fm-import-action"]:checked')
                ?.value || "add";
            const res = importList(txt, vid, listInp.value, action);
            if (res.ok) {
              msgEl.textContent =
                action === "remove"
                  ? `✓ Removed ${res.removed} target(s) from "${res.listName}"`
                  : `✓ Added ${res.added} target(s) to "${res.listName}"`;
              msgEl.style.color = "#2a7a2a";
              setTimeout(() => {
                overlay.remove();
                activeListId = listInp.value;
                renderAll();
                showToast(
                  action === "remove"
                    ? `Removed ${res.removed}`
                    : `Added ${res.added}`,
                );
              }, 700);
            } else {
              msgEl.textContent = "✗ " + res.error;
              msgEl.style.color = "#c04030";
            }
          };
          dlg.querySelector(".fm-import-cancel").onclick = () =>
            overlay.remove();
          overlay.onclick = (e) => {
            if (e.target === overlay) overlay.remove();
          };
        } catch (e) {
          logErr("showImportDialog failed", e);
        }
      }

      function showTextDialog(title, content) {
        try {
          const overlay = document.createElement("div");
          overlay.style.cssText =
            "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;";
          const dlg = document.createElement("div");
          dlg.style.cssText =
            "background:#f9fbff;border:2px solid #8a9ac0;border-radius:10px;padding:16px;font-family:Verdana,sans-serif;max-width:520px;width:100%;max-height:92vh;overflow-y:auto;box-sizing:border-box;";
          dlg.innerHTML = `<div style="font-weight:bold;font-size:15px;margin-bottom:10px;color:#2a4a70;">${esc(title)}</div><textarea readonly style="width:100%;min-height:200px;padding:8px;border:1px solid #8a9ac0;border-radius:4px;font-family:monospace;font-size:11px;box-sizing:border-box;">${esc(content)}</textarea><div style="display:flex;gap:8px;margin-top:12px;"><button type="button" class="fm-copy fm-btn" style="flex:1;padding:12px;background:#e0e8f0;border:1px solid #8a9ac0;border-radius:5px;font-size:13px;">Copy</button><button type="button" class="fm-close fm-btn" style="padding:12px 16px;background:#ddd;border:1px solid #999;border-radius:5px;font-size:13px;">Close</button></div>`;
          overlay.appendChild(dlg);
          document.body.appendChild(overlay);
          dlg.querySelector(".fm-copy").onclick = () => {
            try {
              navigator.clipboard
                .writeText(content)
                .then(() => showToast("📋 Copied"))
                .catch(() => {});
            } catch {}
          };
          dlg.querySelector(".fm-close").onclick = () => overlay.remove();
          overlay.onclick = (e) => {
            if (e.target === overlay) overlay.remove();
          };
        } catch (e) {
          logErr("showTextDialog failed", e);
        }
      }

      renderAll();
      log("injectPanel: DONE ✓");
    } catch (e) {
      logErr("injectPanel THREW:", e);
    }
  }

  // ─── Map Panel (داخل دیالوگ Travian) ───
  function extractMapTargetFromTile(tile) {
    try {
      if (!tile) return null;
      const isOasis = tile.classList.contains("oasis");
      const titleEl = tile.querySelector("h1.titleInHeader");
      let name = "";
      if (titleEl) {
        const clone = titleEl.cloneNode(true);
        clone
          .querySelectorAll("span.mainVillage, span.coordinates, span.clear, a")
          .forEach((e) => e.remove());
        name = clone.textContent.replace(/\s+/g, " ").trim();
      }
      const xEl = tile.querySelector(".coordinates .coordinateX");
      const yEl = tile.querySelector(".coordinates .coordinateY");
      const x = xEl ? cleanInt(xEl.textContent) : null;
      const y = yEl ? cleanInt(yEl.textContent) : null;
      if (x === null || y === null) return null;
      if (!name) return null;

      let player = null,
        playerId = null;
      const pLink = tile.querySelector(
        '#village_info td.player a[href*="/profile/"]',
      );
      if (pLink) {
        player = pLink.textContent.trim();
        const m = pLink.getAttribute("href").match(/\/profile\/(\d+)/);
        if (m) playerId = m[1];
      }
      let tribe = null,
        population = null,
        distance = null;
      for (const r of tile.querySelectorAll("#village_info tr")) {
        const th = r.querySelector("th");
        const td = r.querySelector("td");
        if (!th || !td) continue;
        const key = th.textContent.trim().toLowerCase();
        if (key === "tribe") tribe = td.textContent.trim();
        if (key === "population") {
          const pop = parseInt(td.textContent.trim(), 10);
          if (!isNaN(pop)) population = pop;
        }
        if (key === "distance") {
          const m = td.textContent.match(/([\d.]+)/);
          if (m) distance = parseFloat(m[1]);
        }
      }
      return {
        name,
        x,
        y,
        player,
        playerId,
        tribe,
        population,
        distance,
        isOasis,
      };
    } catch (e) {
      logErr("extractMapTargetFromTile failed", e);
      return null;
    }
  }

  function injectFarmBoxOnMap() {
    try {
      if (!isMapPage()) return;

      const dialog = document.querySelector(
        '.dialogWrapper.dialogV1[data-context="map"]',
      );
      if (!dialog) return;
      const tile = dialog.querySelector("#tileDetails");
      if (!tile) return;
      if (tile.classList.contains("oasis")) return;

      const target = extractMapTargetFromTile(tile);
      if (!target) return;

      const vid = getVillageId();
      if (!vid) return;
      ensureBucket(vid);
      injectStyles();

      // ★ چک کن قبلاً ساخته شده؟ فقط به‌روزرسانی محتوا
      let box = dialog.querySelector(".fm-map-box");

      if (box) {
        // فقط محتوا را آپدیت کن (برای تغییر لیست)
        updateMapBoxContent(box, target, vid);
        return;
      }

      box = document.createElement("div");
      box.className = "fm-map-box";
      box.style.cssText = `
        margin: 12px 0 0 0; padding: 12px;
        background: linear-gradient(180deg, #f5f8ff, #e3ecf7);
        border: 2px solid #8a9ac0; border-radius: 8px;
        font-family: Verdana, sans-serif; font-size: 12px;
        color: #1a2050; box-sizing: border-box; width: 100%;
        position: relative; z-index: 10;
      `;

      const mapDetails = tile.querySelector("#map_details");
      if (!mapDetails) return;
      const clear = mapDetails.nextElementSibling?.classList.contains("clear")
        ? mapDetails.nextElementSibling
        : null;
      const anchor = clear || mapDetails;
      anchor.parentNode.insertBefore(box, anchor.nextSibling);

      updateMapBoxContent(box, target, vid);
      log("injectFarmBoxOnMap: DONE ✓");
    } catch (e) {
      logErr("injectFarmBoxOnMap failed", e);
    }
  }

  function updateMapBoxContent(box, target, vid) {
    box.dataset.targetKey = `${target.x}|${target.y}`;
    const isCollapsed = sessionStorage.getItem(MAP_COLLAPSED_KEY) === "1";

    const bucket = getBucket(vid);
    const listsOptions =
      bucket.lists
        .map(
          (l) =>
            `<option value="${esc(l.id)}" ${l.id === bucket.activeListId ? "selected" : ""}>${esc(l.name)} (${l.targets.length})</option>`,
        )
        .join("") || '<option value="">— create a list first —</option>';

    // ★ Title bar (با دکمه Hide/Show)
    // ★ Troops grid در ۳ ستون

    if (isCollapsed) {
      // حالت جمع‌شده: فقط تایتل
      box.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-weight: bold; color: #2a4a70; font-size: 14px;">🌾 Farm Manager</span>
          <span style="font-size: 10px; color: #6a7a98;">(${target.x}|${target.y})</span>
          <button type="button" class="fm-map-toggle fm-btn" style="margin-left: auto; padding: 6px 12px; background: linear-gradient(180deg, #7ab04a, #4a7a30); color: #fff; border: 1px solid #2a5a10; border-radius: 5px; font-weight: bold; font-size: 12px;">▼ Show</button>
        </div>
      `;
      box.querySelector(".fm-map-toggle").onclick = () => {
        sessionStorage.removeItem(MAP_COLLAPSED_KEY);
        updateMapBoxContent(box, target, vid);
      };
      return;
    }

    // حالت باز
    box.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
        <span style="font-weight: bold; color: #2a4a70; font-size: 14px;">🌾 Farm Manager</span>
        <span style="font-size: 10px; color: #6a7a98;">v${VERSION}</span>
        <button type="button" class="fm-map-toggle fm-btn" style="margin-left: auto; padding: 5px 10px; background: #e0e8f0; border: 1px solid #8a9ac0; border-radius: 4px; font-size: 11px;">▲ Hide</button>
      </div>
      <div style="font-size: 11px; color: #5a6a80; margin-bottom: 8px;">
        (${target.x}|${target.y})${target.distance != null ? " · " + target.distance + "f" : ""}${target.player ? " · " + esc(target.player) : ""}
      </div>
      <label style="display:block;margin-bottom:8px;">
        <span style="display:inline-block;font-weight:bold;margin-right:6px;">List:</span>
        <select class="fm-map-list" style="padding:6px;font-size:12px;border:1px solid #8a9ac0;border-radius:4px;max-width:100%;">${listsOptions}</select>
        <button type="button" class="fm-map-newlist fm-btn" style="margin-left:6px;padding:6px 10px;background:#e0e8f0;border:1px solid #8a9ac0;border-radius:4px;font-size:11px;">+ New</button>
      </label>
      <div class="fm-map-status" style="margin-bottom:6px;font-size:10px;font-style:italic;color:#8a7050;"></div>
      <div class="fm-map-troops" style="padding:8px;background:rgba(255,255,255,.6);border-radius:5px;margin-bottom:8px;"></div>
      <label style="display:block;margin-bottom:10px;font-size:11px;">
        <input type="checkbox" class="fm-map-hero" style="width:18px;height:18px;vertical-align:middle;"> Hero follows
      </label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="fm-map-add fm-btn" style="flex:1;min-width:100px;padding:12px;background:linear-gradient(180deg,#7ab04a,#4a7a30);color:#fff;border:1px solid #2a5a10;border-radius:5px;font-weight:bold;font-size:13px;">➕ Add to List</button>
        <button type="button" class="fm-map-remove fm-btn" style="flex:1;min-width:100px;padding:12px;background:#f0d0c0;color:#5a2010;border:1px solid #b07050;border-radius:5px;font-weight:bold;font-size:13px;">× Remove from List</button>
      </div>
      <div class="fm-map-msg" style="margin-top:8px;font-size:11px;color:#4a7a30;display:none;"></div>
    `;

    box.querySelector(".fm-map-toggle").onclick = () => {
      sessionStorage.setItem(MAP_COLLAPSED_KEY, "1");
      updateMapBoxContent(box, target, vid);
    };

    const listSelect = box.querySelector(".fm-map-list");
    const troopsBox = box.querySelector(".fm-map-troops");
    const heroChk = box.querySelector(".fm-map-hero");
    const msg = box.querySelector(".fm-map-msg");
    const statusEl = box.querySelector(".fm-map-status");
    const addBtn = box.querySelector(".fm-map-add");
    const removeBtn = box.querySelector(".fm-map-remove");

    function currentList() {
      const b = getBucket(vid);
      return (
        b.lists.find((l) => l.id === listSelect.value) || b.lists[0] || null
      );
    }
    function targetInList(list) {
      if (!list) return null;
      return (
        list.targets.find((t) => t.x === target.x && t.y === target.y) || null
      );
    }
    function listsContainingVillage() {
      const b = getBucket(vid);
      return b.lists.filter((l) =>
        l.targets.some((t) => t.x === target.x && t.y === target.y),
      );
    }
    function renderStatus() {
      const listsWith = listsContainingVillage();
      if (listsWith.length === 0) {
        statusEl.textContent = "";
        statusEl.style.display = "none";
        return;
      }
      statusEl.style.display = "block";
      const names = listsWith.map((l) => esc(l.name)).join(", ");
      statusEl.innerHTML = `Already in: <b>${names}</b>`;
    }
    function renderTroops() {
      const l = currentList();
      const inList = targetInList(l);
      let troops, hf;
      if (inList) {
        troops = inList.troops || l.troops;
        hf =
          inList.heroFollow !== undefined
            ? inList.heroFollow
            : l.heroFollow === true;
      } else {
        troops = l
          ? l.troops
          : Object.fromEntries(TROOP_KEYS.map((k) => [k, 0]));
        hf = l ? l.heroFollow === true : false;
      }
      heroChk.checked = hf;
      troopsBox.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:4px;">
          ${TROOP_KEYS.map(
            (k) => `
            <label style="display:flex;align-items:center;gap:3px;font-size:11px;min-width:0;">
              <span style="width:14px;font-weight:bold;text-align:right;flex-shrink:0;">${k.replace("t", "")}</span>
              ${troopIconHTML(k, 16)}
              <input type="text" inputmode="numeric" class="fm-map-t-${k}" value="${troops[k] | 0}" maxlength="5"
                style="width:48px;min-width:0;flex:0 1 48px;padding:3px 4px;font-size:12px;text-align:center;border:1px solid #8a9ac0;border-radius:3px;">
            </label>
          `,
          ).join("")}
        </div>
      `;
      attachNumericFilter(troopsBox);

      // ★ تغییر متن دکمه: Edit اگر در لیست هست، Add اگر نیست
      if (inList) {
        addBtn.textContent = "✎ Edit in List";
        addBtn.style.background = "linear-gradient(180deg,#d09030,#a06020)";
        addBtn.style.borderColor = "#603010";
      } else {
        addBtn.textContent = "➕ Add to List";
        addBtn.style.background = "linear-gradient(180deg,#7ab04a,#4a7a30)";
        addBtn.style.borderColor = "#2a5a10";
      }
      removeBtn.disabled = !inList;
      removeBtn.style.opacity = inList ? "1" : ".5";
      renderStatus();
    }

    listSelect.onchange = () => {
      patchFM((fm) => {
        fm.byVillage[String(vid)].activeListId = listSelect.value;
      });
      renderTroops();
      msg.style.display = "none";
    };
    heroChk.onchange = () => {
      const l = currentList();
      if (!l) return;
      const inList = targetInList(l);
      if (!inList) {
        patchFM((fm) => {
          const ll = fm.byVillage[String(vid)].lists.find((x) => x.id === l.id);
          if (ll) ll.heroFollow = heroChk.checked;
        });
      }
      const heroInp = troopsBox.querySelector(".fm-map-t-t11");
      if (heroInp) {
        heroInp.disabled = !heroChk.checked;
        if (!heroChk.checked) heroInp.value = 0;
        else if (!parseInt(heroInp.value, 10)) heroInp.value = 1;
      }
    };
    box.querySelector(".fm-map-newlist").onclick = () => {
      const name = prompt(
        "New list name:",
        "List " + (getBucket(vid).lists.length + 1),
      );
      if (!name) return;
      const newList = {
        id: uid("L"),
        name: name.trim(),
        troops: Object.fromEntries(TROOP_KEYS.map((k) => [k, 0])),
        heroFollow: false,
        targets: [],
        createdAt: now(),
      };
      patchFM((fm) => {
        fm.byVillage[String(vid)].lists.push(newList);
        fm.byVillage[String(vid)].activeListId = newList.id;
      });
      updateMapBoxContent(box, target, vid);
    };

    addBtn.onclick = () => {
      const l = currentList();
      if (!l) {
        showToast("Create a list first");
        return;
      }
      const troops = {};
      for (const k of TROOP_KEYS) {
        const inp = troopsBox.querySelector(".fm-map-t-" + k);
        let v = inp ? parseInt(inp.value, 10) : 0;
        if (isNaN(v) || v < 0) v = 0;
        troops[k] = v;
      }
      if (troops.t11 && !heroChk.checked) troops.t11 = 0;

      const existing = targetInList(l);
      if (existing) {
        patchFM((fm) => {
          const ll = fm.byVillage[String(vid)].lists.find((x) => x.id === l.id);
          if (!ll) return;
          const t = ll.targets.find((x) => x.id === existing.id);
          if (!t) return;
          const isSame =
            TROOP_KEYS.every((k) => (troops[k] | 0) === (ll.troops[k] | 0)) &&
            heroChk.checked === (ll.heroFollow === true);
          t.troops = isSame ? null : { ...troops };
          t.heroFollow = heroChk.checked;
        });
        msg.style.display = "block";
        msg.textContent = `✎ Updated in ${l.name}`;
        showToast(`✎ Updated in ${l.name}`);
      } else {
        const newTarget = {
          id: uid("T"),
          name: target.name,
          x: target.x,
          y: target.y,
          player: target.player,
          playerId: target.playerId,
          tribe: target.tribe,
          population: target.population,
          distance: target.distance,
          isOasis: target.isOasis,
          addedAt: now(),
          status: "pending",
          lastRaid: null,
          troops: { ...troops },
          heroFollow: heroChk.checked,
          selected: true,
        };
        patchFM((fm) => {
          const ll = fm.byVillage[String(vid)].lists.find((x) => x.id === l.id);
          if (ll) ll.targets.push(newTarget);
        });
        msg.style.display = "block";
        msg.textContent = `✓ Added to ${l.name}`;
        showToast(`✓ Added to ${l.name}`);
      }
      // ★ به‌روزرسانی محتوا (دکمه Add → Edit در صورت نیاز)
      setTimeout(() => updateMapBoxContent(box, target, vid), 100);
    };

    removeBtn.onclick = () => {
      const list = currentList();
      const existing = targetInList(list);
      if (!list || !existing) return;
      patchFM((fm) => {
        const selected = fm.byVillage[String(vid)].lists.find(
          (item) => item.id === list.id,
        );
        if (selected)
          selected.targets = selected.targets.filter(
            (item) => item.id !== existing.id,
          );
      });
      showToast(`Removed from ${list.name}`);
      updateMapBoxContent(box, target, vid);
    };

    renderTroops();
  }

  // ─── Import ───
  function parseImportTargets(jsonStr) {
    try {
      const trimmed = String(jsonStr || "").trim();
      if (!trimmed) return { ok: false, error: "No data" };
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {}
      let sourceTargets = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.targets)
          ? parsed.targets
          : Array.isArray(parsed?.list?.targets)
            ? parsed.list.targets
            : null;
      if (!sourceTargets) {
        sourceTargets = trimmed
          .split(/\r?\n/)
          .map((line) => {
            const match = line.match(/(-?\d+)\s*[|,;\s]\s*(-?\d+)/);
            if (!match) return null;
            return {
              x: Number(match[1]),
              y: Number(match[2]),
              name: line.replace(match[0], "").trim(),
            };
          })
          .filter(Boolean);
      }
      const targets = sourceTargets
        .filter(
          (target) =>
            target &&
            Number.isInteger(Number(target.x)) &&
            Number.isInteger(Number(target.y)),
        )
        .map((target) => ({
          x: Number(target.x),
          y: Number(target.y),
          name: String(target.name || `${target.x}|${target.y}`),
          troops: target.troops || null,
          heroFollow: target.heroFollow,
          distance:
            typeof target.distance === "number" ? target.distance : null,
        }));
      if (!targets.length)
        return { ok: false, error: "No valid coordinates found" };
      return {
        ok: true,
        targets,
        skipped: sourceTargets.length - targets.length,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  function importList(jsonStr, vid, listId, action = "add") {
    const parsed = parseImportTargets(jsonStr);
    if (!parsed.ok) return parsed;
    const list = getBucket(vid)?.lists.find((item) => item.id === listId);
    if (!list) return { ok: false, error: "Target list not found" };
    const incoming = new Map();
    parsed.targets.forEach((target) =>
      incoming.set(`${target.x}|${target.y}`, target),
    );
    const before = list.targets.length;
    if (action === "remove") {
      const keys = new Set(incoming.keys());
      const removed = list.targets.filter((target) =>
        keys.has(`${target.x}|${target.y}`),
      ).length;
      if (removed) {
        if (!backupFM(`remove ${removed} targets from ${list.name}`)) {
          return { ok: false, error: "Backup failed; no changes made" };
        }
        patchFM((fm) => {
          const selected = fm.byVillage[String(vid)].lists.find(
            (item) => item.id === listId,
          );
          if (selected)
            selected.targets = selected.targets.filter(
              (target) => !keys.has(`${target.x}|${target.y}`),
            );
        });
      }
      return {
        ok: true,
        action,
        listName: list.name,
        removed,
        skipped: parsed.skipped,
      };
    }

    const existing = new Set(
      list.targets.map((target) => `${target.x}|${target.y}`),
    );
    const additions = Array.from(incoming.entries())
      .filter(([key]) => !existing.has(key))
      .map(([, target]) => ({
        id: uid("T"),
        name: target.name,
        x: target.x,
        y: target.y,
        player: null,
        playerId: null,
        tribe: null,
        population: null,
        distance: target.distance,
        isOasis: false,
        addedAt: now(),
        status: "pending",
        lastRaid: null,
        troops: target.troops,
        heroFollow: target.heroFollow,
        selected: true,
      }));
    if (additions.length) {
      if (!backupFM(`add ${additions.length} targets to ${list.name}`)) {
        return { ok: false, error: "Backup failed; no changes made" };
      }
      patchFM((fm) => {
        const selected = fm.byVillage[String(vid)].lists.find(
          (item) => item.id === listId,
        );
        if (selected) selected.targets.push(...additions);
      });
    }
    return {
      ok: true,
      action: "add",
      listName: list.name,
      added: additions.length,
      skipped:
        parsed.skipped + Math.max(0, parsed.targets.length - additions.length),
      previousCount: before,
    };
  }

  // ─── Boot ───
  async function boot() {
    try {
      log("boot v" + VERSION);
      log("URL:", location.href);

      await delay(600);

      if (isRallyTt0()) {
        clearStopRequest();
        injectPanel();
      }

      if (isMapPage()) {
        setTimeout(() => injectFarmBoxOnMap(), 800);
      }

      await handlePageLoad();

      setInterval(() => {
        try {
          if (isStopRequested()) {
            if (!isRallyTt0()) {
              const r = readRun();
              const vid = (r && r.sourceVid) || getVillageId() || "";
              if (vid)
                location.href = `/build.php?id=39&gid=16&tt=0&newdid=${vid}`;
              return;
            }
            clearStopRequest();
          }

          const run = readRun();
          if (run && !run.completed && !run.stopped && !isStopRequested()) {
            if (isRallySend()) updateFloatingStatus(run);
            else removeFloatingStatus();
          } else {
            removeFloatingStatus();
          }

          if (isRallyTt0() && !document.querySelector(".fm-panel"))
            injectPanel();
          if (isMapPage()) {
            const dialog = document.querySelector(
              '.dialogWrapper[data-context="map"]',
            );
            const tile = dialog?.querySelector("#tileDetails");
            const box = dialog?.querySelector(".fm-map-box");
            if (tile) {
              const tgt = extractMapTargetFromTile(tile);
              if (
                tgt &&
                (!box || box.dataset.targetKey !== `${tgt.x}|${tgt.y}`)
              )
                injectFarmBoxOnMap();
            }
          }

          updateResumeFloating();
          if (isDebugEnabled()) updateDebugBadge();

          if (
            run &&
            !run.stopped &&
            !run.completed &&
            !isStopRequested() &&
            run.phase === "submitted" &&
            run.phaseAt &&
            now() - run.phaseAt > STUCK_MS
          ) {
            if (detectSendTroopsForm()) {
              log("poll: stuck → reload");
              location.reload();
            }
          }
        } catch (e) {
          logErr("poll tick failed", e);
        }
      }, POLL_MS);

      try {
        const observer = new MutationObserver(() => {
          try {
            if (isRallyTt0() && !document.querySelector(".fm-panel"))
              injectPanel();
            if (isMapPage()) {
              const dialog = document.querySelector(
                '.dialogWrapper[data-context="map"]',
              );
              const tile = dialog?.querySelector("#tileDetails");
              const box = dialog?.querySelector(".fm-map-box");
              if (tile) {
                const tgt = extractMapTargetFromTile(tile);
                if (
                  tgt &&
                  (!box || box.dataset.targetKey !== `${tgt.x}|${tgt.y}`)
                )
                  injectFarmBoxOnMap();
              }
            }
          } catch (e) {
            logErr("observer failed", e);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      } catch (e) {}

      log("boot complete");
    } catch (e) {
      logErr("boot failed:", e);
    }
  }

  window.FM = {
    version: VERSION,
    state: readFM,
    run: readRun,
    clearRun: () => {
      clearRun();
      clearStopRequest();
      updateResumeFloating();
      removeFloatingStatus();
    },
    clearData: () => {
      if (!confirm("Clear all?")) return;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      clearAllRuns();
      clearStopRequest();
      location.reload();
    },
    logs: () => _logBuf.slice(),
    enableDebug: () => setDebugEnabled(true),
    disableDebug: () => setDebugEnabled(false),
    snapshot: () => readOwnTroopsSnapshot(),
    villageId: getVillageId,
    villageName: getVillageName,
    inject: injectPanel,
    injectMap: injectFarmBoxOnMap,
    stop: () => handleStopClick(),
    stopRequested: isStopRequested,
    clearStopRequest,
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
