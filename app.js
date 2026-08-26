// Class Discussion Board
// Firebase config is intentionally public; access control is handled by Firestore rules.

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
  topic: cleanUrlPart(urlParams.get("topic"), "general"),
  code: cleanUrlPart(urlParams.get("code"), "default")
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const pathPartsToThreads = [
  "semesters",
  BOARD_INFO.semester,
  "classes",
  BOARD_INFO.classCode,
  "topics",
  BOARD_INFO.topic,
  "codes",
  BOARD_INFO.code,
  "threads"
];

const ENABLE_POST_DISPLAY_TOGGLE = false;
const threadsRef = collection(db, ...pathPartsToThreads);

const threadListView = document.querySelector("#threadListView");
const singlePostView = document.querySelector("#singlePostView");
const singlePostContainer = document.querySelector("#singlePostContainer");
const backBtn = document.querySelector("#backBtn");

const threadList = document.querySelector("#threadList");
const searchInput = document.querySelector("#searchInput");
const boardStats = document.querySelector("#boardStats");

const newThreadBtn = document.querySelector("#newThreadBtn");
const newThreadDialog = document.querySelector("#newThreadDialog");
const newThreadForm = document.querySelector("#newThreadForm");
const cancelNewThread = document.querySelector("#cancelNewThread");
const postThreadButton = document.querySelector("#postThreadButton");
const newThreadSaving = document.querySelector("#newThreadSaving");
const pageTitle = document.querySelector("#pageTitle");
const contextLabel = document.querySelector("#contextLabel");
const homeButton = document.querySelector("#homeButton");
const expandAllBtn = document.querySelector("#expandAllBtn");
const displayModeButtons = document.querySelectorAll(".displayModeButton");
const postTemplate = document.querySelector("#postTemplate");
const commentTemplate = document.querySelector("#commentTemplate");

let allThreads = [];
let expandedPostIds = new Set();
let activeSinglePostId = null;
let unsubscribeByPostId = new Map();
let commentsByPostId = new Map();
let commentsLoadedPostIds = new Set();
let postDisplayMode = "full";

if (ENABLE_POST_DISPLAY_TOGGLE) {
  try {
    postDisplayMode =
      localStorage.getItem("discussionBoardPostDisplayModeV2") === "preview"
        ? "preview"
        : "full";
  } catch (error) {
    console.warn(
      "Could not load the saved message display preference.",
      error
    );
  }
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

function searchPreview(text, searchTerm) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  const matchIndex = cleaned.toLowerCase().indexOf(searchTerm.toLowerCase());

  if (!searchTerm || matchIndex === -1 || cleaned.length <= 170) {
    return plainPreview(cleaned);
  }

  const start = Math.max(0, matchIndex - 70);
  const end = Math.min(
    cleaned.length,
    matchIndex + searchTerm.length + 90
  );

  const excerpt = cleaned.slice(start, end).trim();

  return `${start > 0 ? "…" : ""}${excerpt}${
    end < cleaned.length ? "…" : ""
  }`;
}


function setHighlightedText(element, text, searchTerm) {
  const value = String(text || "");
  const term = String(searchTerm || "").trim();

  element.textContent = "";

  if (!term) {
    element.textContent = value;
    return;
  }

  const lowerValue = value.toLowerCase();
  const lowerTerm = term.toLowerCase();

  let cursor = 0;
  let matchIndex = lowerValue.indexOf(lowerTerm);

  while (matchIndex !== -1) {
    element.appendChild(
      document.createTextNode(value.slice(cursor, matchIndex))
    );

    const mark = document.createElement("mark");
    mark.className = "searchHighlight";
    mark.textContent = value.slice(
      matchIndex,
      matchIndex + term.length
    );

    element.appendChild(mark);

    cursor = matchIndex + term.length;
    matchIndex = lowerValue.indexOf(lowerTerm, cursor);
  }

  element.appendChild(
    document.createTextNode(value.slice(cursor))
  );
}


function setHighlightedMeta(element, thread, searchTerm) {
  const author = thread.author || "Anonymous";
  element.textContent = "posted by ";

  const authorSpan = document.createElement("span");

  setHighlightedText(authorSpan, author, searchTerm);

  element.appendChild(authorSpan);

  element.appendChild(
    document.createTextNode(
      ` · ${formatDate(thread.createdAt)}`
    )
  );
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

function getVisibleThreads() {
  const searchTerm =
    searchInput.value.trim().toLowerCase();

  if (!searchTerm) return allThreads;

  return allThreads.filter(thread => {
    const haystack =
      `${thread.title || ""} ` +
      `${thread.body || ""} ` +
      `${thread.author || ""}`;

    if (haystack.toLowerCase().includes(searchTerm)) {
      return true;
    }

    return threadHasMatchingReply(
      thread.id,
      searchTerm
    );
  });
}


function threadHasMatchingReply(
  postId,
  searchTerm = searchInput.value.trim().toLowerCase()
) {
  if (!searchTerm) return false;

  const comments =
    commentsByPostId.get(postId) || [];

  return comments.some(comment => {
    const haystack =
      `${comment.author || ""} ${comment.body || ""}`;

    return haystack
      .toLowerCase()
      .includes(searchTerm);
  });
}


function ensureReplyDataForSearch() {
  if (!searchInput.value.trim()) return;

  for (const thread of allThreads) {
    if (Number(thread.commentCount || 0) > 0) {
      listenForComments(thread.id);
    }
  }
}


function replySearchIsLoading() {
  if (!searchInput.value.trim()) return false;

  return allThreads.some(thread =>
    Number(thread.commentCount || 0) > 0 &&
    !commentsLoadedPostIds.has(thread.id)
  );
}

function updateExpandAllButton() {
  const visibleThreads = getVisibleThreads().filter(
    thread => Number(thread.commentCount || 0) > 0
  );

  const allVisibleExpanded =
    visibleThreads.length > 0 &&
    visibleThreads.every(thread =>
      expandedPostIds.has(thread.id)
    );

  expandAllBtn.disabled = visibleThreads.length === 0;

  expandAllBtn.classList.toggle(
    "repliesShown",
    allVisibleExpanded
  );

  expandAllBtn.textContent = allVisibleExpanded
    ? "Hide All Replies"
    : "Show All Replies";
}

function setPostDisplayMode(mode, shouldSave = true) {
  postDisplayMode = mode === "full" ? "full" : "preview";

  for (const button of displayModeButtons) {
    const isSelected =
      button.dataset.displayMode === postDisplayMode;

    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  }

  if (shouldSave) {
    try {
      localStorage.setItem(
        "discussionBoardPostDisplayModeV2",
        postDisplayMode
      );
    } catch (error) {
      console.warn(
        "Could not save the message display preference.",
        error
      );
    }
  }

  if (activeSinglePostId) {
    renderSinglePost();
  } else {
    renderThreadList();
  }
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}


function updateBoardStats(visibleThreads) {
  if (!boardStats) return;

  const totalThreads = allThreads.length;

  const totalReplies = allThreads.reduce(
    (sum, thread) => sum + Number(thread.commentCount || 0),
    0
  );

  const searchTerm = searchInput.value.trim();

  if (!searchTerm) {
    boardStats.textContent =
      `${totalThreads} ${pluralize(totalThreads, "thread")} · ` +
      `${totalReplies} ${pluralize(totalReplies, "reply", "replies")}`;

    return;
  }

  const visibleReplies = visibleThreads.reduce(
    (sum, thread) => sum + Number(thread.commentCount || 0),
    0
  );

  boardStats.textContent =
    `${visibleThreads.length} of ${totalThreads} ` +
    `${pluralize(totalThreads, "thread")} shown · ` +
    `${visibleReplies} of ${totalReplies} ` +
    `${pluralize(totalReplies, "reply", "replies")} included`;
}

function showThreadList() {
  activeSinglePostId = null;
  singlePostView.classList.add("hidden");
  threadListView.classList.remove("hidden");
  renderThreadList();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showSinglePost(thread) {
  activeSinglePostId = thread.id;
  expandedPostIds.add(thread.id);
  listenForComments(thread.id);

  threadListView.classList.add("hidden");
  singlePostView.classList.remove("hidden");

  renderSinglePost();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderSinglePost() {
  singlePostContainer.innerHTML = "";

  const thread = allThreads.find(item => item.id === activeSinglePostId);
  if (!thread) {
    singlePostContainer.innerHTML = `<div class="emptyState">This post could not be found.</div>`;
    return;
  }

  const node = buildPostNode(thread, { singleView: true });
  singlePostContainer.appendChild(node);
}

function commentsRefForPost(postId) {
  return collection(db, ...pathPartsToThreads, postId, "comments");
}

function postDocRef(postId) {
  return doc(db, ...pathPartsToThreads, postId);
}

function listenForComments(postId) {
  if (unsubscribeByPostId.has(postId)) return;

  const q = query(commentsRefForPost(postId), orderBy("createdAt", "asc"));

  const unsubscribe = onSnapshot(q, snapshot => {
    commentsByPostId.set(
      postId,
      snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }))
    );

    commentsLoadedPostIds.add(postId);

    if (activeSinglePostId === postId) {
      renderSinglePost();
    } else {
      renderThreadList();
    }
  }, error => {
      commentsLoadedPostIds.add(postId);

      console.error(
        "Could not load comments.",
        error
      );

      if (!activeSinglePostId) {
        renderThreadList();
      }
    }
  );

  unsubscribeByPostId.set(postId, unsubscribe);
}

function stopListeningForComments(postId) {
  if (activeSinglePostId === postId) return;

  const unsubscribe = unsubscribeByPostId.get(postId);
  if (unsubscribe) unsubscribe();

  unsubscribeByPostId.delete(postId);
  commentsByPostId.delete(postId);
  commentsLoadedPostIds.delete(postId);
}

function setPostExpanded(postId, shouldExpand) {
  if (shouldExpand) {
    expandedPostIds.add(postId);
    listenForComments(postId);
  } else {
    expandedPostIds.delete(postId);
    stopListeningForComments(postId);
  }

  renderThreadList();
}

function renderThreadList() {
  ensureReplyDataForSearch();

  const visibleThreads = getVisibleThreads();

  updateBoardStats(visibleThreads);

  threadList.innerHTML = "";

  if (visibleThreads.length === 0) {
    const emptyState =
      document.createElement("div");

    emptyState.className = "emptyState";

    if (searchInput.value.trim()) {
      emptyState.textContent =
        replySearchIsLoading()
          ? "Searching posts and replies…"
          : "No posts or replies match your search.";
    } else {
      emptyState.textContent =
        "No posts yet. Start the first one!";
    }

    threadList.appendChild(emptyState);
    updateExpandAllButton();

    return;
  }

  for (const thread of visibleThreads) {
    threadList.appendChild(
      buildPostNode(thread, {
        singleView: false
      })
    );
  }

  updateExpandAllButton();
}

function buildPostNode(thread, options = {}) {
  const node =
    postTemplate.content.firstElementChild.cloneNode(true);

  const hasMatchingReply =
    threadHasMatchingReply(thread.id);

  const isExpanded =
    options.singleView ||
    expandedPostIds.has(thread.id) ||
    hasMatchingReply;

  const replyCount = Number(thread.commentCount || 0);
  const hasReplies = replyCount > 0;

  const showFullPost =
    options.singleView || postDisplayMode === "full";

  const searchTerm = searchInput.value.trim();

  node.classList.toggle(
    "expanded",
    isExpanded && hasReplies
  );

  const expandButton =
    node.querySelector(".expandPostButton");

  const replyCountButton =
    node.querySelector(".replyCount");

  const titleButton =
    node.querySelector(".postTitleButton");

  const expandedArea =
    node.querySelector(".postExpanded");

  replyCountButton.textContent =
    `${replyCount} ${pluralize(
      replyCount,
      "reply",
      "replies"
    )}`;

  replyCountButton.disabled =
    !hasReplies ||
    options.singleView ||
    hasMatchingReply;

  replyCountButton.classList.toggle(
    "repliesVisible",
    hasReplies &&
      (options.singleView || hasMatchingReply)
  );

  replyCountButton.setAttribute(
    "aria-label",
    !hasReplies
      ? "No replies to show"
      : isExpanded
        ? "Hide replies"
        : "Show replies"
  );

  setHighlightedText(
    node.querySelector(".postTitle"),
    thread.title || "Untitled post",
    searchTerm
  );

  setHighlightedMeta(
    node.querySelector(".postMeta"),
    thread,
    searchTerm
  );

  const postPreview =
    node.querySelector(".postPreview");

  const visiblePostText = showFullPost
    ? (thread.body || "")
    : searchPreview(thread.body, searchTerm);

  setHighlightedText(
    postPreview,
    visiblePostText,
    searchTerm
  );

  postPreview.classList.toggle(
    "fullPostBody",
    showFullPost
  );

  expandedArea.classList.toggle(
    "hidden",
    !isExpanded || !hasReplies
  );

  expandButton.disabled = !hasReplies;

  expandButton.textContent =
    isExpanded && hasReplies ? "−" : "+";

  expandButton.setAttribute(
    "aria-label",
    !hasReplies
      ? "No replies to show"
      : isExpanded
        ? "Hide replies"
        : "Show replies"
  );

  if (options.singleView || hasMatchingReply) {
    expandButton.classList.add("hidden");
  } else {
    const toggleReplies = event => {
    event.stopPropagation();

    if (!hasReplies) return;

    setPostExpanded(
      thread.id,
      !expandedPostIds.has(thread.id)
    );
  };

  expandButton.addEventListener(
    "click",
    toggleReplies
  );

  replyCountButton.addEventListener(
    "click",
    toggleReplies
  );

    titleButton.addEventListener("click", event => {
      event.stopPropagation();
      showSinglePost(thread);
    });
  }

  setupTopReplyUI(node, thread);

  if (isExpanded && hasReplies) {
    renderCommentsForPost(node, thread);
  }

  return node;
}

function setupTopReplyUI(node, thread) {
  const replyToggle = node.querySelector(".topReplyToggle");
  const replyForm = node.querySelector(".topReplyForm");
  const replyCancel = node.querySelector(".topReplyCancel");
  const replyPostButton = node.querySelector(".topReplyPostButton");
  const replySaving = node.querySelector(".topReplySaving");

  function resetTopReplyUI() {
    replyForm.reset();
    replyForm.classList.add("hidden");
    replySaving.classList.add("hidden");
    replyToggle.classList.remove("hidden");

    replyForm.author.disabled = false;
    replyForm.body.disabled = false;
    replyPostButton.disabled = false;
    replyCancel.disabled = false;
  }

  function setTopReplySaving(isSaving) {
    replyForm.classList.add("hidden");
    replyToggle.classList.add("hidden");
    replySaving.classList.toggle("hidden", !isSaving);

    replyForm.author.disabled = isSaving;
    replyForm.body.disabled = isSaving;
    replyPostButton.disabled = isSaving;
    replyCancel.disabled = isSaving;
  }

  replyToggle.addEventListener("click", event => {
    event.stopPropagation();
    replyForm.classList.remove("hidden");
    replyToggle.classList.add("hidden");
    replyForm.author.focus();
  });

  replyCancel.addEventListener("click", event => {
    event.stopPropagation();
    resetTopReplyUI();
  });

  replyForm.addEventListener("submit", async event => {
    event.preventDefault();
    event.stopPropagation();

    if (replyPostButton.disabled) return;

    const replyData = {
      author: replyForm.author.value,
      body: replyForm.body.value,
      parentId: null
    };

    setTopReplySaving(true);

    try {
      await addComment(thread.id, replyData);
      resetTopReplyUI();
    } catch (error) {
      console.error("Could not post reply. Check Firebase config and Firestore rules.", error);
      alert("The reply could not be saved. Check your Firebase config and Firestore rules.");
      replySaving.classList.add("hidden");
      replyForm.classList.remove("hidden");
      replyToggle.classList.add("hidden");

      replyForm.author.disabled = false;
      replyForm.body.disabled = false;
      replyPostButton.disabled = false;
      replyCancel.disabled = false;
    }
  });
}

function renderCommentsForPost(postNode, thread) {
  const commentsTree = postNode.querySelector(".commentsTree");
  const comments = commentsByPostId.get(thread.id) || [];

  commentsTree.innerHTML = "";

  if (comments.length === 0) {
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
    commentsTree.appendChild(buildCommentNode(thread.id, rootComment, byParent));
  }
}

function buildCommentNode(postId, comment, byParent) {
  const node =
  commentTemplate.content.firstElementChild.cloneNode(true);

  const searchTerm = searchInput.value.trim();

  setHighlightedText(
    node.querySelector(".commentAuthor"),
    comment.author || "Anonymous",
    searchTerm
  );

  node.querySelector(".commentDate").textContent =
    formatDate(comment.createdAt);

  setHighlightedText(
    node.querySelector(".commentBody"),
    comment.body || "",
    searchTerm
  );

  const replyButton = node.querySelector(".replyToggle");
  const replyForm = node.querySelector(".inlineReplyForm");
  const cancelButton = node.querySelector(".cancelReply");
  const children = node.querySelector(".children");

  replyButton.addEventListener("click", () => {
    replyForm.classList.remove("hidden");
    replyButton.classList.add("hidden");
    replyForm.querySelector("input[name='author']").focus();
  });

  cancelButton.addEventListener("click", () => {
    replyForm.reset();
    replyForm.classList.add("hidden");
    replyButton.classList.remove("hidden");
  });

  replyForm.addEventListener("submit", async event => {
    event.preventDefault();

    const replyData = {
      author: replyForm.author.value,
      body: replyForm.body.value,
      parentId: comment.id
    };

    replyForm.reset();
    replyForm.classList.add("hidden");
    replyButton.classList.remove("hidden");

    try {
      await addComment(postId, replyData);
    } catch (error) {
      console.error("Could not post nested reply.", error);
      alert("The reply could not be saved. Check your Firebase config and Firestore rules.");
    }
  });

  const childComments = byParent.get(comment.id) || [];

  for (const child of childComments) {
    children.appendChild(buildCommentNode(postId, child, byParent));
  }

  return node;
}

async function addComment(postId, { author, body, parentId = null }) {
  await addDoc(commentsRefForPost(postId), {
    author: author.trim(),
    body: body.trim(),
    parentId,
    createdAt: serverTimestamp()
  });

  await updateDoc(postDocRef(postId), {
    commentCount: increment(1),
    updatedAt: serverTimestamp()
  });
}

function listenForThreads() {
  const q = query(threadsRef, orderBy("createdAt", "desc"));

  onSnapshot(q, snapshot => {
    allThreads = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    if (activeSinglePostId) {
      renderSinglePost();
    } else {
      renderThreadList();
    }
  }, error => {
    threadList.innerHTML = `<div class="emptyState">Could not load posts. Check your Firebase config and Firestore rules.</div>`;
    console.error(error);
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

expandAllBtn.addEventListener("click", () => {
  const visibleThreads = getVisibleThreads().filter(
    thread => Number(thread.commentCount || 0) > 0
  );

  const allVisibleExpanded =
    visibleThreads.length > 0 &&
    visibleThreads.every(thread =>
      expandedPostIds.has(thread.id)
    );

  if (allVisibleExpanded) {
    for (const thread of visibleThreads) {
      expandedPostIds.delete(thread.id);
      stopListeningForComments(thread.id);
    }
  } else {
    for (const thread of visibleThreads) {
      expandedPostIds.add(thread.id);
      listenForComments(thread.id);
    }
  }

  renderThreadList();
});

for (const button of displayModeButtons) {
  button.addEventListener("click", () => {
    setPostDisplayMode(button.dataset.displayMode);
  });
}

homeButton.addEventListener("click", showThreadList);
backBtn.addEventListener("click", showThreadList);

searchInput.addEventListener("input", () => {
  if (searchInput.value.trim()) {
    ensureReplyDataForSearch();
  } else {
    for (const thread of allThreads) {
      if (!expandedPostIds.has(thread.id)) {
        stopListeningForComments(thread.id);
      }
    }
  }

  renderThreadList();
});

pageTitle.textContent = `${formatClassCode(BOARD_INFO.classCode)}: ${formatTopicTitle(BOARD_INFO.topic)}`;

contextLabel.textContent =
  `${formatSemester(BOARD_INFO.semester)} / ${formatClassCode(BOARD_INFO.classCode)} / ${formatTopicTitle(BOARD_INFO.topic)}`;

document.title = pageTitle.textContent;

setPostDisplayMode(postDisplayMode, false);
listenForThreads();
