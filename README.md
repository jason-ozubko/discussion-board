# Class Discussion Board

A simple Reddit-style discussion topic for an online class.

## What this does

- Shows a front page of discussion posts
- Lets students create new posts
- Lets students reply to posts
- Supports nested replies/replies-to-replies
- Stores posts in Firebase Firestore
- Can be hosted on GitHub Pages

## Files

- `index.html` — page structure
- `style.css` — styling
- `app.js` — Firebase and discussion logic

## Setup

### 1. Create a Firebase project

Go to Firebase Console and create a new project.

### 2. Enable Firestore

In the Firebase Console:

- Build
- Firestore Database
- Create database
- Start in test mode while experimenting

### 3. Create a web app in Firebase

In Project Settings:

- General
- Your apps
- Add app
- Choose Web
- Copy the Firebase config object

### 4. Paste your Firebase config into `app.js`

Replace this section:

```js
const firebaseConfig = {
  apiKey: "PASTE-YOUR-API-KEY-HERE",
  authDomain: "PASTE-YOUR-PROJECT.firebaseapp.com",
  projectId: "PASTE-YOUR-PROJECT-ID",
  storageBucket: "PASTE-YOUR-PROJECT.appspot.com",
  messagingSenderId: "PASTE-YOUR-SENDER-ID",
  appId: "PASTE-YOUR-APP-ID"
};
```

### 5. Upload to GitHub Pages

Upload these files to a GitHub repo and enable GitHub Pages.

## Important note about security

The included version is intentionally simple. If Firestore is left in public test mode, anyone with the link can post.

For an actual class, you may eventually want one of these:

1. Keep it simple but use a hard-to-guess URL.
2. Add a shared class passcode.
3. Add Firebase login.
4. Moderate posts from the Firebase console.

## Optional: separate topics for different courses

In `app.js`, change this line:

```js
const COURSE_ID = "demo-course";
```

For example:

```js
const COURSE_ID = "psyc-383-spring-2026";
```


## Update note

This version hides the top-level post reply form until the user clicks `Reply`.
Both top-level replies and nested comment replies now include a `Cancel` button.


## Update note: post window behavior

The `Post Post` modal now closes immediately after clicking the button.
If Firebase is not configured or Firestore blocks the write, the page shows an alert and logs the error in the browser console.


## Update note: saving indicator

When a student clicks `Post Post`, the form fields become non-editable, the post button disappears, and a spinner/status message appears until Firebase confirms the save. This prevents repeated clicks.


## Update note: top-level reply submit behavior

When a student posts a reply directly under the main post, the form now disappears immediately and a small posting spinner is shown while Firebase confirms the save. This prevents repeated clicks and matches the nested comment reply behavior.


## Multiple topics from one GitHub Pages site

This version supports multiple discussion topics using URL arguments.

Example URLs:

```text
index.html?semester=fall2026&class=psyc250&topic=questions
index.html?semester=fall2026&class=psyc250&topic=paper-help
index.html?semester=fall2026&class=psyc383&topic=general
```

Each unique combination of `semester`, `class`, and `topic` creates a separate topic in Firestore.

The Firestore path is:

```text
semesters/{semester}/classes/{classCode}/topics/{topic}/posts/{postId}
```

Comments are stored under:

```text
semesters/{semester}/classes/{classCode}/topics/{topic}/posts/{postId}/comments/{commentId}
```

URL values are cleaned automatically:
- converted to lowercase
- spaces and unsafe characters become hyphens
- only letters, numbers, underscores, and hyphens are kept

For example:

```text
?semester=Fall 2026&class=PSYC 250&topic=Exam Questions
```

becomes:

```text
fall-2026 / psyc-250 / exam-questions
```

## Firestore testing rules for multi-topic version

For testing only:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /semesters/{semesterId}/classes/{classId}/topics/{topicId}/posts/{postId} {
      allow read, write: if true;

      match /comments/{commentId} {
        allow read, write: if true;
      }
    }
  }
}
```


## Update note: posts language and dynamic title

The interface now uses "posts" instead of "threads." The page title is generated from the URL:

```text
?class=psyc250&topic=general-questions
```

Displays as:

```text
PSYC250: General Questions
```

The `semester` URL argument is still used for Firebase organization but is not shown in the main page title.
