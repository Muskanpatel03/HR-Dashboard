require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const recordRoutes = require('./routes/records');
const dashboardRoutes = require('./routes/dashboard');
const auditRoutes = require('./routes/audit');
const rolesRoutes = require('./routes/roles');
const { loadRolesFromDb } = require('./config/roles');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api', recordRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error' });
});

const PORT = process.env.PORT || 4000;

// Load the live, admin-editable role permissions from the DB before we
// start accepting requests, so the very first request already sees any
// permission changes made in a previous run.
loadRolesFromDb().then(() => {
  app.listen(PORT, () => console.log(`AUTOMAT HR MIS API listening on port ${PORT}`));
});
