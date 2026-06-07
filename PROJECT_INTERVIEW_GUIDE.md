# StreamCore Lite — Complete Interview Mastery Guide

> **Purpose:** Interview preparation for Backend Intern roles.  
> **Basis:** Actual implementation in this codebase only. No assumed features.  
> **Project:** StreamCore Lite — Node.js, Express, MongoDB, Mongoose, JWT, Cloudinary.

---

## Table of Contents

1. [Project Overview](#section-1-project-overview)
2. [Complete Request Flow](#section-2-complete-request-flow)
3. [Folder Structure Explanation](#section-3-folder-structure-explanation)
4. [Database Design](#section-4-database-design)
5. [Authentication Deep Dive](#section-5-authentication-deep-dive)
6. [Cloudinary Deep Dive](#section-6-cloudinary-deep-dive)
7. [MongoDB Aggregation Pipelines](#section-7-mongodb-aggregation-pipelines)
8. [Middleware Analysis](#section-8-middleware-analysis)
9. [API Design Analysis](#section-9-api-design-analysis)
10. [Error Handling](#section-10-error-handling)
11. [Security Analysis](#section-11-security-analysis)
12. [Future Scope](#section-12-future-scope)
13. [Project Limitations](#section-13-project-limitations)
14. [System Design Discussion](#section-14-system-design-discussion)
15. [Interview Preparation (150 Questions)](#section-15-interview-preparation)
16. [Mock Interview](#section-16-mock-interview)
17. [Resume Defense](#section-17-resume-defense)
18. [Hardest Possible Questions](#section-18-hardest-possible-questions)
19. [Quick Reference Card](#quick-reference-card)

---

## SECTION 1: PROJECT OVERVIEW

### What Problem This Project Solves

StreamCore Lite is a **YouTube-style backend API** for a video platform. It lets users:

- Register and authenticate securely
- Upload and manage videos (with thumbnails)
- Browse published videos
- Subscribe to channels
- Track watch history
- View channel profiles with subscriber counts

It is a **REST API only** — no frontend in this repo. A client (React, mobile, Postman) calls `/api/v1/*`.

### High-Level Architecture

```
Client (browser/app)
    ↓ HTTP + cookies / Bearer token
Express (app.js) — CORS, JSON parser, cookie-parser, routes
    ↓
Routes → Middleware (JWT, multer) → Controllers
    ↓
Mongoose Models → MongoDB (streamcore-lite DB)
    ↓
Cloudinary (media URLs stored in MongoDB, files not in DB)
```

**Startup order** (`src/index.js`):

1. `import "./env.js"` — loads `.env` **before** any module reads `process.env`
2. `import app` — wires Express
3. `connectDB()` — `mongoose.connect(MONGODB_URI/streamcore-lite)`
4. `app.listen(PORT)`

### Major Features

| Domain | Features |
|--------|----------|
| Auth | Register, login, logout, refresh token, change password, current user |
| User | Update account, avatar, cover image, channel profile, watch history |
| Video | Upload, update, delete, get one, list all (paginated) |
| Subscription | Subscribe / unsubscribe channel |

### Technologies Used and Why Each Was Chosen

| Tech | Role in This Project | Why Chosen |
|------|----------------------|------------|
| **Node.js** | Runtime | Standard for JS backends, async I/O for uploads |
| **Express** | HTTP server, routing, middleware | Lightweight, interview-standard, MVC-friendly |
| **MongoDB** | Primary datastore | Flexible schema for users/videos/subscriptions |
| **Mongoose** | ODM, schemas, hooks, aggregation | Validation, relationships, aggregation pipelines |
| **JWT** | Stateless access + refresh tokens | No server session store (no Redis in scope) |
| **bcrypt** | Password hashing | Industry standard, used in `user.model.js` pre-save hook |
| **cookie-parser** | Read `accessToken` / `refreshToken` cookies | HttpOnly cookie auth for browsers |
| **Cloudinary** | Host videos/images | CDN, transforms; DB only stores URLs |
| **Multer** | Multipart → disk temp files | Bridge before Cloudinary upload |
| **dotenv** | Config via `.env` | Secrets out of code; loaded in `env.js` first |

**Not used (by design):** Redis, Docker, Kafka, WebSockets, microservices, GraphQL.

### Project Workflow: Registration → Video Consumption

1. **Register** — `POST /api/v1/auth/register` → user in MongoDB; optional avatar/cover → Cloudinary → URLs saved. **No tokens issued** (register does not log you in).
2. **Login** — `POST /api/v1/auth/login` → bcrypt check → access + refresh JWT → refresh saved on user document → cookies set + JSON returns tokens.
3. **Upload video** — `POST /api/v1/videos` with `verifyJWT` → multer → Cloudinary (video + thumbnail) → `Video.create` with `owner: req.user._id`.
4. **Browse** — `GET /api/v1/videos` → aggregation, only `isPublished: true`.
5. **Watch** — `GET /api/v1/videos/:videoId` → views `+1` → if logged in, `watchHistory` updated (pull + push).
6. **Subscribe** — `POST /api/v1/subscriptions/c/:channelId`.
7. **Channel page** — `GET /api/v1/users/c/:username` → aggregation: subscriber counts, `isSubscribed`.
8. **History** — `GET /api/v1/users/watch-history` → aggregation with nested owner lookup.

### "Tell Me About Your Project" (60-Second Answer)

> "I built **StreamCore Lite**, a REST backend for a video platform similar to YouTube Lite. It uses **Node.js, Express, and MongoDB** with **Mongoose**, structured in **MVC**: routes, controllers, models, and middleware.
>
> Authentication uses **JWT access and refresh tokens** — refresh tokens are stored in the database and sent as **HTTP-only cookies** for security. Media is uploaded via **Multer** to a temp folder, then to **Cloudinary**; MongoDB only stores URLs.
>
> Core features include user registration, video CRUD, subscriptions, watch history, and two **MongoDB aggregation pipelines** for channel profiles and watch history with owner details.
>
> I focused on clean architecture, centralized error handling with `ApiError` and `asyncHandler`, and field projection so passwords and refresh tokens never leak in API responses."

---

## SECTION 2: COMPLETE REQUEST FLOW

### Global Middleware (Every Request)

Applied in `src/app.js`:

1. `cors` (origin from `CORS_ORIGIN`, `credentials: true`)
2. `express.json` (16kb limit)
3. `express.urlencoded`
4. `express.static("public")`
5. `cookieParser()`
6. Route handler
7. On unknown route → `ApiError(404)`
8. Error handler → `{ success, message, errors, stack? }`

### Standard Success Response Shape

`new ApiResponse(statusCode, data, message)` produces:

```json
{
  "statusCode": 200,
  "data": {},
  "message": "...",
  "success": true
}
```

---

### 1. Registration Flow

| Item | Detail |
|------|--------|
| **Route** | `POST /api/v1/auth/register` |
| **Route file** | `src/routes/auth.routes.js` |
| **Controller** | `src/controllers/auth.controller.js` → `registerUser` |

**Middleware sequence:**

1. Global Express middleware
2. `upload.fields([{ name: "avatar" }, { name: "coverImage" }])` — multer disk storage → `public/temp/`
3. `asyncHandler(registerUser)`

**Controller execution (numbered steps):**

1. Read `fullName, email, username, password` from `req.body` — all required.
2. `User.findOne({ $or: [{ username }, { email }] })` — throw 409 if exists.
3. If files present: read `req.files.avatar[0].path`, `req.files.coverImage[0].path`.
4. `uploadOnCloudinary(path)` for each (default `resource_type: "auto"`).
5. `User.create({ ..., username: username.toLowerCase(), avatar: url || "", coverImage: url || "" })` — password hashed by **pre-save hook** (bcrypt, 10 rounds).
6. `User.findById().select(USER_SAFE_FIELDS)` — excludes password, refreshToken, __v, watchHistory.
7. `res.status(201).json(new ApiResponse(201, createdUser, ...))`.

**Database operations:** One `insert` on `users` collection.

**Cloudinary interactions:** Optional avatar and cover upload; temp files deleted in `uploadOnCloudinary` `finally` block.

**Response generation:** `ApiResponse` with safe user object. **No JWT / cookies on register.**

---

### 2. Login Flow

| Item | Detail |
|------|--------|
| **Route** | `POST /api/v1/auth/login` |
| **Middleware** | None (public) |

**Controller execution (numbered steps):**

1. Require `username` OR `email` + `password`.
2. `User.findOne({ $or: [{ username }, { email }] })` — 404 if missing.
3. `user.isPasswordCorrect(password)` — bcrypt compare.
4. `generateAccessAndRefreshTokens(user._id)` (`auth.controller.js`):
   - `user.generateAccessToken()` / `generateRefreshToken()` (model methods)
   - `user.refreshToken = refreshToken` → `user.save({ validateBeforeSave: false })`
5. Fetch user with `USER_SAFE_FIELDS`.
6. Set cookies: `accessToken`, `refreshToken` with `COOKIE_OPTIONS` + `maxAge: 10 days`.
7. Response: `{ user, accessToken, refreshToken }` in `data`.

**Database operations:** Read user, update `refreshToken` on user document.

**Cloudinary interactions:** None.

**Response generation:** Cookies + `ApiResponse` with user and tokens.

---

### 3. Refresh Token Flow

| Item | Detail |
|------|--------|
| **Route** | `POST /api/v1/auth/refresh-token` |
| **Middleware** | None |

**Controller execution (numbered steps):**

1. Read token from `req.cookies.refreshToken` OR `req.body.refreshToken`.
2. `jwt.verify(token, REFRESH_TOKEN_SECRET)` → `decoded._id`.
3. `User.findById` — full document (includes `refreshToken` field).
4. Compare `incomingRefreshToken === user.refreshToken` (DB whitelist).
5. `generateAccessAndRefreshTokens` — **rotates** refresh token in DB.
6. Set new cookies + JSON `{ accessToken, refreshToken }`.

**Database operations:** Read user, overwrite `refreshToken`.

**Cloudinary interactions:** None.

**Response generation:** New cookies + `ApiResponse`.

---

### 4. Logout Flow

| Item | Detail |
|------|--------|
| **Route** | `POST /api/v1/auth/logout` |
| **Middleware** | `verifyJWT` |

**Controller execution (numbered steps):**

1. `verifyJWT` sets `req.user` (safe fields).
2. `User.findByIdAndUpdate(req.user._id, { $unset: { refreshToken: 1 } })`.
3. `clearCookie("accessToken")`, `clearCookie("refreshToken")` with `maxAge: 0`.
4. `ApiResponse(200, {}, "User logged out successfully")`.

**Database operations:** Unset `refreshToken` on user.

**Cloudinary interactions:** None.

---

### 5. Current User Flow

| Item | Detail |
|------|--------|
| **Route** | `GET /api/v1/auth/current-user` |
| **Middleware** | `verifyJWT` |

**verifyJWT execution (`src/middlewares/auth.middleware.js`):**

1. Token from `req.cookies.accessToken` OR `Authorization: Bearer <token>`.
2. `jwt.verify(token, ACCESS_TOKEN_SECRET)`.
3. `User.findById(decoded._id).select(USER_SAFE_FIELDS)`.
4. `req.user = user` → `next()`.

**Controller execution:**

1. Return `req.user` as `data` — no extra DB query.

---

### 6. Avatar Upload Flow

| Item | Detail |
|------|--------|
| **Route** | `PATCH /api/v1/users/avatar` |
| **Middleware** | `verifyJWT` → `upload.single("avatar")` |

**Controller execution (numbered steps):**

1. Read `req.file.path` from multer (field name must be `avatar`).
2. `uploadOnCloudinary(avatarLocalPath)` → `response.url`.
3. `User.findByIdAndUpdate(req.user._id, { $set: { avatar: url } }).select(USER_SAFE_FIELDS)`.
4. Return updated user in `ApiResponse`.

**Cloudinary:** Upload image; temp file deleted after.

**Note:** Old Cloudinary asset is **not** deleted (`deleteFromCloudinary` exists but unused).

---

### 7. Cover Image Upload Flow

| Item | Detail |
|------|--------|
| **Route** | `PATCH /api/v1/users/cover-image` |
| **Middleware** | `verifyJWT` → `upload.single("coverImage")` |

**Controller execution (numbered steps):**

1. Read `req.file.path` (field name `coverImage`).
2. `uploadOnCloudinary(coverImageLocalPath)`.
3. `User.findByIdAndUpdate` with `coverImage: url`.
4. Return updated user.

Same pattern as avatar upload.

---

### 8. Video Upload Flow

| Item | Detail |
|------|--------|
| **Route** | `POST /api/v1/videos` |
| **Middleware** | `verifyJWT` → `upload.fields([videoFile, thumbnail])` |

**Controller execution (numbered steps):**

1. Validate `title` required.
2. Require both `videoFile` and `thumbnail` paths or 400.
3. `uploadOnCloudinary(videoPath, { resource_type: "video" })`.
4. `uploadOnCloudinary(thumbnailPath)` — default auto (image).
5. `Video.create({ title, description, duration, isPublished, videoFile: url, thumbnail: url, owner: req.user._id })`.
6. `Video.findById().populate("owner", "username fullName avatar")`.
7. `201` + `ApiResponse`.

**Database operations:** Insert on `videos` collection.

**Cloudinary:** Video + thumbnail upload.

---

### 9. Get Video Flow

| Item | Detail |
|------|--------|
| **Route** | `GET /api/v1/videos/:videoId` |
| **Middleware** | `optionalVerifyJWT` |

**Controller execution (numbered steps):**

1. Validate ObjectId.
2. `Video.findByIdAndUpdate(videoId, { $inc: { views: 1 } }, { new: true }).populate("owner", "username fullName avatar")`.
3. If `req.user?._id`:
   - `$pull: { watchHistory: videoId }`
   - `$push: { watchHistory: videoId }` — moves video to end (recency).
4. Return video document.

**Anonymous users:** Views increment; watch history **not** updated.

---

### 10. Watch History Flow

| Item | Detail |
|------|--------|
| **Route** | `GET /api/v1/users/watch-history` |
| **Middleware** | `verifyJWT` |

**Aggregation** (`src/controllers/user.controller.js`):

1. `$match` logged-in user `_id`.
2. `$lookup` `videos` on `watchHistory` array with sub-pipeline:
   - Nested `$lookup` `users` for `owner`
   - `$project` owner: username, fullName, avatar
   - `$addFields`: `owner: { $first: "$owner" }`
3. `$project: { watchHistory: 1 }`.
4. Response `data` = `user[0]?.watchHistory || []` (array of videos).

---

### 11. Subscribe Flow

| Item | Detail |
|------|--------|
| **Route** | `POST /api/v1/subscriptions/c/:channelId` |
| **Middleware** | `router.use(verifyJWT)` on entire subscription router |

**Controller execution (numbered steps):**

1. Validate `channelId` ObjectId.
2. Reject if `channelId === req.user._id` (can't subscribe to self).
3. `User.findById(channelId)` — 404 if missing.
4. `Subscription.findOne({ subscriber, channel })` — 409 if exists.
5. `Subscription.create({ subscriber: req.user._id, channel: channelId })`.
6. Return subscription document.

**Unique index:** `{ subscriber: 1, channel: 1 }` prevents duplicates at DB level.

---

### 12. Unsubscribe Flow

| Item | Detail |
|------|--------|
| **Route** | `DELETE /api/v1/subscriptions/c/:channelId` |
| **Middleware** | `verifyJWT` |

**Controller execution (numbered steps):**

1. `Subscription.findOneAndDelete({ subscriber: req.user._id, channel: channelId })`.
2. 404 if not found.
3. `ApiResponse(200, {}, ...)`.

---

### 13. Channel Profile Flow

| Item | Detail |
|------|--------|
| **Route** | `GET /api/v1/users/c/:username` |
| **Middleware** | `optionalVerifyJWT` |

**Dynamic pipeline (numbered steps):**

1. `$match` username (lowercased).
2. `$lookup` subscriptions where `channel = user._id` → `subscribers`.
3. `$lookup` subscriptions where `subscriber = user._id` → `subscribedTo`.
4. `$addFields`: `subscribersCount`, `subscribedToCount` via `$size`.
5. If `req.user`: `$addFields` `isSubscribed` = `$in` [userId, "$subscribers.subscriber"]`; else `false`.
6. `$project`: username, avatar, subscribersCount, subscribedToCount, isSubscribed.
7. 404 if empty array.

---

## SECTION 3: FOLDER STRUCTURE EXPLANATION

### Directory Layout

```
src/
├── controllers/   Business logic per resource
├── models/        Mongoose schemas + instance methods
├── routes/        URL → middleware → controller mapping
├── middlewares/   Cross-cutting: auth, uploads
├── utils/         Reusable helpers (errors, cloudinary)
├── db/            Database connection only
├── constants.js   Shared config strings
├── env.js         dotenv bootstrap (must load first)
├── app.js         Express app setup
└── index.js       Entry: env → DB → listen
```

### Why Each Folder Exists

| Folder | Purpose |
|--------|---------|
| **controllers** | HTTP-specific logic: read `req`, call DB/Cloudinary, send `res`. Keeps routes thin. |
| **models** | Single source of truth for schema, validation, password hashing, JWT methods. |
| **routes** | Declarative API map; easy to see auth requirements per endpoint. |
| **middlewares** | Reusable request pipeline steps (auth, file upload). |
| **utils** | Framework-agnostic helpers used across controllers. |
| **db** | Isolates connection logic from app wiring. |
| **constants** | DRY for cookie options, safe field projection, file limits. |

### Why MVC Architecture Was Chosen

- **Separation:** Routes don't contain DB queries; models don't know about HTTP.
- **Interview clarity:** Easy to explain "route → middleware → controller → model."
- **Testability:** Controllers can be reasoned about independently (though no tests in repo).

### Advantages of MVC

- Organized codebase for medium-sized APIs
- Familiar pattern for interviewers
- Clear boundaries between routing, business logic, and data layer
- Easy to onboard new developers

### Disadvantages of MVC

- Controllers can become fat (business logic in controllers + model methods)
- No dedicated service layer in this project
- Aggregation logic lives in controllers rather than repositories

---

## SECTION 4: DATABASE DESIGN

### User Model (`src/models/user.model.js`)

| Field | Type | Why It Exists |
|-------|------|---------------|
| `username` | String, unique, lowercase, indexed | Public handle; used in channel URL |
| `email` | String, unique, lowercase | Login identifier |
| `fullName` | String, required | Display name |
| `avatar` | String (URL) | Cloudinary image URL |
| `coverImage` | String (URL) | Channel banner URL |
| `password` | String, required | Hashed via pre-save hook |
| `refreshToken` | String | Latest valid refresh JWT (plain text in DB) |
| `watchHistory` | `[ObjectId]` ref Video | Ordered list of watched video IDs |
| `createdAt/updatedAt` | timestamps | Auto-managed |

**Instance methods:** `isPasswordCorrect`, `generateAccessToken`, `generateRefreshToken`.

**Hooks:** `pre("save")` hashes password when modified (bcrypt, 10 rounds).

**Relationships:** One user owns many videos; one user has many subscriptions (as subscriber or channel).

**Indexes:** `username` has `index: true`; `email` and `username` are `unique`.

**Validation:** Required fields on username, email, fullName, password.

### Video Model (`src/models/video.model.js`)

| Field | Why It Exists |
|-------|---------------|
| `title` | Required display title |
| `description` | Optional text |
| `videoFile` | Cloudinary video URL (required) |
| `thumbnail` | Cloudinary image URL (required) |
| `owner` | ObjectId → User, indexed |
| `views` | Counter, incremented on each get-by-id |
| `duration` | Number (seconds), default 0 |
| `isPublished` | Boolean, default `true`; `getAllVideos` filters `true` only |

**Relationships:** Many videos → one owner (User).

**Indexes:** `owner` field has `index: true`.

**Validation:** `title`, `videoFile`, `thumbnail`, `owner` required.

### Subscription Model (`src/models/subscription.model.js`)

| Field | Why It Exists |
|-------|---------------|
| `subscriber` | User who subscribes, indexed |
| `channel` | User being subscribed to, indexed |

**Relationships:** Many-to-many between users (asymmetric: subscriber → channel).

**Indexes:** Compound unique index `{ subscriber: 1, channel: 1 }` — one row per pair.

**Validation:** Both fields required.

### Likely Interview Questions — Database

**Q: Why is `watchHistory` on User, not a separate collection?**  
**A:** Simpler for internship scope; array of IDs with aggregation lookup. Tradeoff: unbounded array growth for heavy users.

**Q: What happens if two users subscribe simultaneously?**  
**A:** Unique index throws duplicate key error on second insert; controller also checks with `findOne` first (409).

**Q: Why index `owner` on Video?**  
**A:** Faster queries if you later add "videos by channel" features.

**Q: Why store Cloudinary URLs as strings, not subdocuments?**  
**A:** Only the URL is needed for client playback; keeps schema simple.

**Q: Why `versionKey: false` on schemas?**  
**A:** Removes `__v` from Mongoose JSON serialization.

---

## SECTION 5: AUTHENTICATION DEEP DIVE

### JWT in This Project

- **Access token:** Short-lived (`ACCESS_TOKEN_EXPIRY`, default `1d`). Payload: `_id, email, username, fullName`. Signed with `ACCESS_TOKEN_SECRET`. Used on every protected request via `verifyJWT`.
- **Refresh token:** Longer (`REFRESH_TOKEN_EXPIRY`, default `10d`). Payload: only `_id`. Signed with `REFRESH_TOKEN_SECRET`. Used only to get new access tokens.

### Why Both Access and Refresh Tokens Are Needed

| Access Token | Refresh Token |
|--------------|---------------|
| Sent often (every API call) | Sent rarely |
| Short-lived limits damage if stolen | Long-lived but revocable |
| Not stored in DB | Stored in DB for revocation |

### Why Refresh Token Is Stored in MongoDB

`refreshAccessToken` compares `incomingRefreshToken === user.refreshToken`. This enables:

- **Logout:** `$unset refreshToken` invalidates all refresh tokens.
- **Rotation:** Each refresh issues new token and overwrites DB value — old refresh JWT becomes useless.

### Why Refresh Token Is Stored in Cookies

`COOKIE_OPTIONS` in `src/constants.js`:

```javascript
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
};
```

- **httpOnly:** JavaScript cannot read it → mitigates XSS stealing refresh token.
- **secure:** HTTPS-only in production.
- **sameSite: strict:** CSRF mitigation for cross-site requests.

### Why Access Token Is Used for Authorization

Access token is verified on every protected route in `verifyJWT`. It is short-lived and carries user identity without a DB lookup on every request (only one `findById` after verify).

### Cookie Security Summary

- HttpOnly cookies for tokens on login/refresh
- `credentials: true` in CORS for cross-origin cookie sending
- `clearCookie` on logout with `maxAge: 0`

### Exact Login Flow (Code Trace)

1. Client `POST /api/v1/auth/login` with JSON body.
2. `loginUser` in `auth.controller.js` finds user, bcrypt compare.
3. `generateAccessAndRefreshTokens`: signs JWTs, saves refresh string on user doc.
4. Cookies set on response.
5. JSON returns user + both tokens (dual delivery for Postman/mobile).

### Authentication Interview Questions and Answers

**Q: Where is the access token verified?**  
**A:** `src/middlewares/auth.middleware.js` — `jwt.verify` then `User.findById`.

**Q: What if access token expires?**  
**A:** Client calls `POST /api/v1/auth/refresh-token` with refresh cookie/body.

**Q: Is refresh token hashed in DB?**  
**A:** **No** — stored as plain JWT string. Improvement: hash before store.

**Q: Does register auto-login?**  
**A:** **No** — only `login` and `refresh-token` issue tokens.

**Q: Can access token be revoked before expiry?**  
**A:** **Not directly** — no access-token blacklist. Logout only clears refresh token; access JWT valid until expiry unless you add a denylist.

**Q: What is in the access token payload?**  
**A:** `_id`, `email`, `username`, `fullName` — see `user.model.js` `generateAccessToken`.

**Q: What is in the refresh token payload?**  
**A:** Only `_id` — see `generateRefreshToken`.

**Q: How does verifyJWT read the token?**  
**A:** `req.cookies?.accessToken` OR `req.header("Authorization")?.replace("Bearer ", "")`.

**Q: Why validateBeforeSave: false when saving tokens?**  
**A:** Avoid full schema validation on partial update when only `refreshToken` changes.

**Q: Multi-device login behavior?**  
**A:** Last login overwrites `refreshToken` in DB — only one device's refresh remains valid.

---

## SECTION 6: CLOUDINARY DEEP DIVE

### Why Cloudinary Was Used

- Videos/images are large; MongoDB is for metadata only.
- CDN delivery, format optimization, `resource_type: "video"` support.
- Database stores only `avatar`, `coverImage`, `videoFile`, `thumbnail` **URLs**.

### Why Media Should Not Be Stored Directly in MongoDB

- MongoDB document size limit (16MB) makes binary video storage impractical.
- DB queries become slow and expensive.
- Cloudinary provides CDN, transformations, and streaming-friendly delivery.
- Separation of concerns: DB for metadata, object storage for media.

### Upload Process (`src/utils/cloudinary.js`)

1. `cloudinary.config()` at module load (requires `env.js` loaded first in `index.js`).
2. `uploadOnCloudinary(localFilePath, options)` calls `cloudinary.uploader.upload(path, { resource_type: "auto", ...options })`.
3. On success/failure, **local temp file deleted** in `finally` via `fs.unlinkSync`.

### File Handling Process

1. Client sends `multipart/form-data`.
2. Multer saves to `public/temp/`.
3. Controller passes `req.file.path` or `req.files.*.path` to `uploadOnCloudinary`.
4. Cloudinary returns object with `url` (and `public_id`, etc.).
5. Controller saves `url` to MongoDB.
6. Temp file removed locally.

### Multer Workflow (`src/middlewares/multer.middleware.js`)

1. **diskStorage** → `public/temp/fieldname-timestamp-random.ext`
2. **fileFilter** — only `ALLOWED_IMAGE_TYPES` or `ALLOWED_VIDEO_TYPES`
3. **limits** — `MAX_FILE_SIZE` = 50MB
4. Populates `req.file` (single) or `req.files` (fields)

### Temporary File Handling

- Directory: `path.join(process.cwd(), "public", "temp")`
- Created if not exists on module load
- Deleted in `uploadOnCloudinary` try/catch/finally

### Cloudinary Response Structure

Upload returns a Cloudinary result object. This project primarily uses:

- `response.url` — saved to MongoDB

Other fields available but not persisted: `public_id`, `secure_url`, `bytes`, `format`, etc.

### Cloudinary Interview Questions and Answers

**Q: Why not store files in MongoDB GridFS?**  
**A:** Cloudinary handles streaming/CDN; keeps DB small and queries fast.

**Q: What if Cloudinary upload fails mid-registration?**  
**A:** Register uploads before `User.create`; failed upload throws before user insert.

**Q: Is `deleteFromCloudinary` used?**  
**A:** **No** — exported in `cloudinary.js` but unused; old media orphaned on update/delete.

**Q: Why `resource_type: "video"` for video upload?**  
**A:** Explicit in `publishVideo` and `updateVideo` so Cloudinary treats file as video.

**Q: Why env.js must load before cloudinary.js?**  
**A:** `cloudinary.config()` reads `process.env` at module top level; ES modules evaluate imports before `index.js` body runs.

**Q: What MIME types are allowed?**  
**A:** Images: jpeg, png, webp. Videos: mp4, mpeg, webm, quicktime — see `src/constants.js`.

---

## SECTION 7: MONGODB AGGREGATION PIPELINES

### 1. Channel Profile Aggregation (`getUserChannelProfile`)

**File:** `src/controllers/user.controller.js`

| Stage | Purpose |
|-------|---------|
| `$match` | Find user by username (lowercased) |
| `$lookup` #1 | Join `subscriptions` where `channel = user._id` → `subscribers` |
| `$lookup` #2 | Join `subscriptions` where `subscriber = user._id` → `subscribedTo` |
| `$addFields` | `subscribersCount`, `subscribedToCount` = `$size` of arrays |
| `$addFields` (conditional) | `isSubscribed` for logged-in viewer via `$in` |
| `$project` | Whitelist: username, avatar, subscribersCount, subscribedToCount, isSubscribed |

**$lookup explained:** Joins the `subscriptions` collection (MongoDB pluralizes model name) to the user document.

**$addFields explained:** Adds computed fields without replacing the document.

**$project explained:** Shapes output to only public fields.

**Why aggregation was chosen:** One round-trip; counts computed in DB; demonstrates `$lookup` + `$addFields` + `$project` for interviews.

**Alternative approaches:**

- Three separate `countDocuments` queries — simpler but more latency.
- Embed subscriber count on User — denormalized, needs sync on subscribe/unsubscribe.
- `populate` — not ideal for counts across collections.

**Complexity considerations:** O(subscribers) memory for lookup arrays before project — fine at small scale; at scale use `$lookup` with `$count` pipeline or cached counts.

### 2. Watch History Aggregation (`getWatchHistory`)

| Stage | Purpose |
|-------|---------|
| `$match` | Current user by `_id` |
| `$lookup` videos | `localField: watchHistory` → preserves array order |
| Sub-pipeline on videos | Nested `$lookup` users for `owner`; `$project` safe owner fields; `$addFields` flatten with `$first` |
| `$project` | Return only `watchHistory` array |

**Why nested pipeline?** Attach owner info per video without N+1 queries from Node.

**Response shape:** `data` is the array directly (`user[0]?.watchHistory || []`), not wrapped in a user object.

### Difficult Aggregation Interview Questions

**Q: Does watch history order match watch order?**  
**A:** Array order in MongoDB; `getVideoById` uses pull+push to move latest to end — most recent at end of array.

**Q: Why `$first` on owner?**  
**A:** `$lookup` returns array; `$first` converts to single object.

**Q: Collection names in $lookup?**  
**A:** Lowercase plural: `subscriptions`, `videos`, `users`.

**Q: How is `isSubscribed` computed?**  
**A:** `$in: [req.user._id, "$subscribers.subscriber"]` when user is logged in; else hardcoded `false`.

**Q: Channel aggregation memory at 1M subscribers?**  
**A:** Full subscriber arrays loaded before `$size` — use `$lookup` with `$count` or denormalized counter field.

**Q: Why aggregation for getAllVideos owner?**  
**A:** Pagination with `$skip`/`$limit` in same pipeline as owner join — see `video.controller.js`.

---

## SECTION 8: MIDDLEWARE ANALYSIS

### verifyJWT (`src/middlewares/auth.middleware.js`)

- **Runs:** Before protected routes.
- **Fails:** 401 `ApiError` — caught by global handler.
- **Sets:** `req.user` without sensitive fields (`USER_SAFE_FIELDS`).
- **Wrapped in:** `asyncHandler` for promise rejection forwarding.

### optionalVerifyJWT (`src/middlewares/optionalAuth.middleware.js`)

- No token → `next()` silently (guest).
- Invalid token → swallowed, `next()` without `req.user`.
- Valid token → `req.user` set.
- **Used for:** channel profile (`isSubscribed`), get video (watch history).

### multer (`src/middlewares/multer.middleware.js`)

- Runs **before** controller.
- Rejects bad MIME with `ApiError(400)` in fileFilter.
- **Common mistake:** Wrong field name (`avatar` vs `file`) → `req.file` undefined.

### asyncHandler (`src/utils/asyncHandler.js`)

```javascript
const asyncHandler = (requestHandler) => {
  return (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err));
  };
};
```

Eliminates try/catch in every controller; forwards errors to Express error middleware.

### Execution Order Example (Video Upload)

```
cors → json → cookies → verifyJWT → multer.fields → asyncHandler(publishVideo) → error handler
```

### Benefits

- Reusable auth and upload logic
- Consistent error propagation
- Thin route definitions

### Common Mistakes

- Forgetting `credentials: 'include'` on frontend with cookies
- Wrong multipart field names
- Assuming register returns tokens
- Using `verifyJWT` where `optionalVerifyJWT` is needed

### Middleware Interview Questions

**Q: Why wrap verifyJWT in asyncHandler?**  
**A:** So rejected promises from `User.findById` go to `next(err)` consistently.

**Q: Difference between verifyJWT and optionalVerifyJWT?**  
**A:** Required vs optional auth; optional swallows invalid tokens.

**Q: Where is optionalVerifyJWT used?**  
**A:** `GET /users/c/:username`, `GET /videos/:videoId`.

---

## SECTION 9: API DESIGN ANALYSIS

### REST Principles Used

- Resource-based URLs (`/users`, `/videos`, `/subscriptions`)
- HTTP verbs for actions
- Stateless auth (JWT)
- JSON responses
- Version prefix `/api/v1`

### Route Naming Conventions

- Auth under `/api/v1/auth`
- Users under `/api/v1/users`
- Channel by username: `/users/c/:username`
- Subscriptions by channel ID: `/subscriptions/c/:channelId`

### HTTP Methods and Status Codes

| Method | Usage |
|--------|-------|
| GET | Read resources |
| POST | Create / actions (login, subscribe) |
| PATCH | Partial update |
| DELETE | Remove resource |

**Status codes in codebase:** 200, 201, 400, 401, 403, 404, 409, 500

### Every Endpoint — Why This HTTP Method

| Method | Endpoint | Why |
|--------|----------|-----|
| POST | `/auth/register` | Create user resource |
| POST | `/auth/login` | RPC-style action (common pattern) |
| POST | `/auth/logout` | Action, not DELETE session resource |
| POST | `/auth/refresh-token` | Action |
| POST | `/auth/change-password` | Action |
| GET | `/auth/current-user` | Read |
| PATCH | `/users/update-account` | Partial update |
| PATCH | `/users/avatar` | Partial update (file) |
| PATCH | `/users/cover-image` | Partial update |
| GET | `/users/c/:username` | Read channel |
| GET | `/users/watch-history` | Read |
| GET | `/videos` | List |
| POST | `/videos` | Create |
| GET | `/videos/:videoId` | Read |
| PATCH | `/videos/:videoId` | Partial update |
| DELETE | `/videos/:videoId` | Delete |
| POST | `/subscriptions/c/:channelId` | Create subscription |
| DELETE | `/subscriptions/c/:channelId` | Remove subscription |

### API Design Interview Questions

**Q: Why PATCH not PUT for avatar?**  
**A:** Partial resource update; only avatar field changes.

**Q: Why POST for logout not DELETE?**  
**A:** Common convention for session/token invalidation actions.

**Q: Why subscription returns 200 not 201?**  
**A:** Implementation choice in `subscribeChannel` — could argue 201 Created.

**Q: API versioning strategy?**  
**A:** `/api/v1` prefix allows v2 routes later without breaking clients.

---

## SECTION 10: ERROR HANDLING

### ApiError (`src/utils/ApiError.js`)

Custom error class with:

- `statusCode`
- `message`
- `success: false`
- `errors[]` array
- Stack trace capture

Thrown in controllers/middleware → caught by global handler in `app.js`.

### ApiResponse (`src/utils/ApiResponse.js`)

Success wrapper:

- `statusCode`
- `data`
- `message`
- `success: statusCode < 400`

### asyncHandler

Wraps async route handlers; `.catch(next)` forwards errors to Express error middleware. Without it, unhandled promise rejections may crash or hang the request.

### Centralized Error Handler (`src/app.js`)

```javascript
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  const errors = err.errors || [];

  if (process.env.NODE_ENV === "development") {
    console.error(err);
  }

  return res.status(statusCode).json({
    success: false,
    message,
    errors,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});
```

### Why Centralized Error Handling Is Useful

- Consistent client experience across all endpoints
- One place to add logging/monitoring later
- Controllers stay clean — throw `ApiError` instead of manual `res.status`
- Development-only stack traces

### Gap

`ApiError` instances may lose custom `errors` array usage in most throws — handler uses `message` and `statusCode` primarily.

### Error Handling Interview Questions

**Q: How do async errors reach the error handler?**  
**A:** `asyncHandler` catches and calls `next(err)`.

**Q: What happens for non-ApiError throws?**  
**A:** `statusCode` defaults to 500; `message` from Error.message.

**Q: When is stack trace exposed?**  
**A:** Only when `NODE_ENV === "development"`.

---

## SECTION 11: SECURITY ANALYSIS

### Security Measures Implemented

| Measure | Location |
|---------|----------|
| bcrypt (10 rounds) | `src/models/user.model.js` pre-save |
| JWT verification | `src/middlewares/auth.middleware.js` |
| Refresh token DB whitelist | `src/controllers/auth.controller.js` `refreshAccessToken` |
| HttpOnly cookies | `src/constants.js` `COOKIE_OPTIONS` |
| Field exclusion | `USER_SAFE_FIELDS` in queries |
| Owner-only video mutate | `src/controllers/video.controller.js` |
| MIME + size limits | `src/middlewares/multer.middleware.js` |
| CORS with credentials | `src/app.js` |
| ObjectId validation | video/subscription controllers |
| sameSite strict cookies | `COOKIE_OPTIONS` |

### Password Hashing

- Pre-save hook on User model
- `bcrypt.hash(this.password, 10)` when password modified
- `isPasswordCorrect` uses `bcrypt.compare`

### JWT Verification

- Access: `ACCESS_TOKEN_SECRET`
- Refresh: `REFRESH_TOKEN_SECRET`
- Separate secrets and expiry env vars

### Cookie Security

- httpOnly, secure in production, sameSite strict
- maxAge aligned with refresh cookie lifetime (10 days in login)

### Authorization Checks

- `verifyJWT` for protected routes
- Video update/delete: `video.owner.toString() !== req.user._id.toString()` → 403
- Subscribe: cannot subscribe to own channel

### Input Validation

- Required fields on register
- ObjectId validation before queries
- File type filter in multer
- 16kb JSON body limit

### Weaknesses (Be Honest in Interviews)

- Refresh token stored **plain** in DB
- No rate limiting — brute force on login
- No email verification / password reset
- Access token not revocable on logout
- `getVideoById` increments views for bots/refreshes — no dedup
- No helmet, no input sanitization beyond Mongoose
- `sortBy` in getAllVideos passed to aggregation — potential injection if not allowlisted
- Old Cloudinary files not deleted on update
- Register/login errors can leak whether email exists (409 vs 404)
- `getVideoById` does not check `isPublished` — unpublished videos accessible by ID
- Email update without explicit uniqueness check in controller

### Suggested Improvements

- Hash refresh tokens (SHA-256) before DB store
- Allowlist `sortBy` fields
- `express-rate-limit` on `/auth/login`
- `helmet()` for security headers
- Token versioning on user document for global logout
- Check `isPublished` on getVideoById unless requester is owner
- Wire `deleteFromCloudinary` on media update/delete

### Security Interview Questions

**Q: Is the JWT secret safe in .env?**  
**A:** Yes for development; production uses environment variables, never committed secrets.

**Q: Can XSS steal tokens?**  
**A:** HttpOnly cookies protect cookie-stored tokens from JS; Bearer token in memory is XSS-exposed if stored in localStorage by client.

**Q: CSRF protection?**  
**A:** sameSite strict helps; no CSRF token middleware present.

---

## SECTION 12: FUTURE SCOPE

### Redis Caching

- **Integration:** Cache `GET /videos` list and channel profile counts; invalidate on upload/subscribe.
- **Architecture fit:** New `src/utils/redis.js`; middleware or controller-layer cache check before MongoDB.

### Comments

- **Integration:** New `Comment` model: `video`, `user`, `text`; routes under `/api/v1/videos/:id/comments`.
- **Files:** `models/comment.model.js`, `controllers/comment.controller.js`, `routes/comment.routes.js`.

### Likes

- **Integration:** `Like` model or counter on Video; `verifyJWT` on like/unlike routes.

### Playlists

- **Integration:** `Playlist` model + `playlistItems[]`; separate controller and routes.

### Video Recommendations

- **Integration:** Service layer reading `watchHistory` + subscriptions; optional new route `/api/v1/videos/recommended`.

### Email Verification

- **Integration:** `isVerified` on User; nodemailer in auth controller post-register; verify endpoint.

### Password Reset

- **Integration:** Temporary token collection + `POST /auth/forgot-password` + `POST /auth/reset-password`.

### Video Processing

- **Integration:** Cloudinary webhooks or background job when upload completes; notify client when ready.

### Rate Limiting

- **Integration:** `express-rate-limit` middleware in `app.js` before routes; stricter on `/auth/login`.

### API Documentation

- **Integration:** Swagger/OpenAPI from route definitions; serve at `/api-docs`.

---

## SECTION 13: PROJECT LIMITATIONS

### Current Limitations

- Single Node process — CPU-bound uploads block event loop
- No pagination on watch history — large arrays slow aggregation
- Views count on every GET — inflated metrics, no bot deduplication
- No soft delete — hard delete videos with `findByIdAndDelete`
- Fat controllers — no service layer abstraction
- Synchronous file delete in Cloudinary util — brief blocking
- No automated tests — regression risk
- Only one active refresh token per user (last login wins)
- Access token not revocable until expiry on logout
- `deleteFromCloudinary` exported but never called

### Technical Debt

- Duplicate `.select()` patterns consolidated to `USER_SAFE_FIELDS` but aggregation paths may still expose `__v`
- `sortBy` query param not allowlisted
- Email uniqueness not checked on account update
- Multer `ApiError` in fileFilter may not always reach centralized handler uniformly

### Scalability Bottlenecks

- Channel profile aggregation loads full subscriber arrays
- User `watchHistory` array grows unbounded
- No read replicas or caching layer
- All uploads pass through single server disk then Cloudinary

### How to Improve Them

- Extract service layer for auth, video, subscription
- Move watch history to separate `WatchEvent` collection
- Add Redis caching for feeds and counts
- Implement allowlisted sort fields and rate limiting
- Add integration tests with `mongodb-memory-server`
- Hash refresh tokens; support multi-device sessions
- Add `isPublished` guard on `getVideoById`

---

## SECTION 14: SYSTEM DESIGN DISCUSSION

### 10,000 Users

- Likely fine on single MongoDB instance + Cloudinary.
- Monitor `watchHistory` array document size (16MB MongoDB doc limit).
- Add compound index `{ isPublished: 1, createdAt: -1 }` on videos if not present.

### 100,000 Users

**What would break:**

- Single server upload bandwidth
- MongoDB hot collections on `videos` list queries
- Channel aggregation memory for popular creators

**What needs scaling:**

- Read replicas for MongoDB
- Redis cache for video feed and channel counts
- CDN already handled by Cloudinary

**Database concerns:**

- Index optimization for list + search regex queries
- Consider text index instead of regex for search

**Caching opportunities:**

- Cache `GET /api/v1/videos` first page
- Cache channel subscriber counts with TTL

**Storage concerns:**

- Cloudinary plan limits; monitor bandwidth

### 1,000,000 Users

**What would break:**

- Aggregation on every channel view for large channels
- Unbounded `watchHistory` arrays on User documents
- Single Node event loop under concurrent uploads

**What needs scaling:**

- Horizontal API servers behind load balancer (stateless JWT — no sticky sessions)
- Shard MongoDB by `owner` or partition watch events
- Dedicated video processing pipeline (HLS transcoding)
- Separate read/write paths for analytics (views)

**Database concerns:**

- Denormalized subscriber counts on User
- Move watch history to time-series or event collection
- Archival strategy for old videos

**Caching opportunities:**

- Redis for feeds, sessions denylist, hot video metadata
- Edge CDN for thumbnails and video delivery (Cloudinary enterprise)

**Storage concerns:**

- Cloudinary costs at scale; consider S3 + CloudFront alternative
- Orphaned media cleanup jobs

---

## SECTION 15: INTERVIEW PREPARATION

### Beginner Questions (1–50)

**1. Q: What is StreamCore Lite?**  
**A:** Video platform REST API with auth, uploads, subscriptions, built with Node.js, Express, MongoDB.

**2. Q: Entry point?**  
**A:** `src/index.js`.

**3. Q: Why env.js?**  
**A:** ES modules load imports before `dotenv.config()` in index body; env must load first for Cloudinary and JWT secrets.

**4. Q: Database name?**  
**A:** `streamcore-lite` from `src/constants.js` appended to `MONGODB_URI`.

**5. Q: What is MVC here?**  
**A:** Routes → controllers → models.

**6. Q: What does verifyJWT do?**  
**A:** Validates access JWT, attaches `req.user` with safe fields.

**7. Q: Where is password hashed?**  
**A:** `src/models/user.model.js` pre-save hook, bcrypt 10 rounds.

**8. Q: What is USER_SAFE_FIELDS?**  
**A:** `-password -refreshToken -__v -watchHistory` in `src/constants.js`.

**9. Q: Where are videos stored?**  
**A:** Cloudinary URLs in MongoDB `videoFile` field.

**10. Q: What is multer's job?**  
**A:** Parse multipart, save temp files to `public/temp`.

**11. Q: Default port?**  
**A:** 8000 (`process.env.PORT || 8000`).

**12. Q: API version prefix?**  
**A:** `/api/v1`.

**13. Q: How to send token in header?**  
**A:** `Authorization: Bearer <accessToken>`.

**14. Q: Cookie names?**  
**A:** `accessToken`, `refreshToken`.

**15. Q: What is asyncHandler?**  
**A:** Catches async errors, calls `next(err)`.

**16. Q: What is ApiResponse?**  
**A:** Standard success JSON wrapper in `src/utils/ApiResponse.js`.

**17. Q: What is ApiError?**  
**A:** Custom error with HTTP status code in `src/utils/ApiError.js`.

**18. Q: Register route?**  
**A:** `POST /api/v1/auth/register`.

**19. Q: Login route?**  
**A:** `POST /api/v1/auth/login`.

**20. Q: Does register return tokens?**  
**A:** No.

**21. Q: Three models?**  
**A:** User, Video, Subscription.

**22. Q: Video owner field?**  
**A:** ObjectId ref to User.

**23. Q: Subscription fields?**  
**A:** subscriber, channel.

**24. Q: Unique on subscription?**  
**A:** Compound index subscriber+channel.

**25. Q: What increases video views?**  
**A:** `getVideoById` with `$inc: { views: 1 }`.

**26. Q: Public video list filter?**  
**A:** `isPublished: true` in `getAllVideos`.

**27. Q: Max upload size?**  
**A:** 50MB (`MAX_FILE_SIZE`).

**28. Q: Allowed images?**  
**A:** jpeg, png, webp.

**29. Q: CORS credentials?**  
**A:** `true` in `src/app.js`.

**30. Q: Health endpoint?**  
**A:** `GET /health`.

**31. Q: Where is Cloudinary configured?**  
**A:** `src/utils/cloudinary.js`.

**32. Q: What does populate do?**  
**A:** Replaces ObjectId with referenced document fields on video responses.

**33. Q: Can you subscribe to yourself?**  
**A:** No, 400 in `subscribeChannel`.

**34. Q: Logout clears what?**  
**A:** refreshToken in DB + both cookies.

**35. Q: optionalVerifyJWT purpose?**  
**A:** Auth when present, guest when absent.

**36. Q: Watch history updated when?**  
**A:** Logged-in user calls `GET /videos/:videoId`.

**37. Q: Channel profile URL param?**  
**A:** `:username`.

**38. Q: Subscribe URL param?**  
**A:** `:channelId` (ObjectId).

**39. Q: JSON body limit?**  
**A:** 16kb.

**40. Q: type module in package.json?**  
**A:** ES modules (`import/export`).

**41. Q: timestamps on models?**  
**A:** Yes, `createdAt`, `updatedAt`.

**42. Q: versionKey on schemas?**  
**A:** `false` — no `__v` in Mongoose docs.

**43. Q: refresh token payload?**  
**A:** Only `_id`.

**44. Q: access token payload?**  
**A:** `_id, email, username, fullName`.

**45. Q: Where is refresh token read on refresh?**  
**A:** Cookie or body.

**46. Q: change-password route?**  
**A:** `POST /api/v1/auth/change-password` + verifyJWT.

**47. Q: delete video also does?**  
**A:** Pulls videoId from all users' watchHistory.

**48. Q: temp folder path?**  
**A:** `public/temp`.

**49. Q: What happens to temp file after Cloudinary upload?**  
**A:** Deleted in `finally` block.

**50. Q: Is GraphQL used?**  
**A:** No.

### Intermediate Questions (51–100)

**51. Q: Why refresh token in DB and cookie?**  
**A:** Cookie for browser security; DB for revocation and rotation validation.

**52. Q: Token rotation flow?**  
**A:** refresh endpoint calls `generateAccessAndRefreshTokens` again, overwrites DB.

**53. Q: Why validateBeforeSave: false on token save?**  
**A:** Avoid full schema validation on partial update.

**54. Q: Why pull then push watch history?**  
**A:** Remove duplicate position, append to end for recency.

**55. Q: Channel isSubscribed without login?**  
**A:** Always `false`.

**56. Q: Why aggregation for channel?**  
**A:** Single query with counts and subscription check.

**57. Q: Collection name in $lookup?**  
**A:** Lowercase plural: `subscriptions`, `videos`, `users`.

**58. Q: Why not return watchHistory on current-user?**  
**A:** USER_SAFE_FIELDS excludes it; dedicated endpoint only.

**59. Q: 403 vs 401 in project?**  
**A:** 401 auth missing/invalid; 403 video owner mismatch.

**60. Q: register avatar optional?**  
**A:** Yes; empty string if not uploaded.

**61. Q: isPublished from form data?**  
**A:** String compare `=== "true"` (multipart).

**62. Q: Why PATCH for avatar not PUT?**  
**A:** Partial resource update.

**63. Q: subscription router pattern?**  
**A:** `router.use(verifyJWT)` applies to all routes.

**64. Q: Error handler exposes stack when?**  
**A:** `NODE_ENV === "development"`.

**65. Q: login find user with username OR email?**  
**A:** `$or` matches either from body.

**66. Q: Why lowercase username on create?**  
**A:** Consistency with schema `lowercase: true`.

**67. Q: getAllVideos pagination defaults?**  
**A:** page=1, limit=10, max limit 100.

**68. Q: Search in getAllVideos?**  
**A:** Regex on title and description, case insensitive.

**69. Q: Can anonymous upload video?**  
**A:** No, `verifyJWT` on POST.

**70. Q: updateVideo without files?**  
**A:** Updates only body fields in `updateData`.

**71. Q: deleteFromCloudinary used?**  
**A:** No.

**72. Q: Why bcrypt in hook not controller?**  
**A:** DRY; any save path hashes password.

**73. Q: What if wrong refresh token signature?**  
**A:** jwt.verify throws → 401.

**74. Q: What if refresh token valid JWT but wrong DB value?**  
**A:** 401 "Refresh token is expired or used".

**75. Q: MongoDB connection failure?**  
**A:** `process.exit(1)` in `src/db/connect.js`.

**76. Q: Why credentials true in CORS?**  
**A:** Browser sends cookies cross-origin to allowed origin.

**77. Q: Express static public folder purpose?**  
**A:** Serves public assets; temp files deleted after upload.

**78. Q: video route order?**  
**A:** `/` before `/:videoId` — correct.

**79. Q: Why 409 on duplicate subscribe?**  
**A:** Explicit check; unique index backup.

**80. Q: populate owner fields?**  
**A:** `username fullName avatar` only.

**81. Q: Why generateAccessToken on model?**  
**A:** Encapsulates signing logic with user context.

**82. Q: env load order proof?**  
**A:** `index.js` line 1: `import "./env.js"`.

**83. Q: ApiError in multer fileFilter?**  
**A:** Passed to cb(error) — may not hit handler uniformly.

**84. Q: Two ways to authenticate request?**  
**A:** Cookie accessToken or Bearer header.

**85. Q: refresh endpoint needs access token?**  
**A:** No.

**86. Q: getCurrentUser extra DB call?**  
**A:** No, uses req.user from middleware.

**87. Q: Why ObjectId validation?**  
**A:** Prevents CastError, returns 400 ApiError.

**88. Q: Watch history response shape?**  
**A:** `data` is array directly.

**89. Q: Channel profile returns email?**  
**A:** No, $project limits fields.

**90. Q: Video list returns unpublished?**  
**A:** No.

**91. Q: Who can delete video?**  
**A:** Only owner.

**92. Q: Subscription create returns?**  
**A:** Full subscription document.

**93. Q: unsubscribe idempotent?**  
**A:** No, 404 if not subscribed.

**94. Q: register checks empty strings?**  
**A:** `.trim() === ""` on required fields.

**95. Q: cloudinary resource_type for video?**  
**A:** Explicit `"video"` in publishVideo/updateVideo.

**96. Q: Why sameSite strict?**  
**A:** Reduces CSRF cookie sending.

**97. Q: access token expiry config?**  
**A:** `ACCESS_TOKEN_EXPIRY` env, default 1d in .env.example.

**98. Q: Why mongoose connect with DB_NAME suffix?**  
**A:** Separates DB on same cluster.

**99. Q: asyncHandler on verifyJWT?**  
**A:** Yes, for async User.findById errors.

**100. Q: Global 404 handler?**  
**A:** After all routes, ApiError 404.

### Advanced Questions (101–150)

**101. Q: Race on subscribe double-click?**  
**A:** Unique index throws; controller 409 on findOne.

**102. Q: JWT secret compromise impact?**  
**A:** Forge tokens; rotate secrets and invalidate refresh tokens.

**103. Q: sortBy injection risk?**  
**A:** User controls `{ [sortBy]: sortDirection }` — allowlist recommended.

**104. Q: watchHistory 16MB limit?**  
**A:** Theoretical if millions of ObjectIds in one doc.

**105. Q: Horizontal scaling JWT?**  
**A:** Stateless access tokens work; refresh DB shared.

**106. Q: Sticky sessions needed?**  
**A:** No for JWT API.

**107. Q: Why not session store?**  
**A:** Design choice; refresh in MongoDB instead.

**108. Q: Access token in localStorage vs cookie?**  
**A:** API supports both; cookie needs CSRF awareness for mutating routes.

**109. Q: Improve logout security?**  
**A:** Blacklist access JWT jti in Redis until expiry.

**110. Q: Cloudinary upload failure cleanup?**  
**A:** catch/finally deletes temp; user not created if fail before create on register.

**111. Q: Transactional subscribe + notify?**  
**A:** Not implemented; would need MongoDB transactions.

**112. Q: $lookup vs populate in getAllVideos?**  
**A:** Aggregation for pagination pipeline in one query.

**113. Q: Channel aggregation memory?**  
**A:** Full subscriber arrays loaded before $size — bad at millions.

**114. Q: Better subscriber count at scale?**  
**A:** `$lookup` with `$count` or maintained counter field.

**115. Q: getVideoById view inflation?**  
**A:** Every refresh increments; use dedup or time-window.

**116. Q: Optional auth invalid token?**  
**A:** Silently ignored; guest request.

**117. Q: Why refresh in body AND cookie?**  
**A:** Mobile/Postman may not use cookies.

**118. Q: password change re-hashes?**  
**A:** Yes, pre-save on `user.password = newPassword`.

**119. Q: Email update uniqueness?**  
**A:** Not checked in updateAccountDetails — duplicate possible.

**120. Q: ESM circular dependency risk?**  
**A:** env loaded first; cloudinary after env in index order.

**121. Q: Idempotency of refresh?**  
**A:** Old refresh invalid after rotation.

**122. Q: Multi-device login?**  
**A:** Last login overwrites refreshToken.

**123. Q: Improve multi-device?**  
**A:** Array of refresh tokens or device sessions collection.

**124. Q: Why bcrypt 10 rounds?**  
**A:** Balance security vs CPU.

**125. Q: Helmet missing?**  
**A:** Security headers not set.

**126. Q: NoSQL injection via query?**  
**A:** Mongoose casts; regex query — ReDoS possible.

**127. Q: File type trust?**  
**A:** MIME from client; magic-byte check stronger.

**128. Q: Concurrent video upload same user?**  
**A:** Multer unique filenames; no conflict.

**129. Q: delete video Cloudinary orphan?**  
**A:** URLs remain on Cloudinary.

**130. Q: Aggregation watch order?**  
**A:** `$lookup` preserves `watchHistory` array order in recent MongoDB.

**131. Q: Why $in for isSubscribed?**  
**A:** Checks if viewer ObjectId in subscribers.subscriber array.

**132. Q: Channel not found?**  
**A:** Empty aggregate → 404.

**133. Q: publishVideo isPublished default?**  
**A:** `true` if not provided.

**134. Q: Bearer prefix handling?**  
**A:** `.replace("Bearer ", "")` — first occurrence only.

**135. Q: cookie maxAge vs JWT expiry?**  
**A:** Both 10 days for cookies; JWT expiry from env — should align manually.

**136. Q: Why validateBeforeSave false on password change?**  
**A:** Same as token — may skip validators.

**137. Q: Index on username?**  
**A:** `index: true` in schema.

**138. Q: getAllVideos countDocuments separate?**  
**A:** Second query for total — correct pagination pattern.

**139. Q: Test strategy you'd add?**  
**A:** Supertest + mongodb-memory-server.

**140. Q: Why not WebSockets for views?**  
**A:** Out of project scope.

**141. Q: API versioning strategy?**  
**A:** `/v1` prefix.

**142. Q: Controller vs service layer?**  
**A:** Business logic in controllers; extract service at scale.

**143. Q: refresh catch wraps jwt errors?**  
**A:** Generic 401 with error.message.

**144. Q: register 500 when?**  
**A:** createdUser null after create — rare.

**145. Q: mongoose disconnect on shutdown?**  
**A:** Not implemented.

**146. Q: Cloudinary auto resource_type?**  
**A:** Detects type; overridden for video upload.

**147. Q: Why express.json 16kb?**  
**A:** Prevents large JSON; uploads use multipart.

**148. Q: Can guest see unpublished video by ID?**  
**A:** getVideoById does not check isPublished — gap.

**149. Q: Improve unpublished leak?**  
**A:** Add isPublished check unless owner.

**150. Q: Defend project in one strength?**  
**A:** Complete vertical slice: auth + media + social + aggregation with production patterns.

---

## SECTION 16: MOCK INTERVIEW

*Interviewer order: warm-up → architecture → auth → DB → deep dive → security → wrap-up.*

---

### Question 1

**Q: Walk me through your project.**

**Ideal Answer:** StreamCore Lite is a REST backend for a video platform. It uses Node.js, Express, and MongoDB with Mongoose in MVC structure. JWT access and refresh tokens secure the API — refresh tokens live in the database and HTTP-only cookies. Media goes through Multer to a temp folder, then Cloudinary; MongoDB stores URLs only. Features include registration, video CRUD, subscriptions, watch history, and two aggregation pipelines for channel profiles and watch history. Centralized error handling uses ApiError and asyncHandler.

**Common Mistakes:** Listing technologies without explaining data flow.

**Follow-up:** Why MongoDB over SQL?

---

### Question 2

**Q: What happens when I hit login?**

**Ideal Answer:** Request hits `POST /api/v1/auth/login` in `auth.routes.js`. `loginUser` finds the user by username or email, compares password with bcrypt via `isPasswordCorrect`, then calls `generateAccessAndRefreshTokens` which signs JWTs and saves refresh token on the user document. Response sets httpOnly cookies and returns user plus tokens in JSON.

**Common Mistakes:** Saying refresh token is only in cookie (it's also in DB and response body).

**Follow-up:** Where is refresh token validated?

---

### Question 3

**Q: Why store refresh token in the database?**

**Ideal Answer:** For revocation on logout via `$unset`, and for rotation — on refresh we compare incoming token to `user.refreshToken` and overwrite it, invalidating stolen old tokens.

**Common Mistakes:** Saying "for security" without mechanism.

**Follow-up:** Why not only cookies?

---

### Question 4

**Q: Explain your channel profile aggregation.**

**Ideal Answer:** In `getUserChannelProfile`, we `$match` by username, `$lookup` subscriptions twice — once where user is channel (subscribers), once where user is subscriber (subscribedTo). `$addFields` computes counts with `$size`. If viewer is logged in, `$addFields` sets `isSubscribed` using `$in`. `$project` returns only public fields.

**Common Mistakes:** Confusing subscriber vs subscribedTo lookup direction.

**Follow-up:** How would you optimize at 1M subscribers?

---

### Question 5

**Q: How do file uploads work?**

**Ideal Answer:** Multer writes to `public/temp` with type and size validation. Controller calls `uploadOnCloudinary` which uploads to Cloudinary and deletes the temp file in `finally`. Only the returned URL is saved in MongoDB.

**Common Mistakes:** "Files stored in MongoDB."

**Follow-up:** What if upload fails?

---

### Question 6

**Q: How is password secured?**

**Ideal Answer:** bcrypt in pre-save hook on User model with 10 salt rounds. Password never returned thanks to USER_SAFE_FIELDS. Login uses `bcrypt.compare` via `isPasswordCorrect`.

**Follow-up:** Why not encrypt password?

---

### Question 7

**Q: Difference between verifyJWT and optionalVerifyJWT?**

**Ideal Answer:** verifyJWT requires valid access token or throws 401. optionalVerifyJWT continues as guest if no token, sets req.user only on valid token, silently ignores invalid tokens. Used on channel profile and get video.

**Follow-up:** Where is optional used?

---

### Question 8

**Q: How does watch history work?**

**Ideal Answer:** On `GET /videos/:videoId`, if logged in, we pull then push videoId on user's watchHistory array. `GET /users/watch-history` runs aggregation: lookup videos, nested lookup owners, return array in response data.

**Follow-up:** Order of videos in history?

---

### Question 9

**Q: How do you prevent users from deleting others' videos?**

**Ideal Answer:** In `updateVideo` and `deleteVideo`, we compare `video.owner.toString()` to `req.user._id.toString()` and return 403 if mismatch.

**Follow-up:** What about unpublished videos?

---

### Question 10

**Q: What would you improve?**

**Ideal Answer:** Hash refresh tokens in DB, add rate limiting on login, check isPublished on getVideoById, allowlist sortBy, wire deleteFromCloudinary, add tests with supertest.

**Common Mistakes:** "Add microservices" without justification.

**Follow-up:** How would you scale to 100k users?

---

## SECTION 17: RESUME DEFENSE

### Bullet: "Built RESTful API using Node.js and Express"

| Aspect | Proof |
|--------|-------|
| **Files** | `src/app.js`, `src/routes/*.routes.js` |
| **APIs** | All `/api/v1/*` endpoints |
| **Implementation** | Express Router, JSON middleware, versioned routes, REST verbs |

**How to defend:** "I mounted four route modules under `/api/v1` for auth, users, videos, and subscriptions. Express handles JSON, cookies, and CORS with credentials for cookie-based auth."

---

### Bullet: "Implemented JWT authentication with refresh tokens"

| Aspect | Proof |
|--------|-------|
| **Files** | `src/models/user.model.js`, `src/controllers/auth.controller.js`, `src/middlewares/auth.middleware.js`, `src/constants.js` |
| **APIs** | `POST /auth/login`, `POST /auth/refresh-token`, `POST /auth/logout`, protected routes with `verifyJWT` |
| **Implementation** | `generateAccessToken`, `generateRefreshToken`, DB storage of refresh token, cookie + Bearer dual delivery |

**How to defend:** "Access tokens authorize requests via verifyJWT middleware. Refresh tokens are signed JWTs stored on the user document and in httpOnly cookies, validated on `/refresh-token` with rotation via generateAccessAndRefreshTokens."

---

### Bullet: "Designed MongoDB schemas with Mongoose"

| Aspect | Proof |
|--------|-------|
| **Files** | `src/models/user.model.js`, `video.model.js`, `subscription.model.js` |
| **APIs** | All endpoints persist/read through these models |
| **Implementation** | Schemas, validation, unique/compound indexes, pre-save hook, instance methods |

**How to defend:** "Three models — User, Video, Subscription — with refs, unique constraints, and a compound index on subscriptions. User has bcrypt pre-save and JWT instance methods."

---

### Bullet: "Integrated Cloudinary for media uploads"

| Aspect | Proof |
|--------|-------|
| **Files** | `src/utils/cloudinary.js`, `src/middlewares/multer.middleware.js` |
| **APIs** | Register (avatar/cover), PATCH avatar/cover, POST/PATCH videos |
| **Implementation** | Multer disk → uploadOnCloudinary → URL in MongoDB → temp file deleted |

**How to defend:** "Multer writes to a temp folder, then uploadOnCloudinary uploads and deletes the local file. Only URLs are persisted in MongoDB — never binary in the database."

---

### Bullet: "Implemented MongoDB aggregation pipelines"

| Aspect | Proof |
|--------|-------|
| **Files** | `src/controllers/user.controller.js`, `src/controllers/video.controller.js` |
| **APIs** | `GET /users/c/:username`, `GET /users/watch-history`, `GET /videos` |
| **Implementation** | `$lookup`, `$addFields`, `$project`, nested pipelines |

**How to defend:** "Channel profile uses lookup, addFields, and project for subscriber counts and isSubscribed. Watch history uses a nested lookup pipeline to attach video owners. Video feed uses aggregation with pagination."

---

### Bullet: "Centralized error handling"

| Aspect | Proof |
|--------|-------|
| **Files** | `src/utils/ApiError.js`, `src/utils/asyncHandler.js`, `src/app.js` |
| **APIs** | All endpoints |
| **Implementation** | throw ApiError → asyncHandler → global error middleware |

**How to defend:** "Controllers throw ApiError with status codes. asyncHandler forwards async failures to a single Express error handler that returns consistent JSON."

---

### Bullet: "Built subscription system"

| Aspect | Proof |
|--------|-------|
| **Files** | `src/models/subscription.model.js`, `src/controllers/subscription.controller.js`, `src/routes/subscription.routes.js` |
| **APIs** | `POST /subscriptions/c/:channelId`, `DELETE /subscriptions/c/:channelId` |
| **Implementation** | Unique compound index, duplicate check, channel aggregation counts |

**How to defend:** "Subscriptions are a separate collection with subscriber and channel refs. Subscribe validates channel exists and prevents self-subscribe. Channel profile aggregation counts subscribers via lookup on the same collection."

---

## SECTION 18: HARDEST POSSIBLE QUESTIONS

### 1. Why does `import "./env.js"` have to be first in `index.js`?

ES modules evaluate imported modules before the entry file's body runs. `cloudinary.js` reads `process.env` at top level. Without `env.js` first, Cloudinary config is undefined. Static import order in `index.js` ensures `dotenv.config()` runs before `app.js` pulls in the dependency tree.

### 2. Trace refresh token rotation when a stolen refresh token is reused after legitimate refresh.

Attacker's old refresh JWT no longer matches `user.refreshToken` in DB after victim refreshed (line 169 in `auth.controller.js`) → 401. Legitimate user has new cookie from last refresh.

### 3. Explain the exact `$lookup` direction for subscribersCount.

`localField: "_id"` on user, `foreignField: "channel"` on subscriptions — documents where this user IS the channel being subscribed to. `$size` = subscriber count.

### 4. What breaks if two logins from different devices?

Second login overwrites `refreshToken` in DB — first device's refresh fails DB comparison on next refresh. Only one active refresh session.

### 5. Why is `getVideoById` a security/product gap for unpublished videos?

No `isPublished` check — anyone with ID can view and increment views. Fix: check publish flag unless requester is owner.

### 6. How would you allowlist `sortBy` safely?

```javascript
const allowed = ["createdAt", "views", "title"];
const field = allowed.includes(sortBy) ? sortBy : "createdAt";
```

Use `field` in `$sort` instead of raw `sortBy` from query.

### 7. Why `validateBeforeSave: false` when saving refresh token?

Avoid validators on partial updates; password not modified. Risk if misused for other partial saves.

### 8. Compare channel aggregation vs three count queries.

Aggregation: 1 round-trip, loads subscriber arrays. Count queries: 3 DB calls, O(1) memory each. At scale favor counts or denormalized `subscribersCount` updated on subscribe.

### 9. Why bcrypt in pre-save instead of controller?

`changeCurrentPassword` sets `user.password = newPassword` and saves — hook ensures hash without duplicating in register and change-password.

### 10. What happens if multer succeeds but Cloudinary fails on video upload?

Temp file deleted in catch/finally; `Video.create` never runs; error forwarded via asyncHandler.

### 11. How does optionalVerifyJWT affect isSubscribed?

`req.user` set only with valid access token → pipeline adds `$in` check; guest gets `isSubscribed: false`.

### 12. Why pull before push on watchHistory?

If video already in array, pull removes old position; push appends to end — most recently watched at end.

### 13. JWT access payload includes email/username — risk?

Payload is base64-decodable. Don't put secrets. Email change doesn't invalidate token until expiry.

### 14. Why both cookie and Authorization header for access token?

Browser apps use cookies; API clients use Bearer — `verifyJWT` supports both.

### 15. Email update without uniqueness check — consequence?

Duplicate email may cause MongoDB unique index error on save — likely unhandled 500. Fix: explicit findOne before update.

### 16. How does global error handler treat non-ApiError throws?

`statusCode` defaults 500; `message` from Error.message; stack in development only.

### 17. Why is subscription POST returning 200 not 201?

Implementation choice in `subscribeChannel` — REST purists prefer 201 Created.

### 18. Explain watch history nested pipeline execution order.

Outer match user → lookup videos → per video sub-pipeline lookup owner → flatten owner → project only watchHistory array.

### 19. What indexes would you add for getAllVideos at scale?

`{ isPublished: 1, createdAt: -1 }` compound index for match + sort.

### 20. How does CORS + credentials interact with cookies?

Client must use `credentials: 'include'`; server `origin` must be explicit (not `*`); cookies sent only to `CORS_ORIGIN`.

### 21. Why plain refresh token in DB vs hashed?

Simpler internship implementation; DB leak exposes active refresh tokens. Production: store hash(refreshToken).

### 22. Can logout prevent access token reuse?

No — access JWT valid until `ACCESS_TOKEN_EXPIRY`. Only refresh invalidated.

### 23. fileFilter ApiError in multer — does asyncHandler catch it?

Multer may pass errors differently; test edge case — potential unhandled response.

### 24. Why versionKey: false on schemas?

Removes `__v` from Mongoose JSON; aggregation plain objects may still include `__v` from MongoDB.

### 25. Defend MVC without service layer in a senior interview.

"For this scope, controllers orchestrate models and utilities directly. Boundaries are clear in folders — extraction to AuthService, VideoService is straightforward without rewriting routes."

---

## Quick Reference Card

| Concept | File | Function / Symbol |
|---------|------|-------------------|
| Startup | `src/index.js`, `src/env.js` | env → DB → listen |
| Auth | `src/controllers/auth.controller.js` | registerUser, loginUser, refreshAccessToken, logoutUser |
| JWT guard | `src/middlewares/auth.middleware.js` | verifyJWT |
| Optional auth | `src/middlewares/optionalAuth.middleware.js` | optionalVerifyJWT |
| Safe user fields | `src/constants.js` | USER_SAFE_FIELDS |
| Upload | `src/middlewares/multer.middleware.js` → `src/utils/cloudinary.js` | upload → uploadOnCloudinary |
| Channel aggregation | `src/controllers/user.controller.js` | getUserChannelProfile |
| History aggregation | `src/controllers/user.controller.js` | getWatchHistory |
| Views + history | `src/controllers/video.controller.js` | getVideoById |
| Errors | `src/utils/ApiError.js`, `asyncHandler.js`, `app.js` | Centralized handling |
| DB connect | `src/db/connect.js` | connectDB |
| User model | `src/models/user.model.js` | bcrypt, JWT methods |
| Subscription | `src/models/subscription.model.js` | compound unique index |

---

## File Reference Index

| Path | Responsibility |
|------|----------------|
| `src/index.js` | Application entry point |
| `src/env.js` | dotenv bootstrap |
| `src/app.js` | Express configuration, routes, error handler |
| `src/constants.js` | COOKIE_OPTIONS, USER_SAFE_FIELDS, file limits |
| `src/db/connect.js` | MongoDB connection |
| `src/models/user.model.js` | User schema, bcrypt, JWT |
| `src/models/video.model.js` | Video schema |
| `src/models/subscription.model.js` | Subscription schema |
| `src/routes/auth.routes.js` | Auth endpoints |
| `src/routes/user.routes.js` | User endpoints |
| `src/routes/video.routes.js` | Video endpoints |
| `src/routes/subscription.routes.js` | Subscription endpoints |
| `src/controllers/auth.controller.js` | Auth business logic |
| `src/controllers/user.controller.js` | User business logic + aggregations |
| `src/controllers/video.controller.js` | Video business logic |
| `src/controllers/subscription.controller.js` | Subscription business logic |
| `src/middlewares/auth.middleware.js` | verifyJWT |
| `src/middlewares/optionalAuth.middleware.js` | optionalVerifyJWT |
| `src/middlewares/multer.middleware.js` | File upload |
| `src/utils/ApiError.js` | Custom error class |
| `src/utils/ApiResponse.js` | Success response wrapper |
| `src/utils/asyncHandler.js` | Async error wrapper |
| `src/utils/cloudinary.js` | Cloudinary upload utility |

---

*End of StreamCore Lite Interview Mastery Guide*
