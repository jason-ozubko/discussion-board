// Class Discussion Board
// Replace this Firebase config with the config from your own Firebase project.
// Firebase Console > Project Settings > General > Your apps > Web app.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  updateDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDzQ94AYrxu6pUznJSwd20EgXXNL10k2eM",
  authDomain: "class-discussion-boards.firebaseapp.com",
  projectId: "class-discussion-boards",
  storageBucket: "class-discussion-boards.firebasestorage.app",
  messagingSenderId: "331939389198",
  appId: "1:331939389198:web:9805802857e192646bc15f",
  measurementId: "G-ND42V2LRK1"
};

// This app can serve many boards from the same GitHub Pages site.
// Example:
// index.html?semester=fall2026&class=psyc250&topic=questions

function cleanUrlPart(value, fallback) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned || fallback;
}

function formatClassCode(value) {
  return String(value || "class")
    .replace(/-/g, " ")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function formatTopicTitle(value) {
  return String(value || "general")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatSemester(value) {
  return String(value || "semester")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

const urlParams = new URLSearchParams(window.location.search);

const BOARD_INFO = {
  semester: cleanUrlPart(urlParams.get("semester"), "demo-semester"),
  classCode: cleanUrlPart(urlParams.get("class"), "demo-class"),
  topic: cleanUrlPart(urlParams.get("topic"), "general")
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const threadsRef = collection(
  db,
  "semesters",
  BOARD_INFO.semester,
  "classes",
  BOARD_INFO.classCode,
  "topics",
  BOARD_INFO.topic,
  "threads"
);

const threadListView = document.querySelector("#threadListView");
const threadView = document.querySelector("#threadView");
const threadList = document.querySelector("#threadList");
const commentsTree = document.querySelector("#commentsTree");
const searchInput = document.querySelector("#searchInput");
const pageTitle = document.querySelector("#pageTitle");
const contextLabel = document.querySelector("#contextLabel");
const homeButton = document.querySelector("#homeButton");

const newThreadBtn = document.querySelector("#newThreadBtn");
const newThreadDialog = document.querySelector("#newThreadDialog");
const newThreadForm = document.querySelector("#newThreadForm");
const cancelNewThread = document.querySelector("#cancelNewThread");
const postThreadButton = document.querySelector("#postThreadButton");
const newThreadSaving = document.querySelector("#newThreadSaving");
const backBtn = document.querySelector("#backBtn");

const threadTitle = document.querySelector("#threadTitle");
const threadMeta = document.querySelector("#threadMeta");
const threadBody = document.querySelector("#threadBody");
const topReplyToggle = document.querySelector("#topReplyToggle");
const topReplyForm = document.querySelector("#topReplyForm");
const topReplyCancel = document.querySelector("#topReplyCancel");
const topReplyPostButton = document.querySelector("#topReplyPostButton");
const topReplySaving = document.querySelector("#topReplySaving");
const commentTemplate = document.querySelector("#commentTemplate");

let allThreads = [];
let currentThread = null;
let unsubscribeComments = null;



function setTopReplySaving(isSaving) {
  topReplyForm.classList.add("hidden");
  topReplyToggle.classList.add("hidden");
  topReplySaving.classList.toggle("hidden", !isSaving);

  topReplyForm.author.disabled = isSaving;
  topReplyForm.body.disabled = isSaving;
  topReplyPostButton.disabled = isSaving;
  topReplyCancel.disabled = isSaving;
}

function resetTopReplyUI() {
  topReplyForm.reset();
  topReplyForm.classList.add("hidden");
  topReplySaving.classList.add("hidden");
  topReplyToggle.classList.remove("hidden");

  topReplyForm.author.disabled = false;
  topReplyForm.body.disabled = false;
  topReplyPostButton.disabled = false;
  topReplyCancel.disabled = false;
}

function setNewThreadFormSaving(isSaving) {
  newThreadForm.title.disabled = isSaving;
  newThreadForm.author.disabled = isSaving;
  newThreadForm.body.disabled = isSaving;
  cancelNewThread.disabled = isSaving;
  postThreadButton.disabled = isSaving;

  postThreadButton.classList.toggle("hidden", isSaving);
  newThreadSaving.classList.toggle("hidden", !isSaving);
}

function formatDate(timestamp) {
  if (!timestamp || !timestamp.toDate) return "just now";
  return timestamp.toDate().toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function plainPreview(text, maxLength = 170) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trim() + "…";
}

function showThreadList() {
  currentThread = null;

  if (unsubscribeComments) {
    unsubscribeComments();
    unsubscribeComments = null;
  }

  threadView.classList.add("hidden");
  threadListView.classList.remove("hidden");
}

function showThread(thread) {
  currentThread = thread;

  threadListView.classList.add("hidden");
  threadView.classList.remove("hidden");

  threadTitle.textContent = thread.title;
  threadMeta.textContent = `Posted by ${thread.author || "Anonymous"} · ${formatDate(thread.createdAt)} · ${thread.commentCount || 0} comments`;
  threadBody.textContent = thread.body || "";

  resetTopReplyUI();

  listenForComments(thread.id);
}

function renderThreadList() {
  const searchTerm = searchInput.value.trim().toLowerCase();

  const visibleThreads = allThreads.filter(thread => {
    const haystack = `${thread.title || ""} ${thread.body || ""} ${thread.author || ""}`.toLowerCase();
    return haystack.includes(searchTerm);
  });

  threadList.innerHTML = "";

  if (visibleThreads.length === 0) {
    threadList.innerHTML = `<div class="emptyState">No posts yet. Start the first one!</div>`;
    return;
  }

  for (const thread of visibleThreads) {
    const card = document.createElement("article");
    card.className = "threadCard";
    card.tabIndex = 0;
    card.innerHTML = `
      <h3></h3>
      <div class="meta"></div>
      <p></p>
    `;

    card.querySelector("h3").textContent = thread.title || "Untitled post";
    card.querySelector(".meta").textContent =
      `${thread.commentCount || 0} comments · posted by ${thread.author || "Anonymous"} · ${formatDate(thread.createdAt)}`;
    card.querySelector("p").textContent = plainPreview(thread.body);

    card.addEventListener("click", () => showThread(thread));
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") showThread(thread);
    });

    threadList.appendChild(card);
  }
}

function listenForThreads() {
  const q = query(threadsRef, orderBy("createdAt", "desc"));

  onSnapshot(q, snapshot => {
    allThreads = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    renderThreadList();

    if (currentThread) {
      const updatedThread = allThreads.find(t => t.id === currentThread.id);
      if (updatedThread) {
        currentThread = updatedThread;
        threadMeta.textContent =
          `Posted by ${updatedThread.author || "Anonymous"} · ${formatDate(updatedThread.createdAt)} · ${updatedThread.commentCount || 0} comments`;
      }
    }
  }, error => {
    threadList.innerHTML = `<div class="emptyState">Could not load posts. Check your Firebase config and Firestore rules.</div>`;
    console.error(error);
  });
}

function listenForComments(threadId) {
  if (unsubscribeComments) unsubscribeComments();

  const commentsRef = collection(
    db,
    "semesters",
    BOARD_INFO.semester,
    "classes",
    BOARD_INFO.classCode,
    "topics",
    BOARD_INFO.topic,
    "threads",
    threadId,
    "comments"
  );
  const q = query(commentsRef, orderBy("createdAt", "asc"));

  unsubscribeComments = onSnapshot(q, snapshot => {
    const comments = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    renderComments(comments);
  }, error => {
    commentsTree.innerHTML = `<div class="emptyState">Could not load comments.</div>`;
    console.error(error);
  });
}

function renderComments(comments) {
  commentsTree.innerHTML = "";

  if (comments.length === 0) {
    commentsTree.innerHTML = `<div class="emptyState">No comments yet. Be the first to reply.</div>`;
    return;
  }

  const byParent = new Map();

  for (const comment of comments) {
    const parentKey = comment.parentId || "ROOT";
    if (!byParent.has(parentKey)) byParent.set(parentKey, []);
    byParent.get(parentKey).push(comment);
  }

  const roots = byParent.get("ROOT") || [];

  for (const rootComment of roots) {
    commentsTree.appendChild(buildCommentNode(rootComment, byParent, 0));
  }
}

function buildCommentNode(comment, byParent, depth) {
  const node = commentTemplate.content.firstElementChild.cloneNode(true);

  node.querySelector(".commentAuthor").textContent = comment.author || "Anonymous";
  node.querySelector(".commentDate").textContent = formatDate(comment.createdAt);
  node.querySelector(".commentBody").textContent = comment.body || "";

  const replyButton = node.querySelector(".replyToggle");
  const replyForm = node.querySelector(".inlineReplyForm");
  const cancelButton = node.querySelector(".cancelReply");
  const children = node.querySelector(".children");

  replyButton.addEventListener("click", () => {
    replyForm.classList.remove("hidden");
    replyButton.classList.add("hidden");
    const authorInput = replyForm.querySelector("input[name='author']");
    authorInput.focus();
  });

  cancelButton.addEventListener("click", () => {
    replyForm.reset();
    replyForm.classList.add("hidden");
    replyButton.classList.remove("hidden");
  });

  replyForm.addEventListener("submit", async event => {
    event.preventDefault();
    await addComment({
      author: replyForm.author.value,
      body: replyForm.body.value,
      parentId: comment.id
    });
    replyForm.reset();
    replyForm.classList.add("hidden");
    replyButton.classList.remove("hidden");
  });

  const childComments = byParent.get(comment.id) || [];

  for (const child of childComments) {
    children.appendChild(buildCommentNode(child, byParent, depth + 1));
  }

  return node;
}

async function addComment({ author, body, parentId = null }) {
  if (!currentThread) return;

  const commentsRef = collection(
    db,
    "semesters",
    BOARD_INFO.semester,
    "classes",
    BOARD_INFO.classCode,
    "topics",
    BOARD_INFO.topic,
    "threads",
    currentThread.id,
    "comments"
  );

  await addDoc(commentsRef, {
    author: author.trim(),
    body: body.trim(),
    parentId,
    createdAt: serverTimestamp()
  });

  await updateDoc(doc(
    db,
    "semesters",
    BOARD_INFO.semester,
    "classes",
    BOARD_INFO.classCode,
    "topics",
    BOARD_INFO.topic,
    "threads",
    currentThread.id
  ), {
    commentCount: increment(1),
    updatedAt: serverTimestamp()
  });
}

newThreadBtn.addEventListener("click", () => {
  newThreadDialog.showModal();
});

cancelNewThread.addEventListener("click", () => {
  setNewThreadFormSaving(false);
  newThreadForm.reset();
  newThreadDialog.close();
});

newThreadForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (postThreadButton.disabled) return;

  const threadData = {
    title: newThreadForm.title.value.trim(),
    author: newThreadForm.author.value.trim(),
    body: newThreadForm.body.value.trim(),
    commentCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  setNewThreadFormSaving(true);

  try {
    await addDoc(threadsRef, threadData);
    newThreadForm.reset();
    newThreadDialog.close();
  } catch (error) {
    console.error("Could not save post. Check Firebase config and Firestore rules.", error);
    alert("The post could not be saved. Check your Firebase config and Firestore rules.");
  } finally {
    setNewThreadFormSaving(false);
  }
});

topReplyToggle.addEventListener("click", () => {
  topReplyForm.classList.remove("hidden");
  topReplyToggle.classList.add("hidden");
  topReplyForm.author.focus();
});

topReplyCancel.addEventListener("click", () => {
  resetTopReplyUI();
});

topReplyForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (topReplyPostButton.disabled) return;

  const replyData = {
    author: topReplyForm.author.value,
    body: topReplyForm.body.value,
    parentId: null
  };

  setTopReplySaving(true);

  try {
    await addComment(replyData);
    resetTopReplyUI();
  } catch (error) {
    console.error("Could not post reply. Check Firebase config and Firestore rules.", error);
    alert("The reply could not be saved. Check your Firebase config and Firestore rules.");
    topReplySaving.classList.add("hidden");
    topReplyForm.classList.remove("hidden");
    topReplyToggle.classList.add("hidden");

    topReplyForm.author.disabled = false;
    topReplyForm.body.disabled = false;
    topReplyPostButton.disabled = false;
    topReplyCancel.disabled = false;
  }
});

backBtn.addEventListener("click", showThreadList);
homeButton.addEventListener("click", showThreadList);
searchInput.addEventListener("input", renderThreadList);

pageTitle.textContent = `${formatClassCode(BOARD_INFO.classCode)}: ${formatTopicTitle(BOARD_INFO.topic)}`;

contextLabel.textContent =
  `${formatSemester(BOARD_INFO.semester)} / ${formatClassCode(BOARD_INFO.classCode)} / ${formatTopicTitle(BOARD_INFO.topic)}`;

document.title = pageTitle.textContent;

listenForThreads();
