const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../models/db');
const { authenticate, requireProjectAccess, requireProjectAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/projects - Get all projects for current user
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const projects = db.prepare(`
    SELECT p.*, u.name as owner_name,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as done_count,
      (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count
    FROM projects p
    JOIN users u ON p.owner_id = u.id
    WHERE p.owner_id = ? OR p.id IN (
      SELECT project_id FROM project_members WHERE user_id = ?
    )
    ORDER BY p.created_at DESC
  `).all(req.user.id, req.user.id);

  res.json({ projects });
});

// POST /api/projects - Create project
router.post('/', authenticate, [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('description').optional().trim().isLength({ max: 500 }),
  body('due_date').optional().isDate(),
  body('color').optional().isHexColor(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, description, due_date, color = '#6366f1' } = req.body;
  const db = getDb();

  const id = uuidv4();
  db.prepare(`
    INSERT INTO projects (id, name, description, owner_id, due_date, color)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, description || null, req.user.id, due_date || null, color);

  // Auto-add creator as admin member
  db.prepare(`INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, 'admin')`)
    .run(uuidv4(), id, req.user.id);

  db.prepare(`INSERT INTO activity_log (id, user_id, project_id, action, details) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), req.user.id, id, 'PROJECT_CREATED', JSON.stringify({ name }));

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.status(201).json({ message: 'Project created', project });
});

// GET /api/projects/:id - Get project details
router.get('/:id', authenticate, requireProjectAccess, (req, res) => {
  const db = getDb();
  const project = db.prepare(`
    SELECT p.*, u.name as owner_name
    FROM projects p JOIN users u ON p.owner_id = u.id
    WHERE p.id = ?
  `).get(req.params.id);

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.role as global_role, u.avatar, pm.role as project_role, pm.joined_at
    FROM project_members pm JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ?
    ORDER BY pm.joined_at
  `).all(req.params.id);

  const taskStats = db.prepare(`
    SELECT status, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY status
  `).all(req.params.id);

  res.json({ project, members, taskStats });
});

// PUT /api/projects/:id - Update project
router.put('/:id', authenticate, requireProjectAccess, requireProjectAdmin, [
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  body('status').optional().isIn(['active', 'completed', 'archived']),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, description, status, due_date, color } = req.body;
  const db = getDb();

  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description); }
  if (status !== undefined) { updates.push('status = ?'); values.push(status); }
  if (due_date !== undefined) { updates.push('due_date = ?'); values.push(due_date); }
  if (color !== undefined) { updates.push('color = ?'); values.push(color); }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(req.params.id);

  db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  res.json({ message: 'Project updated', project });
});

// DELETE /api/projects/:id
router.delete('/:id', authenticate, requireProjectAccess, requireProjectAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ message: 'Project deleted' });
});

// POST /api/projects/:id/members - Add member
router.post('/:projectId/members', authenticate, requireProjectAccess, requireProjectAdmin, [
  body('user_id').notEmpty(),
  body('role').optional().isIn(['admin', 'member']),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { user_id, role = 'member' } = req.body;
  const db = getDb();

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const existing = db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(req.params.projectId, user_id);
  if (existing) return res.status(409).json({ error: 'User already in project' });

  db.prepare('INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), req.params.projectId, user_id, role);

  db.prepare(`INSERT INTO activity_log (id, user_id, project_id, action, details) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), req.user.id, req.params.projectId, 'MEMBER_ADDED', JSON.stringify({ user_id, role }));

  res.status(201).json({ message: 'Member added' });
});

// DELETE /api/projects/:projectId/members/:userId
router.delete('/:projectId/members/:userId', authenticate, requireProjectAccess, requireProjectAdmin, (req, res) => {
  const db = getDb();
  if (req.params.userId === req.project.owner_id) {
    return res.status(400).json({ error: 'Cannot remove project owner' });
  }
  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?')
    .run(req.params.projectId, req.params.userId);
  res.json({ message: 'Member removed' });
});

// PUT /api/projects/:projectId/members/:userId/role
router.put('/:projectId/members/:userId/role', authenticate, requireProjectAccess, requireProjectAdmin, [
  body('role').isIn(['admin', 'member']),
], (req, res) => {
  const { role } = req.body;
  const db = getDb();
  db.prepare('UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?')
    .run(role, req.params.projectId, req.params.userId);
  res.json({ message: 'Role updated' });
});

module.exports = router;
