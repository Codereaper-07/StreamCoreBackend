# StreamCore Backend

A RESTful backend for a video-sharing platform built with Node.js, Express.js, and MongoDB. The project provides secure authentication, media management, subscription features, watch history tracking, and optimized data retrieval using MongoDB aggregation pipelines.

---

## Features

### Authentication & Authorization
- User registration and login
- JWT-based Access Token and Refresh Token authentication
- Refresh token rotation with database validation
- HTTP-only cookie-based session handling
- Current user retrieval
- Password change functionality
- Logout with refresh token invalidation

### User Management
- Update account details
- Upload and update profile avatars
- Upload and update cover images
- View channel profiles
- Retrieve personalized watch history

### Video Management
- Upload videos with thumbnails
- Update video details
- Delete videos
- Retrieve individual videos
- Browse published videos
- Automatic view count tracking

### Subscription System
- Subscribe to channels
- Unsubscribe from channels
- Prevent duplicate subscriptions using compound indexes
- Retrieve subscriber insights through aggregation pipelines

### Media Handling
- Cloudinary integration for video and image storage
- Multer-based multipart file handling
- Temporary file cleanup after upload
- File type and size validation

### Architecture & Reliability
- MVC architecture
- Centralized error handling
- Standardized API responses
- Authentication middleware
- Environment-based configuration

---

## Tech Stack

### Backend
- Node.js
- Express.js

### Database
- MongoDB
- Mongoose

### Authentication
- JSON Web Tokens (JWT)
- bcrypt
- cookie-parser

### Media Storage
- Cloudinary
- Multer

### Utilities
- dotenv

---

## Project Structure

text src/ ├── controllers/ ├── db/ ├── middlewares/ ├── models/ ├── routes/ ├── utils/ ├── app.js ├── constants.js ├── env.js └── index.js 

---

## Authentication Flow

text Login ↓ Verify Credentials ↓ Generate Access Token ↓ Generate Refresh Token ↓ Store Refresh Token in Database ↓ Set HTTP-only Cookies ↓ Return Authenticated User 

---

## Media Upload Flow

text Client Upload ↓ Multer Middleware ↓ Temporary Local Storage ↓ Cloudinary Upload ↓ Cloudinary URL Generated ↓ Store URL in MongoDB ↓ Delete Temporary File 

---

## Database Models

### User
- username
- email
- fullName
- avatar
- coverImage
- password
- refreshToken
- watchHistory

### Video
- title
- description
- videoFile
- thumbnail
- owner
- views
- duration
- isPublished

### Subscription
- subscriber
- channel

---

## Aggregation Pipelines

### Channel Profile Aggregation
Retrieves:

- Subscriber count
- Number of subscribed channels
- Subscription status of the current user

Uses:

- $lookup
- $addFields
- $project

---

### Watch History Aggregation

Retrieves:

- Previously watched videos
- Video owner information

Uses:

- Nested $lookup
- $project
- $addFields

---

## API Endpoints

### Authentication

| Method | Endpoint |
|---------|-----------|
| POST | /api/v1/auth/register |
| POST | /api/v1/auth/login |
| POST | /api/v1/auth/logout |
| POST | /api/v1/auth/refresh-token |
| POST | /api/v1/auth/change-password |
| GET | /api/v1/auth/current-user |

---

### Users

| Method | Endpoint |
|---------|-----------|
| PATCH | /api/v1/users/update-account |
| PATCH | /api/v1/users/avatar |
| PATCH | /api/v1/users/cover-image |
| GET | /api/v1/users/c/:username |
| GET | /api/v1/users/watch-history |

---

### Videos

| Method | Endpoint |
|---------|-----------|
| GET | /api/v1/videos |
| POST | /api/v1/videos |
| GET | /api/v1/videos/:videoId |
| PATCH | /api/v1/videos/:videoId |
| DELETE | /api/v1/videos/:videoId |

---

### Subscriptions

| Method | Endpoint |
|---------|-----------|
| POST | /api/v1/subscriptions/c/:channelId |
| DELETE | /api/v1/subscriptions/c/:channelId |

---

## Environment Variables

Create a .env file in the project root:

env PORT=8000 NODE_ENV=development  MONGODB_URI=your_mongodb_connection_string  ACCESS_TOKEN_SECRET=your_access_secret REFRESH_TOKEN_SECRET=your_refresh_secret  ACCESS_TOKEN_EXPIRY=1d REFRESH_TOKEN_EXPIRY=10d  CLOUDINARY_CLOUD_NAME=your_cloud_name CLOUDINARY_API_KEY=your_api_key CLOUDINARY_API_SECRET=your_api_secret  CORS_ORIGIN=http://localhost:5173 

---

## Getting Started

### Clone the repository

bash git clone <repository-url> cd streamcore-lite 

### Install dependencies

bash npm install 

### Configure environment variables

Create a .env file using the example above.

### Start the development server

bash npm run dev 

The server will start on:

text http://localhost:8000 

---

## Future Improvements

- Redis caching for frequently accessed resources
- Rate limiting for authentication routes
- Email verification workflows
- Password reset functionality
- Comments and likes system
- Playlists
- Cloudinary asset cleanup
- API documentation using Swagger/OpenAPI
- Automated integration testing

---

## Key Learnings

- Building secure JWT authentication systems
- Designing MongoDB schemas and relationships
- Implementing MongoDB aggregation pipelines
- Handling media uploads using Cloudinary
- Structuring scalable Express applications using MVC principles
- Designing maintainable RESTful APIs

---

## Author

Kanishk Kaushik

Backend Developer | Node.js | MongoDB | Express.js