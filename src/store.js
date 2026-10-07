// Pure task-list operations. Every function returns a new array and never touches the DOM,
// so the app's behaviour is covered by tests/store.test.js.

export const MAX_LENGTH = 200;

/** One line of plain text: collapsed whitespace, trimmed, capped. */
export const clean = (text) => String(text).replace(/\s+/g, " ").trim().slice(0, MAX_LENGTH);

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function createTask(text, { id = newId(), now = Date.now() } = {}) {
  return { id, text: clean(text), done: false, createdAt: now, doneAt: null };
}

/** New tasks go on top, next to the box they were typed in. */
export const addTasks = (tasks, ...added) => [...added.filter((task) => task.text), ...tasks];

export const toggleTask = (tasks, id, now = Date.now()) =>
  tasks.map((task) => (task.id === id ? { ...task, done: !task.done, doneAt: task.done ? null : now } : task));

export function renameTask(tasks, id, text) {
  const value = clean(text);
  if (!value) return tasks;
  return tasks.map((task) => (task.id === id ? { ...task, text: value } : task));
}

export const removeTask = (tasks, id) => tasks.filter((task) => task.id !== id);

export const clearDone = (tasks) => tasks.filter((task) => !task.done);

export const FILTERS = {
  all: () => true,
  active: (task) => !task.done,
  done: (task) => task.done,
};

export const visible = (tasks, filter) => tasks.filter(FILTERS[filter] ?? FILTERS.all);

export function counts(tasks) {
  const done = tasks.filter((task) => task.done).length;
  return { all: tasks.length, active: tasks.length - done, done };
}

/**
 * Put the shown tasks into a new order. Hidden tasks (filtered out) keep their places, and the
 * shown ones fill the slots they already occupied.
 */
export function reorder(tasks, orderedIds) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const wanted = new Set(orderedIds);
  if (wanted.size !== orderedIds.length || orderedIds.some((id) => !byId.has(id))) return tasks;
  const queue = [...orderedIds];
  return tasks.map((task) => (wanted.has(task.id) ? byId.get(queue.shift()) : task));
}

/** Move one task up (-1) or down (+1) among the tasks shown. */
export function moveTask(tasks, id, step, shownIds) {
  const from = shownIds.indexOf(id);
  const to = from + step;
  if (from === -1 || to < 0 || to >= shownIds.length) return tasks;
  const order = [...shownIds];
  [order[from], order[to]] = [order[to], order[from]];
  return reorder(tasks, order);
}

/** Tasks read back from storage, keeping only well-formed entries. */
export function parseTasks(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const seen = new Set();
  return data.flatMap((item) => {
    if (typeof item?.id !== "string" || typeof item.text !== "string" || seen.has(item.id)) return [];
    const text = clean(item.text);
    if (!text) return [];
    seen.add(item.id);
    const done = item.done === true;
    return [
      {
        id: item.id,
        text,
        done,
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : 0,
        doneAt: done && Number.isFinite(item.doneAt) ? item.doneAt : null,
      },
    ];
  });
}

/** Several tasks from pasted text: one per non-empty line, list bullets stripped. */
export function splitLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => clean(line.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ xX]?\])\s+/, "")))
    .filter(Boolean);
}

export function greeting(hour) {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Good night";
}
