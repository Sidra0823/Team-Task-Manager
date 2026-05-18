const jwt = require('jsonwebtoken');
const { getDb } = require('../models/db');

const JWT_SECRET = process.env.JWT_SECRET || 'taskflow_secret';

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const user = db.prepare('SELECT id, name, email, role, avatar FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const requireProjectAccess = (req, res, next) => {
  const db = getDb();
  const projectId = req.params.projectId || req.params.id || req.body.project_id;
  
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const member = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(projectId, req.user.id);
  
  if (!member && project.owner_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied to this project' });
  }

  req.project = project;
  req.projectMember = member;
  next();
};

const requireProjectAdmin = (req, res, next) => {
  const project = req.project;
  const member = req.projectMember;

  const isOwner = project.owner_id === req.user.id;
  const isProjectAdmin = member && member.role === 'admin';
  const isGlobalAdmin = req.user.role === 'admin';

  if (!isOwner && !isProjectAdmin && !isGlobalAdmin) {
    return res.status(403).json({ error: 'Project admin access required' });
  }
  next();
};

module.exports = { authenticate, requireAdmin, requireProjectAccess, requireProjectAdmin };
