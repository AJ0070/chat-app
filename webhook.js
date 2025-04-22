require('dotenv').config();
const express = require('express');
const { execSync } = require('child_process');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

app.post('/webhook', (req, res) => {
  const sigHeader = req.headers['x-hub-signature-256'];
  const payload = JSON.stringify(req.body);
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');

  if (sigHeader !== digest) {
    console.error('Invalid webhook signature');
    return res.status(401).send('Invalid signature');
  }

  if (req.headers['x-github-event'] === 'push') {
    console.log('Received push event, deploying...');
    try {
      execSync('cd ~/chat-app && git pull origin main', { stdio: 'inherit' });
      execSync('cd ~/chat-app && npm install', { stdio: 'inherit' });
      execSync('pm2 restart chat-app', { stdio: 'inherit' });
      console.log('Deployment successful');
      res.status(200).send('Deployed');
    } catch (error) {
      console.error('Deployment error:', error);
      res.status(500).send('Deployment failed');
    }
  } else {
    res.status(200).send('Event received');
  }
});

const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 3001;
app.listen(WEBHOOK_PORT, () => {
  console.log(`Webhook server running on port ${WEBHOOK_PORT}`);
});