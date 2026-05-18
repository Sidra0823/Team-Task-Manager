require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../backend/models/db');

const seed = async () => {
  const db = getDb();

  // Check if already seeded
  const existing = db.prepare("SELECT COUNT(*) as count FROM users").get();
  if (existing.count > 0) {
    console.log('✅ Database already has data, skipping seed.');
    return;
  }

  const adminId = uuidv4();
  const memberId = uuidv4();
  const member2Id = uuidv4();

  const adminPass = await bcrypt.hash('password123', 12);
  const memberPass = await bcrypt.hash('password123', 12);

  db.prepare(`INSERT INTO users (id, name, email, password, role, avatar) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(adminId, 'Admin User', 'admin@taskflow.com', adminPass, 'admin',
      'https://ui-avatars.com/api/?name=Admin+User&background=6366f1&color=fff');

  db.prepare(`INSERT INTO users (id, name, email, password, role, avatar) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(memberId, 'Jane Member', 'member@taskflow.com', memberPass, 'member',
      'https://ui-avatars.com/api/?name=Jane+Member&background=ec4899&color=fff');

  db.prepare(`INSERT INTO users (id, name, email, password, role, avatar) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(member2Id, 'Bob Developer', 'bob@taskflow.com', memberPass, 'member',
      'https://ui-avatars.com/api/?name=Bob+Developer&background=10b981&color=fff');

  // Create demo project
  const projId = uuidv4();
  db.prepare(`INSERT INTO projects (id, name, description, owner_id, color, due_date) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(projId, 'Website Redesign', 'Complete overhaul of the company website with new branding', adminId, '#6366f1', '2025-06-30');

  // Add members
  db.prepare(`INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`)
    .run(uuidv4(), projId, adminId, 'admin');
  db.prepare(`INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`)
    .run(uuidv4(), projId, memberId, 'member');
  db.prepare(`INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`)
    .run(uuidv4(), projId, member2Id, 'member');

  // Add sample tasks
  const taskDefs = [
    { title: 'Design new homepage mockups', desc: 'Create Figma mockups for all screen sizes', status: 'done', priority: 'high', assignee: memberId },
    { title: 'Setup CI/CD pipeline', desc: 'Configure GitHub Actions for auto-deployment', status: 'in_progress', priority: 'urgent', assignee: member2Id },
    { title: 'Write API documentation', desc: 'Document all REST endpoints using Swagger', status: 'in_progress', priority: 'medium', assignee: memberId },
    { title: 'Implement authentication', desc: 'JWT-based login and signup flows', status: 'done', priority: 'urgent', assignee: member2Id },
    { title: 'Mobile responsiveness testing', desc: 'Test across iOS, Android, and various screen sizes', status: 'review', priority: 'high', assignee: memberId },
    { title: 'Performance optimization', desc: 'Reduce load time to under 2 seconds', status: 'todo', priority: 'medium', assignee: null },
    { title: 'SEO improvements', desc: 'Add meta tags, schema markup, and sitemap', status: 'todo', priority: 'low', assignee: member2Id },
    { title: 'Security audit', desc: 'Review for XSS, CSRF, and SQL injection vulnerabilities', status: 'todo', priority: 'urgent', assignee: null },
  ];

  for (const t of taskDefs) {
    db.prepare(`INSERT INTO tasks (id, title, description, status, priority, project_id, assignee_id, reporter_id, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(uuidv4(), t.title, t.desc, t.status, t.priority, projId, t.assignee, adminId, '2025-06-15');
  }

  // Second project
  const proj2Id = uuidv4();
  db.prepare(`INSERT INTO projects (id, name, description, owner_id, color, status) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(proj2Id, 'Mobile App v2.0', 'New features and bug fixes for the mobile application', memberId, '#ec4899', 'active');
  db.prepare(`INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`)
    .run(uuidv4(), proj2Id, memberId, 'admin');
  db.prepare(`INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`)
    .run(uuidv4(), proj2Id, adminId, 'member');

  db.prepare(`INSERT INTO tasks (id, title, description, status, priority, project_id, assignee_id, reporter_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(uuidv4(), 'Push notification system', 'Integrate Firebase FCM', 'in_progress', 'high', proj2Id, adminId, memberId);
  db.prepare(`INSERT INTO tasks (id, title, description, status, priority, project_id, assignee_id, reporter_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(uuidv4(), 'Dark mode support', 'Implement system-level dark mode', 'todo', 'medium', proj2Id, null, memberId);

  // LLM training demo projects
  const llmProjects = [
    {
      name: 'LLM Training Data Pipeline',
      description: 'Prepare and label training data for the next generation language model.',
      color: '#10b981',
      owner: adminId,
      tasks: [
        { title: 'Label evaluation datasets', description: 'Assign quality labels to training examples', status: 'in_progress', priority: 'high', assignee: member2Id },
        { title: 'Create prompt templates', description: 'Draft prompt templates for multi-turn scenarios', status: 'todo', priority: 'urgent', assignee: memberId },
        { title: 'Review model outputs', description: 'Inspect outputs for hallucination and bias', status: 'review', priority: 'high', assignee: member2Id },
      ]
    },
    {
      name: 'Evaluation Workflow',
      description: 'Run model evaluations and collect results for analysis.',
      color: '#f59e0b',
      owner: memberId,
      tasks: [
        { title: 'Text to Image benchmark', description: 'Compare generated image quality across models', status: 'in_progress', priority: 'urgent', assignee: memberId },
        { title: 'Compare Video results', description: 'Evaluate video generation consistency and latency', status: 'todo', priority: 'high', assignee: null },
        { title: 'Prompt to Text compare', description: 'Measure accuracy of text extraction from images', status: 'todo', priority: 'medium', assignee: member2Id },
      ]
    },
    {
      name: 'Generalist Work Queue',
      description: 'Cross-functional tasks spanning data, engineering and research.',
      color: '#3b82f6',
      owner: adminId,
      tasks: [
        { title: 'Color Picker feature review', description: 'Test and improve the interface for color selection tools', status: 'review', priority: 'medium', assignee: memberId },
        { title: 'Generate evaluation reports', description: 'Summarize task results and metrics for stakeholders', status: 'todo', priority: 'high', assignee: member2Id },
      ]
    },
    {
      name: 'Prompt Engineering Sprint',
      description: 'Refine prompts and workflows for better LLM performance.',
      color: '#8b5cf6',
      owner: member2Id,
      tasks: [
        { title: 'Text to Image prompt tests', description: 'Experiment with new prompt formats for visual generation', status: 'todo', priority: 'high', assignee: member2Id },
        { title: 'LLM instruction tuning', description: 'Adjust instruction templates based on recent benchmark results', status: 'in_progress', priority: 'urgent', assignee: adminId },
      ]
    },
    {
      name: 'Data Quality Review',
      description: 'Audit training data and correct label inconsistencies.',
      color: '#ef4444',
      owner: adminId,
      tasks: [
        { title: 'Audit noisy labels', description: 'Identify and fix poor labeling in training datasets', status: 'todo', priority: 'high', assignee: memberId },
        { title: 'Run coverage analysis', description: 'Check dataset coverage across target domains', status: 'todo', priority: 'medium', assignee: null },
      ]
    }
  ];

  for (const proj of llmProjects) {
    const projectId = uuidv4();
    db.prepare(`INSERT INTO projects (id, name, description, owner_id, color, status, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(projectId, proj.name, proj.description, proj.owner, proj.color, 'active', '2025-09-30');
    const projectMembers = [
      { userId: proj.owner, role: 'admin' },
      { userId: adminId, role: 'member' },
      { userId: memberId, role: 'member' }
    ].filter((item, index, all) => all.findIndex(i => i.userId === item.userId) === index);

    for (const member of projectMembers) {
      db.prepare(`INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`).run(uuidv4(), projectId, member.userId, member.role);
    }
    for (const t of proj.tasks) {
      db.prepare(`INSERT INTO tasks (id, title, description, status, priority, project_id, assignee_id, reporter_id, due_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(uuidv4(), t.title, t.description, t.status, t.priority, projectId, t.assignee || null, adminId, '2025-08-30');
    }
  }

  console.log('🌱 Database seeded successfully!');
  console.log('   Admin: admin@taskflow.com / password123');
  console.log('   Member: member@taskflow.com / password123');
  console.log('   Member2: bob@taskflow.com / password123');
};

seed().catch(console.error);
