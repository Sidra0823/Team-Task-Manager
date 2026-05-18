const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, query, validationResult } = require('express-validator');
const { getDb } = require('../models/db');
const { authenticate, requireProjectAccess } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// GET /api/projects/:projectId/tasks
router.get('/', authenticate, requireProjectAccess, (req, res) => {
  const db = getDb();
  const { status, priority, assignee_id, search } = req.query;

  let sql = `
    SELECT t.*, 
      u1.name as assignee_name, u1.avatar as assignee_avatar,
      u2.name as reporter_name
    FROM tasks t
    LEFT JOIN users u1 ON t.assignee_id = u1.id
    LEFT JOIN users u2 ON t.reporter_id = u2.id
    WHERE t.project_id = ?
  `;
  const params = [req.params.projectId];

  if (status) { sql += ' AND t.status = ?'; params.push(status); }
  if (priority) { sql += ' AND t.priority = ?'; params.push(priority); }
  if (assignee_id) { sql += ' AND t.assignee_id = ?'; params.push(assignee_id); }
  if (search) { sql += ' AND (t.title LIKE ? OR t.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  sql += ' ORDER BY t.created_at DESC';

  const tasks = db.prepare(sql).all(...params);
  res.json({ tasks });
});

// POST /api/projects/:projectId/tasks
router.post('/', authenticate, requireProjectAccess, [
  body('title').trim().isLength({ min: 2, max: 200 }),
  body('status').optional().isIn(['todo', 'in_progress', 'review', 'done']),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('assignee_id').optional().isString(),
  body('due_date').optional().isDate(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { title, description, status = 'todo', priority = 'medium', assignee_id, due_date, tags = [] } = req.body;
  const db = getDb();

  // Validate assignee is project member
  if (assignee_id) {
    const member = db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?')
      .get(req.params.projectId, assignee_id);
    if (!member) return res.status(400).json({ error: 'Assignee must be a project member' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO tasks (id, title, description, status, priority, project_id, assignee_id, reporter_id, due_date, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, description || null, status, priority, req.params.projectId, assignee_id || null, req.user.id, due_date || null, JSON.stringify(tags));

  db.prepare(`INSERT INTO activity_log (id, user_id, project_id, task_id, action, details) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(uuidv4(), req.user.id, req.params.projectId, id, 'TASK_CREATED', JSON.stringify({ title, status, priority }));

  const task = db.prepare(`
    SELECT t.*, u1.name as assignee_name, u1.avatar as assignee_avatar, u2.name as reporter_name
    FROM tasks t
    LEFT JOIN users u1 ON t.assignee_id = u1.id
    LEFT JOIN users u2 ON t.reporter_id = u2.id
    WHERE t.id = ?
  `).get(id);

  res.status(201).json({ message: 'Task created', task });
});

// GET /api/projects/:projectId/tasks/:taskId
router.get('/:taskId', authenticate, requireProjectAccess, (req, res) => {
  const db = getDb();
  const task = db.prepare(`
    SELECT t.*, u1.name as assignee_name, u1.avatar as assignee_avatar, u2.name as reporter_name
    FROM tasks t
    LEFT JOIN users u1 ON t.assignee_id = u1.id
    LEFT JOIN users u2 ON t.reporter_id = u2.id
    WHERE t.id = ? AND t.project_id = ?
  `).get(req.params.taskId, req.params.projectId);

  if (!task) return res.status(404).json({ error: 'Task not found' });

  const comments = db.prepare(`
    SELECT c.*, u.name as user_name, u.avatar as user_avatar
    FROM comments c JOIN users u ON c.user_id = u.id
    WHERE c.task_id = ? ORDER BY c.created_at ASC
  `).all(req.params.taskId);

  res.json({ task, comments });
});

// PUT /api/projects/:projectId/tasks/:taskId
router.put('/:taskId', authenticate, requireProjectAccess, [
  body('title').optional().trim().isLength({ min: 2, max: 200 }),
  body('status').optional().isIn(['todo', 'in_progress', 'review', 'done']),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?')
    .get(req.params.taskId, req.params.projectId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { title, description, status, priority, assignee_id, due_date, tags } = req.body;
  const updates = [];
  const values = [];

  if (title !== undefined) { updates.push('title = ?'); values.push(title); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description); }
  if (status !== undefined) { updates.push('status = ?'); values.push(status); }
  if (priority !== undefined) { updates.push('priority = ?'); values.push(priority); }
  if (assignee_id !== undefined) { updates.push('assignee_id = ?'); values.push(assignee_id || null); }
  if (due_date !== undefined) { updates.push('due_date = ?'); values.push(due_date || null); }
  if (tags !== undefined) { updates.push('tags = ?'); values.push(JSON.stringify(tags)); }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(req.params.taskId);

  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  if (status && status !== task.status) {
    db.prepare(`INSERT INTO activity_log (id, user_id, project_id, task_id, action, details) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(uuidv4(), req.user.id, req.params.projectId, req.params.taskId, 'TASK_STATUS_CHANGED',
        JSON.stringify({ from: task.status, to: status }));
  }

  const updated = db.prepare(`
    SELECT t.*, u1.name as assignee_name, u1.avatar as assignee_avatar, u2.name as reporter_name
    FROM tasks t LEFT JOIN users u1 ON t.assignee_id = u1.id LEFT JOIN users u2 ON t.reporter_id = u2.id
    WHERE t.id = ?
  `).get(req.params.taskId);

  res.json({ message: 'Task updated', task: updated });
});

// DELETE /api/projects/:projectId/tasks/:taskId
router.delete('/:taskId', authenticate, requireProjectAccess, (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?')
    .get(req.params.taskId, req.params.projectId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Only reporter, project admin, or global admin can delete
  const member = db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(req.params.projectId, req.user.id);

  if (task.reporter_id !== req.user.id && (!member || member.role !== 'admin') && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized to delete this task' });
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.taskId);
  res.json({ message: 'Task deleted' });
});

// POST /api/projects/:projectId/tasks/:taskId/comments
router.post('/:taskId/comments', authenticate, requireProjectAccess, [
  body('content').trim().isLength({ min: 1, max: 1000 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const db = getDb();
  const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?')
    .get(req.params.taskId, req.params.projectId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const id = uuidv4();
  db.prepare('INSERT INTO comments (id, task_id, user_id, content) VALUES (?, ?, ?, ?)')
    .run(id, req.params.taskId, req.user.id, req.body.content);

  const comment = db.prepare(`
    SELECT c.*, u.name as user_name, u.avatar as user_avatar
    FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?
  `).get(id);

  res.status(201).json({ comment });
});

module.exports = router;
