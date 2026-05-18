# TaskFlow — Team Task Manager

A full-stack web application for managing projects, assigning tasks, and tracking team progress with role-based access control.

---

## 🚀 Live Demo

> Deployed on Railway — https://team-task-manager-production-01.up.railway.app/

**Demo credentials:**

| Role   | Email               | Password    |
|--------|---------------------|-------------|
| Admin  | admin@taskflow.com  | password123 |
| Member | member@taskflow.com | password123 |
| Member | bob@taskflow.com    | password123 |

---

## ✨ Features

- **Authentication** — Signup / Login with JWT; role selection (Admin / Member)
- **Projects** — Create, view, and manage projects with color coding and due dates
- **Team Management** — Add/remove members per project; role-based permissions
- **Task Tracking** — Status (todo/in_progress/review/done), priority, assignees, due dates, tags
- **Dashboard** — Overview of all tasks, overdue items, and status breakdown
- **Activity Log** — Track changes across projects and tasks
- **Comments** — Collaborate on tasks via comments
- **RBAC** — Admins can manage members and delete projects; members have scoped access

---

## 🛠 Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite (better-sqlite3)
- **Auth**: JWT + bcryptjs
- **Frontend**: Vanilla HTML/CSS/JS (single-page app)
- **Deploy**: Railway

---

## ⚙️ Local Development

```bash
git clone <your-repo-url>
cd taskflow
npm install
cp .env.example .env   # Edit JWT_SECRET
npm run dev            # Seeds DB on first run, starts at http://localhost:3000
```

---

## 🚂 Railway Deployment

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub Repo
3. Set these environment variables in Railway dashboard:

| Variable     | Value                                   |
|--------------|-----------------------------------------|
| JWT_SECRET   | A long random string (32+ chars)        |
| NODE_ENV     | production                              |

4. Railway auto-detects Node.js via `railway.toml` and deploys

### SQLite Persistence

By default, data is stored in `/tmp/taskflow.db` (reset on redeploy — demo data re-seeds automatically).

For persistent storage:
1. Railway service → Volumes → Add Volume, mount at `/data`
2. Add env var: `DB_PATH=/data/taskflow.db`

---

## 📡 API Endpoints

**Auth:** POST /api/auth/signup, /api/auth/login, GET /api/auth/me, /api/auth/users

**Projects:** GET/POST /api/projects, GET/PUT/DELETE /api/projects/:id, POST/DELETE /api/projects/:id/members

**Tasks:** GET/POST /api/projects/:projectId/tasks, GET/PUT/DELETE /api/projects/:projectId/tasks/:id

**Dashboard:** GET /api/dashboard, /api/dashboard/tasks, /api/dashboard/activity

---

## 📁 Structure

```
taskflow/
├── server.js
├── railway.toml
├── backend/
│   ├── models/db.js
│   ├── middleware/auth.js
│   └── routes/ (auth, projects, tasks, dashboard)
├── frontend/public/index.html
└── scripts/ (seed.js, initDb.js)
```
