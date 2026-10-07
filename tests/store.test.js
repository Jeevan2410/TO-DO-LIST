import { test } from "node:test";
import assert from "node:assert/strict";
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
} from "../src/store.js";

const task = (id, done = false) => ({ id, text: `Task ${id}`, done, createdAt: 1, doneAt: done ? 2 : null });
const ids = (tasks) => tasks.map((t) => t.id);

test("clean keeps one tidy line of text", () => {
  assert.equal(clean("  buy \n milk  "), "buy milk");
  assert.equal(clean("x".repeat(500)).length, MAX_LENGTH);
});

test("createTask builds a fresh, unfinished task", () => {
  assert.deepEqual(createTask("  Call mum ", { id: "a", now: 5 }), {
    id: "a",
    text: "Call mum",
    done: false,
    createdAt: 5,
    doneAt: null,
  });
  assert.notEqual(createTask("x").id, createTask("x").id);
});

test("addTasks puts new tasks first and skips empty ones", () => {
  const list = addTasks([task("a")], createTask("New", { id: "b" }), createTask("   ", { id: "c" }));
  assert.deepEqual(ids(list), ["b", "a"]);
});

test("toggleTask flips done and records when", () => {
  const [done] = toggleTask([task("a")], "a", 99);
  assert.equal(done.done, true);
  assert.equal(done.doneAt, 99);
  const [undone] = toggleTask([done], "a", 100);
  assert.equal(undone.done, false);
  assert.equal(undone.doneAt, null);
});

test("renameTask ignores blank names", () => {
  assert.equal(renameTask([task("a")], "a", " Walk ")[0].text, "Walk");
  const list = [task("a")];
  assert.equal(renameTask(list, "a", "   "), list);
});

test("remove, clear and count", () => {
  const list = [task("a"), task("b", true), task("c", true)];
  assert.deepEqual(ids(removeTask(list, "b")), ["a", "c"]);
  assert.deepEqual(ids(clearDone(list)), ["a"]);
  assert.deepEqual(counts(list), { all: 3, active: 1, done: 2 });
  assert.deepEqual(ids(visible(list, "done")), ["b", "c"]);
  assert.deepEqual(ids(visible(list, "nonsense")), ["a", "b", "c"]);
});

test("reorder moves shown tasks and leaves hidden ones in place", () => {
  const list = [task("a"), task("b", true), task("c"), task("d")];
  // Active filter shows a, c, d; drag d to the top.
  assert.deepEqual(ids(reorder(list, ["d", "a", "c"])), ["d", "b", "a", "c"]);
  // Unknown or duplicated ids leave the list alone.
  assert.equal(reorder(list, ["a", "a", "c"]), list);
  assert.equal(reorder(list, ["zzz"]), list);
});

test("moveTask steps a task up or down and stops at the ends", () => {
  const list = [task("a"), task("b"), task("c")];
  const shown = ids(list);
  assert.deepEqual(ids(moveTask(list, "c", -1, shown)), ["a", "c", "b"]);
  assert.deepEqual(ids(moveTask(list, "a", 1, shown)), ["b", "a", "c"]);
  assert.equal(moveTask(list, "a", -1, shown), list);
});

test("parseTasks keeps only well-formed tasks", () => {
  const stored = JSON.stringify([
    task("a"),
    { id: "a", text: "duplicate" },
    { id: "b", text: "   " },
    { id: 3, text: "bad id" },
    { id: "c", text: "<img src=x onerror=alert(1)>", done: "yes" },
  ]);
  const parsed = parseTasks(stored);
  assert.deepEqual(ids(parsed), ["a", "c"]);
  // Text stays text; the app renders it with textContent, never as HTML.
  assert.equal(parsed[1].text, "<img src=x onerror=alert(1)>");
  assert.equal(parsed[1].done, false);
  assert.deepEqual(parseTasks("not json"), []);
  assert.deepEqual(parseTasks(null), []);
  assert.deepEqual(parseTasks('{"a":1}'), []);
});

test("splitLines turns a pasted list into tasks", () => {
  assert.deepEqual(splitLines("- milk\n\n2. eggs\r\n[ ] bread\n* tea  "), ["milk", "eggs", "bread", "tea"]);
});

test("greeting follows the time of day", () => {
  assert.equal(greeting(3), "Good night");
  assert.equal(greeting(9), "Good morning");
  assert.equal(greeting(14), "Good afternoon");
  assert.equal(greeting(19), "Good evening");
  assert.equal(greeting(23), "Good night");
});
