const express = require('express');
const { getDb } = require('../models/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard - Main dashboard stats
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  // My projects
  const myProjects = db.prepare(`
    SELECT COUNT(DISTINCT p.id) as count FROM projects p
    WHERE p.owner_id = ? OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)
  `).get(userId, userId);

  // My tasks stats
  const myTaskStats = db.prepare(`
    SELECT status, COUNT(*) as count FROM tasks
    WHERE assignee_id = ? GROUP BY status
  `).all(userId);

  const userCreated = db.prepare('SELECT created_at FROM users WHERE id = ?').get(userId);
  const activeDays = userCreated?.created_at ? Math.max(1, Math.floor((new Date() - new Date(userCreated.created_at)) / (1000 * 60 * 60 * 24))) : 0;
  const dailyTarget = 50;
  const completedTasks = myTaskStats.find(s => s.status === 'done')?.count || 0;
  const inProgressTasks = myTaskStats.find(s => s.status === 'in_progress')?.count || 0;
  const totalWorked = completedTasks + inProgressTasks;

  // Overdue tasks
  const overdueTasks = db.prepare(`
    SELECT t.*, p.name as project_name, p.color as project_color,
      u.name as assignee_name, u.avatar as assignee_avatar
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE t.due_date < date('now') AND t.status != 'done'
    AND (t.assignee_id = ? OR p.owner_id = ? OR p.id IN (
      SELECT project_id FROM project_members WHERE user_id = ? AND role = 'admin'
    ))
    ORDER BY t.due_date ASC LIMIT 10
  `).all(userId, userId, userId);

  // Recent tasks assigned to me
  const myRecentTasks = db.prepare(`
    SELECT t.*, p.name as project_name, p.color as project_color
    FROM tasks t JOIN projects p ON t.project_id = p.id
    WHERE t.assignee_id = ? AND t.status != 'done'
    ORDER BY t.updated_at DESC LIMIT 8
  `).all(userId);

  // Recent activity
  const recentActivity = db.prepare(`
    SELECT al.*, u.name as user_name, u.avatar as user_avatar,
      p.name as project_name, t.title as task_title
    FROM activity_log al
    LEFT JOIN users u ON al.user_id = u.id
    LEFT JOIN projects p ON al.project_id = p.id
    LEFT JOIN tasks t ON al.task_id = t.id
    WHERE al.project_id IN (
      SELECT id FROM projects WHERE owner_id = ?
      UNION SELECT project_id FROM project_members WHERE user_id = ?
    )
    ORDER BY al.created_at DESC LIMIT 15
  `).all(userId, userId);

  // All projects with progress
  const projectsWithProgress = db.prepare(`
    SELECT p.*, u.name as owner_name,
      COUNT(t.id) as total_tasks,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done_tasks,
      SUM(CASE WHEN t.due_date < date('now') AND t.status != 'done' THEN 1 ELSE 0 END) as overdue_tasks
    FROM projects p
    JOIN users u ON p.owner_id = u.id
    LEFT JOIN tasks t ON p.id = t.project_id
    WHERE p.owner_id = ? OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)
    GROUP BY p.id ORDER BY p.updated_at DESC LIMIT 6
  `).all(userId, userId);

  // Task distribution by priority
  const priorityStats = db.prepare(`
    SELECT priority, COUNT(*) as count FROM tasks
    WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = ?
      UNION SELECT project_id FROM project_members WHERE user_id = ?
    ) AND status != 'done'
    GROUP BY priority
  `).all(userId, userId);

  res.json({
    stats: {
      totalProjects: myProjects.count,
      taskStats: myTaskStats,
      overdueCount: overdueTasks.length,
      completedTasks,
      inProgressTasks,
      totalWorked,
      dailyTarget,
      activeDays,
    },
    overdueTasks,
    myRecentTasks,
    recentActivity,
    projectsWithProgress,
    priorityStats,
  });
});

// GET /api/dashboard/all-tasks
router.get('/all-tasks', authenticate, (req, res) => {
  const db = getDb();
  let tasks;

  if (req.user.role === 'admin') {
    tasks = db.prepare(`
      SELECT t.*, p.name as project_name, p.color as project_color,
        u1.name as assignee_name, u1.avatar as assignee_avatar,
        u2.name as reporter_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u1 ON t.assignee_id = u1.id
      LEFT JOIN users u2 ON t.reporter_id = u2.id
      ORDER BY t.updated_at DESC
    `).all();
  } else {
    tasks = db.prepare(`
      SELECT DISTINCT t.*, p.name as project_name, p.color as project_color,
        u1.name as assignee_name, u1.avatar as assignee_avatar,
        u2.name as reporter_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u1 ON t.assignee_id = u1.id
      LEFT JOIN users u2 ON t.reporter_id = u2.id
      WHERE p.owner_id = ?
        OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)
        OR t.assignee_id = ?
      ORDER BY t.updated_at DESC
    `).all(req.user.id, req.user.id, req.user.id);
  }

  res.json({ tasks });
});

// GET /api/dashboard/my-tasks
router.get('/my-tasks', authenticate, (req, res) => {
  const db = getDb();
  const tasks = db.prepare(`
    SELECT t.*, p.name as project_name, p.color as project_color,
      u.name as reporter_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN users u ON t.reporter_id = u.id
    WHERE t.assignee_id = ?
    ORDER BY 
      CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      t.due_date ASC NULLS LAST,
      t.created_at DESC
  `).all(req.user.id);

  res.json({ tasks });
});

// GET /api/dashboard/admin-stats (admin only)
router.get('/admin-stats', authenticate, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const db = getDb();
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
  const totalProjects = db.prepare('SELECT COUNT(*) as count FROM projects').get();
  const totalTasks = db.prepare('SELECT COUNT(*) as count FROM tasks').get();
  const tasksByStatus = db.prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status').all();
  const recentUsers = db.prepare('SELECT id, name, email, role, avatar, created_at FROM users ORDER BY created_at DESC LIMIT 10').all();

  res.json({
    totalUsers: totalUsers.count,
    totalProjects: totalProjects.count,
    totalTasks: totalTasks.count,
    tasksByStatus,
    recentUsers,
  });
});

module.exports = router;
