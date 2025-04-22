require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const oracledb = require('oracledb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectString: process.env.DB_CONNECT_STRING,
  walletLocation: process.env.WALLET_LOCATION,
  configDir: process.env.TNS_ADMIN
};

// Log configuration for debugging
console.log('DB Config:', {
  user: process.env.DB_USER,
  connectString: process.env.DB_CONNECT_STRING,
  walletLocation: process.env.WALLET_LOCATION,
  configDir: process.env.TNS_ADMIN
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.post('/register', async (req, res) => {
  let connection;
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      `INSERT INTO users (username, password_hash) VALUES (:username, :password_hash)`,
      { username, password_hash: hashedPassword },
      { autoCommit: true }
    );
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Error registering user', details: error.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.error('Error closing connection:', error);
      }
    }
  }
});

app.post('/login', async (req, res) => {
  let connection;
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT id, password_hash FROM users WHERE username = :username`,
      { username }
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const [userId, passwordHash] = result.rows[0];
    if (await bcrypt.compare(password, passwordHash)) {
      const token = jwt.sign({ userId, username }, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.json({ token });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error logging in', details: error.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.error('Error closing connection:', error);
      }
    }
  }
});

io.use((socket, next) => {
  const token = socket.handshake.query.token;
  if (token) {
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error('Authentication error'));
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      socket.join(decoded.username);
      next();
    });
  } else {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.username}`);

  socket.on('sendMessage', async (data) => {
    let connection;
    try {
      const { recipient, message } = data;
      if (!recipient || !message) {
        socket.emit('error', 'Recipient and message required');
        return;
      }
      connection = await oracledb.getConnection(dbConfig);
      const recipientResult = await connection.execute(
        `SELECT id FROM users WHERE username = :username`,
        { username: recipient }
      );
      if (recipientResult.rows.length === 0) {
        socket.emit('error', 'Recipient not found');
        return;
      }
      const recipientId = recipientResult.rows[0][0];
      await connection.execute(
        `INSERT INTO messages (sender_id, recipient_id, message) VALUES (:sender_id, :recipient_id, :message)`,
        { sender_id: socket.userId, recipient_id: recipientId, message },
        { autoCommit: true }
      );
      io.to(recipient).emit('receiveMessage', {
        sender: socket.username,
        message,
        timestamp: new Date().toISOString()
      });
      socket.emit('receiveMessage', {
        sender: socket.username,
        message,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', 'Error sending message');
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (error) {
          console.error('Error closing connection:', error);
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.username}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});