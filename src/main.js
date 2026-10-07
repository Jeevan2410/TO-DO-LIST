import { celebrate, confetti } from "./confetti.js";
import {
  MAX_LENGTH,
  addTasks,
  clean,
  clearDone,
  counts,
  createTask,
  greeting,
  moveTask,
  parseTasks,
  removeTask,
  renameTask,
  reorder,
  splitLines,
  toggleTask,
  visible,
} from "./store.js";

const STORAGE_KEY = "todo:tasks";
const FILTER_NAMES = ["all", "active", "done"];
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const list = $("list");
const input = $("new-task");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const moving = () => !reduceMotion.matches;

const storage = {
  read(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage blocked (private mode, site data off): the list lasts for this visit.
    }
  },
};

const readFilter = () => (FILTER_NAMES.includes(location.hash.slice(1)) ? location.hash.slice(1) : "all");

const state = {
  tasks: parseTasks(storage.read(STORAGE_KEY)),
  filter: readFilter(),
  undo: null, // the list as it was before the last delete or clear
};

/* ---------- state changes ---------- */

function commit(tasks, { undo } = {}) {
  const before = state.tasks;
  state.tasks = tasks;
  storage.write(STORAGE_KEY, JSON.stringify(tasks));
  if (undo) offerUndo(undo, before);
  else dismissUndo();
  render();
}

function add(texts) {
  const added = texts.map((text) => createTask(text)).filter((task) => task.text);
  if (!added.length) return false;
  if (state.filter === "done") {
    // A new task would be invisible under "Done", so show everything.
    history.replaceState(null, "", "#all");
    state.filter = "all";
  }
  commit(addTasks(state.tasks, ...added));
  announce(added.length === 1 ? `Added ${added[0].text}` : `Added ${added.length} tasks`);
  return true;
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function toggle(id) {
  const task = state.tasks.find((t) => t.id === id);
  const row = rows.get(id);
  if (!task) return;
  const finishing = !task.done;
  if (finishing && row) {
    const box = row.querySelector(".box").getBoundingClientRect();
    confetti(box.left + box.width / 2, box.top + box.height / 2);
  }
  // Under a filter the task is about to leave: let the tick draw, then slide it out.
  const leaving = (state.filter === "active" && finishing) || (state.filter === "done" && !finishing);
  if (leaving && row && moving()) {
    row.classList.toggle("done", finishing);
    await pause(280);
    await animateOut([row]);
  }
  commit(toggleTask(state.tasks, id));
  const { all, active } = counts(state.tasks);
  if (finishing && all > 1 && active === 0) {
    celebrate();
    $("ring").classList.remove("complete");
    void $("ring").offsetWidth;
    $("ring").classList.add("complete");
    announce("Everything on your list is done");
  }
}

/** Slide rows out before they leave the list. */
function animateOut(elements) {
  if (!moving() || !elements.length) return Promise.resolve();
  return Promise.all(
    elements.map((row) => {
      row.style.pointerEvents = "none";
      const height = `${row.offsetHeight}px`;
      return row.animate(
        [
          { opacity: 1, transform: "none", height, marginBottom: "8px" },
          { opacity: 0, transform: "translateX(48px)", height, marginBottom: "8px", offset: 0.55 },
          { opacity: 0, transform: "translateX(48px)", height: "0px", marginBottom: "0px" },
        ],
        { duration: 420, easing: EASE, fill: "forwards" },
      ).finished;
    }),
  );
}

async function remove(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  await animateOut([rows.get(id)].filter(Boolean));
  commit(removeTask(state.tasks, id), { undo: `Deleted "${task.text}"` });
}

async function clearCompleted() {
  const done = state.tasks.filter((task) => task.done);
  if (!done.length) return;
  await animateOut(done.map((task) => rows.get(task.id)).filter(Boolean));
  commit(clearDone(state.tasks), { undo: done.length === 1 ? "Cleared 1 completed task" : `Cleared ${done.length} completed tasks` });
}

/* ---------- undo ---------- */

let undoTimer = 0;
function offerUndo(message, snapshot) {
  state.undo = snapshot;
  const toast = $("toast");
  $("toast-text").textContent = message;
  toast.hidden = false;
  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");
  clearTimeout(undoTimer);
  undoTimer = setTimeout(dismissUndo, 6000);
  announce(`${message}. Press Undo or Control Z to bring it back.`);
}

function dismissUndo() {
  state.undo = null;
  $("toast").hidden = true;
  clearTimeout(undoTimer);
}

function undo() {
  if (!state.undo) return;
  const snapshot = state.undo;
  commit(snapshot);
  announce("Restored");
}

/* ---------- rendering ---------- */

const rows = new Map(); // task id → <li>, reused between renders so rows can animate
let firstRender = true;

const ICONS = {
  grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  delete:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
};

function createRow(task) {
  const row = document.createElement("li");
  row.className = "task";
  row.dataset.id = task.id;
  // Only fixed markup goes through innerHTML; the task's own text is set with textContent below.
  row.innerHTML = `
    <button class="grip" type="button">${ICONS.grip}</button>
    <label class="check">
      <input type="checkbox" />
      <span class="box">${ICONS.check}</span>
      <span class="label-text"><span class="text"></span></span>
    </label>
    <button class="icon edit" type="button">${ICONS.edit}</button>
    <button class="icon delete" type="button">${ICONS.delete}</button>`;
  return row;
}

function updateRow(row, task) {
  row.classList.toggle("done", task.done);
  row.querySelector("input").checked = task.done;
  const text = row.querySelector(".text");
  if (text.textContent !== task.text) text.textContent = task.text;
  row.querySelector(".grip").setAttribute("aria-label", `Move "${task.text}". Use the arrow keys.`);
  row.querySelector(".edit").setAttribute("aria-label", `Edit "${task.text}"`);
  row.querySelector(".delete").setAttribute("aria-label", `Delete "${task.text}"`);
}

function render() {
  const shown = visible(state.tasks, state.filter);
  const animate = moving() && !firstRender;
  const focused = document.activeElement;

  // FLIP, step 1: remember where every row is now.
  const before = new Map();
  if (animate) for (const [id, row] of rows) before.set(id, row.getBoundingClientRect().top);

  const keep = new Set(shown.map((task) => task.id));
  for (const [id, row] of rows) {
    if (!keep.has(id)) {
      row.remove();
      rows.delete(id);
    }
  }
  const added = [];
  shown.forEach((task, index) => {
    let row = rows.get(task.id);
    if (!row) {
      row = createRow(task);
      rows.set(task.id, row);
      added.push(row);
    }
    updateRow(row, task);
    if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
  });

  // Moving a row in the DOM drops focus; put it back.
  if (focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });

  // FLIP, step 2: slide moved rows from their old place, drop new ones in.
  if (moving()) {
    added.forEach((row, i) => {
      row.animate([{ opacity: 0, transform: "translateY(-12px) scale(0.97)" }, { opacity: 1, transform: "none" }], {
        duration: 380,
        delay: firstRender ? 250 + i * 45 : 0,
        easing: EASE,
        fill: "backwards",
      });
    });
    if (animate) {
      for (const [id, top] of before) {
        const row = rows.get(id);
        if (!row) continue;
        const dy = top - row.getBoundingClientRect().top;
        if (Math.abs(dy) > 0.5) {
          row.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 360, easing: EASE });
        }
      }
    }
  }
  firstRender = false;
  renderSummary(shown.length);
}

let shownPercent = 0;
let percentFrame = 0;

function renderSummary(shownCount) {
  const { all, active, done } = counts(state.tasks);
  const percent = all ? Math.round((done / all) * 100) : 0;

  $("count-all").textContent = all;
  $("count-active").textContent = active;
  $("count-done").textContent = done;
  $("summary").textContent =
    all === 0 ? "Nothing planned yet" : active === 0 ? "Everything is done. Nice work." : `${active} of ${all} still to do`;
  $("ring-progress").style.strokeDashoffset = String(100 - percent);
  $("ring").setAttribute("aria-label", `${percent}% done`);
  countTo(percent);

  $("left").textContent = active === 1 ? "1 task left" : `${active} tasks left`;
  $("clear-done").disabled = done === 0;

  const empty = $("empty");
  empty.hidden = shownCount > 0;
  if (shownCount === 0) {
    $("empty-text").textContent =
      state.filter === "done"
        ? "Nothing finished yet. You've got this."
        : state.filter === "active" && all > 0
          ? "No tasks left. Enjoy the rest of your day."
          : "Your list is empty. Add your first task above.";
  }

  for (const tab of document.querySelectorAll("[data-filter]")) {
    const current = tab.dataset.filter === state.filter;
    if (current) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  placePill();
}

function countTo(target) {
  cancelAnimationFrame(percentFrame);
  const from = shownPercent;
  if (!moving() || from === target) {
    shownPercent = target;
    $("ring-label").textContent = `${target}%`;
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / 700, 1);
    shownPercent = Math.round(from + (target - from) * (1 - (1 - t) ** 3));
    $("ring-label").textContent = `${shownPercent}%`;
    if (t < 1) percentFrame = requestAnimationFrame(step);
  };
  percentFrame = requestAnimationFrame(step);
}

/** Slide the highlight under the current filter tab. */
function placePill() {
  const tab = document.querySelector(`[data-filter="${state.filter}"]`);
  const tabs = $("tabs");
  tabs.style.setProperty("--pill-x", `${tab.offsetLeft}px`);
  tabs.style.setProperty("--pill-w", `${tab.offsetWidth}px`);
}

function renderHeader() {
  const now = new Date();
  $("greeting").textContent = greeting(now.getHours());
  $("date").textContent = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

function announce(message) {
  $("announce").textContent = message;
}

/* ---------- editing ---------- */

function startEdit(row) {
  if (row.classList.contains("editing")) return;
  const task = state.tasks.find((t) => t.id === row.dataset.id);
  if (!task) return;
  const field = document.createElement("input");
  field.className = "edit-input";
  field.value = task.text;
  field.maxLength = MAX_LENGTH;
  field.setAttribute("aria-label", "Edit task");
  row.classList.add("editing");
  row.querySelector(".check").after(field);
  field.focus();
  field.select();

  let finished = false;
  const finish = (save) => {
    if (finished) return;
    finished = true;
    row.classList.remove("editing");
    field.remove();
    const text = clean(field.value);
    if (save && text && text !== task.text) {
      commit(renameTask(state.tasks, task.id, text));
      announce("Task renamed");
    }
    row.querySelector(".edit")?.focus({ preventScroll: true });
  };
  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter") finish(true);
    if (event.key === "Escape") {
      event.stopPropagation();
      finish(false);
    }
  });
  field.addEventListener("blur", () => finish(true));
}

/* ---------- drag to reorder ---------- */

function flip(elements, mutate) {
  const before = new Map(elements.map((el) => [el, el.getBoundingClientRect().top]));
  mutate();
  if (!moving()) return;
  for (const [el, top] of before) {
    const dy = top - el.getBoundingClientRect().top;
    if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 220, easing: EASE });
  }
}

list.addEventListener("pointerdown", (event) => {
  const grip = event.target.closest(".grip");
  if (!grip || event.button !== 0 || list.children.length < 2) return;
  const row = grip.closest(".task");
  event.preventDefault();
  grip.setPointerCapture(event.pointerId);

  const startY = event.clientY;
  const startTop = row.offsetTop;
  let desiredTop = startTop;
  row.classList.add("dragging");

  const follow = () => {
    row.style.transform = `translateY(${desiredTop - row.offsetTop}px)`;
  };
  const onMove = (move) => {
    desiredTop = startTop + (move.clientY - startY);
    const middle = desiredTop + row.offsetHeight / 2;
    // Move the neighbours, never the dragged row: taking it out of the DOM would drop pointer capture.
    for (;;) {
      const next = row.nextElementSibling;
      const previous = row.previousElementSibling;
      if (next && middle > next.offsetTop + next.offsetHeight / 2) {
        flip([next], () => list.insertBefore(next, row));
      } else if (previous && middle < previous.offsetTop + previous.offsetHeight / 2) {
        flip([previous], () => list.insertBefore(previous, row.nextElementSibling));
      } else {
        break;
      }
    }
    follow();
  };
  // Capture ends on release or cancel, so this one event covers both.
  const onUp = () => {
    grip.removeEventListener("pointermove", onMove);
    grip.removeEventListener("lostpointercapture", onUp);
    const offset = desiredTop - row.offsetTop;
    row.style.transform = "";
    row.classList.remove("dragging");
    if (moving() && offset) {
      row.animate([{ transform: `translateY(${offset}px)` }, { transform: "none" }], { duration: 220, easing: EASE });
    }
    const order = [...list.children].map((el) => el.dataset.id);
    const next = reorder(state.tasks, order);
    if (next.some((task, i) => task !== state.tasks[i])) {
      commit(next);
      announce("Task moved");
    }
  };
  grip.addEventListener("pointermove", onMove);
  grip.addEventListener("lostpointercapture", onUp);
});

/* ---------- events ---------- */

list.addEventListener("change", (event) => {
  if (event.target.matches('input[type="checkbox"]')) toggle(event.target.closest(".task").dataset.id);
});

list.addEventListener("click", (event) => {
  const row = event.target.closest(".task");
  if (!row) return;
  if (event.target.closest(".delete")) remove(row.dataset.id);
  else if (event.target.closest(".edit")) startEdit(row);
});

list.addEventListener("keydown", (event) => {
  const row = event.target.closest(".task");
  if (!row || event.target.matches(".edit-input")) return;
  const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
  if (vertical && (event.altKey || event.target.matches(".grip"))) {
    event.preventDefault();
    const shownIds = visible(state.tasks, state.filter).map((task) => task.id);
    commit(moveTask(state.tasks, row.dataset.id, event.key === "ArrowUp" ? -1 : 1, shownIds));
  } else if (event.key === "F2") {
    event.preventDefault();
    startEdit(row);
  }
});

$("add-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (add([input.value])) {
    input.value = "";
  } else {
    const form = $("add-form");
    form.classList.remove("shake");
    void form.offsetWidth;
    form.classList.add("shake");
    announce("Type a task first");
  }
  input.focus();
});

// Paste a list and every line becomes its own task.
input.addEventListener("paste", (event) => {
  const text = event.clipboardData?.getData("text") ?? "";
  const lines = splitLines(text);
  if (lines.length < 2) return;
  event.preventDefault();
  add(lines);
  input.value = "";
});

$("clear-done").addEventListener("click", clearCompleted);
$("undo").addEventListener("click", undo);

document.addEventListener("keydown", (event) => {
  const typing = event.target.matches?.('input:not([type="checkbox"]), textarea, [contenteditable]');
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z" && state.undo && !typing) {
    event.preventDefault();
    undo();
  } else if (!typing && (event.key === "/" || event.key === "n") && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    input.focus();
  }
});

addEventListener("hashchange", () => {
  state.filter = readFilter();
  render();
});

// Another tab changed the list: follow it.
addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY) return;
  state.tasks = parseTasks(event.newValue);
  render();
});

addEventListener("resize", placePill);
document.fonts?.ready.then(placePill);

/* ---------- theme ---------- */

function paintThemeButton() {
  $("theme").setAttribute("aria-label", `Switch to ${root.dataset.theme === "light" ? "dark" : "light"} theme`);
}

$("theme").addEventListener("click", (event) => {
  const next = root.dataset.theme === "light" ? "dark" : "light";
  const apply = () => {
    root.dataset.theme = next;
    storage.write("todo:theme", next);
    paintThemeButton();
  };
  if (!document.startViewTransition || !moving()) return apply();
  const box = event.currentTarget.getBoundingClientRect();
  root.style.setProperty("--reveal-x", `${box.left + box.width / 2}px`);
  root.style.setProperty("--reveal-y", `${box.top + box.height / 2}px`);
  document.startViewTransition(apply);
});

/* ---------- start ---------- */

renderHeader();
setInterval(renderHeader, 60 * 1000);
paintThemeButton();
render();
