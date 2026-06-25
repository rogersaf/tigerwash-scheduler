const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./db');

// Initialize DB + run seed if empty
const db = getDb();
const empCount = db.prepare('SELECT COUNT(*) as c FROM employees').get().c;
if (empCount === 0) {
  console.log('Empty DB — running seed...');
  require('./seed');
}

const { router: authRouter } = require('./routes/auth');
const employeesRouter = require('./routes/employees');
const availabilityRouter = require('./routes/availability');
const scheduleRouter = require('./routes/schedule');
const holidaysRouter = require('./routes/holidays');

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/holidays', holidaysRouter);

// Serve built React app in production
const clientBuild = path.join(__dirname, '../client/dist');
app.use(express.static(clientBuild));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuild, 'index.html'), (err) => {
    if (err) res.status(200).send('Tiger Wash Scheduler — run npm run dev to start the client');
  });
});

app.listen(PORT, () => {
  console.log(`Tiger Wash Scheduler running on http://localhost:${PORT}`);
});
