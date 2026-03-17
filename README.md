# ⚙️ QWERTY Quest - Backend

<div align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express.js-4.18+-000000?style=for-the-badge&logo=express" alt="Express.js" />
  <img src="https://img.shields.io/badge/MongoDB-7.0+-47A248?style=for-the-badge&logo=mongodb" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Socket.io-4.7+-010101?style=for-the-badge&logo=socket.io" alt="Socket.io" />
  <img src="https://img.shields.io/badge/JWT-9.0+-000000?style=for-the-badge&logo=json-web-tokens" alt="JWT" />
</div>

<div align="center">
  <h3>🔧 Robust Backend API & Real-time Engine</h3>
  <p><em>Scalable Node.js server with WebSocket multiplayer support</em></p>
</div>

---

## 🚀 Quick Setup

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Redis (optional, for caching)

### Installation

1. **Install dependencies**
   ```bash
   cd typemaster-server
   npm install
   ```

2. **Environment configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Database setup**
   ```bash
   # Local MongoDB
   mongod

   # Or use MongoDB Atlas URI in .env
   ```

4. **Start server**
   ```bash
   npm run dev     # Development with nodemon
   npm start       # Production with PM2
   ```

### Available Scripts

```bash
npm run dev       # Development server with hot reload
npm start         # Production server with PM2
npm run build     # Build for production
npm run lint      # Run ESLint
npm run test      # Run test suite
npm run seed      # Seed database with sample data
```

---

## 🏗️ Architecture

### Core Technologies
- **Node.js + Express**: RESTful API server
- **MongoDB + Mongoose**: Document database with ODM
- **Socket.io**: Real-time bidirectional communication
- **JWT + Passport**: Authentication & authorization
- **WebAuthn**: Passwordless authentication
- **Redis**: Caching and session storage

### API Structure
```
api/
├── auth/              # Authentication endpoints
│   ├── login         # User login
│   ├── register      # User registration
│   ├── webauthn      # Passwordless auth
│   └── social        # OAuth providers
├── races/             # Race management
│   ├── create        # Start new race
│   ├── join          # Join existing race
│   └── results       # Race statistics
├── users/             # User management
│   ├── profile       # User profiles
│   ├── stats         # Performance metrics
│   └── achievements  # Achievement system
├── coaching/          # AI coaching system
│   ├── insights      # Performance analysis
│   └── generate      # Practice text generation
└── leaderboard/       # Rankings and stats
```

### Real-time Events
```javascript
// Race Events
'race:start'       // Race begins
'race:update'      // Live progress updates
'race:finish'      // Race completion
'race:join'        // Player joins race
'race:leave'       // Player leaves race

// Chat Events
'message:send'     // Send chat message
'message:receive'  // Receive chat message

// System Events
'user:online'      // User comes online
'user:offline'     // User goes offline
'achievement:unlock' // Achievement unlocked
```

---

## 🔐 Authentication System

### Supported Methods
- **JWT Tokens**: Session management and API auth
- **WebAuthn**: Biometric/passkey authentication
- **OAuth 2.0**: Google, GitHub, Discord integration
- **Magic Links**: Email-based passwordless login
- **MFA**: TOTP with authenticator apps

### Security Features
- **Rate Limiting**: API endpoint protection
- **Input Validation**: Sanitization and schema validation
- **CORS**: Cross-origin resource sharing control
- **Helmet**: Security headers middleware
- **Encryption**: Password hashing with bcrypt

---

## 🗄️ Database Schema

### User Model
```javascript
{
  _id: ObjectId,
  username: String,
  email: String,
  displayName: String,
  avatar: String,
  auth: {
    password: String,      // Hashed
    webauthn: [Object],    // WebAuthn credentials
    mfa: {
      enabled: Boolean,
      secret: String       // TOTP secret
    }
  },
  stats: {
    racesPlayed: Number,
    totalWPM: Number,
    bestWPM: Number,
    accuracy: Number,
    ranking: Number
  },
  achievements: [ObjectId],
  friends: [ObjectId],
  createdAt: Date,
  updatedAt: Date
}
```

### Race Model
```javascript
{
  _id: ObjectId,
  type: String,           // 'solo', 'multiplayer', 'ranked'
  status: String,         // 'waiting', 'active', 'completed'
  text: String,           // Race text content
  language: String,       // Programming language
  duration: Number,       // Time limit in seconds
  participants: [{
    userId: ObjectId,
    username: String,
    progress: Number,     // 0-100
    wpm: Number,
    accuracy: Number,
    finishedAt: Date
  }],
  winner: ObjectId,
  createdAt: Date,
  completedAt: Date
}
```

---

## 🎮 Game Logic

### Race Management
- **Matchmaking**: Skill-based opponent pairing
- **Real-time Sync**: Sub-50ms latency updates
- **Anti-cheat**: Input validation and timing checks
- **Spectator Mode**: Watch live races

### AI Coaching Engine
- **Performance Analysis**: Keystroke pattern recognition
- **Weakness Detection**: Identify slow key transitions
- **Practice Generation**: Dynamic difficulty adjustment
- **Progress Tracking**: Historical performance trends

### Achievement System
- **100+ Achievements**: Beginner to expert challenges
- **Real-time Unlocking**: Instant reward notifications
- **Progress Tracking**: Visual completion indicators

---

## 📊 Monitoring & Analytics

### Performance Metrics
- **Response Times**: API endpoint latency tracking
- **Concurrent Users**: Real-time connection monitoring
- **Error Rates**: Exception tracking and alerting
- **Database Performance**: Query optimization metrics

### Logging
```javascript
// Winston Logger Configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

---

## 🧪 Testing & Quality

### Test Coverage
```bash
npm run test              # Unit & integration tests
npm run test:e2e          # End-to-end tests
npm run test:performance  # Load testing
npm run test:security     # Security vulnerability scans
```

### Testing Stack
- **Jest**: Unit testing framework
- **Supertest**: API endpoint testing
- **MongoDB Memory Server**: In-memory database testing
- **Socket.io Client**: WebSocket testing utilities

---

## 🚀 Deployment

### Production Checklist
- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] Database connections optimized
- [ ] Redis cache configured
- [ ] Monitoring tools set up
- [ ] Backup procedures implemented

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
    depends_on:
      - mongodb
      - redis

  mongodb:
    image: mongo:7.0
    volumes:
      - mongodb_data:/data/db

  redis:
    image: redis:7-alpine
volumes:
  mongodb_data:
```

---

## 🔧 Configuration

### Environment Variables
```env
# Server
PORT=5000
NODE_ENV=production
API_VERSION=v1

# Database
MONGO_URI=mongodb://localhost:27017/typemaster
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-super-secret-key
JWT_EXPIRES=7d
BCRYPT_ROUNDS=12

# OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# WebAuthn
WEBAUTHN_RP_ID=yourdomain.com
WEBAUTHN_ORIGIN=https://yourdomain.com

# External APIs
ANALYTICS_KEY=your_analytics_key
CDN_URL=https://cdn.yourdomain.com
```

---

## 🐛 Troubleshooting

### Common Issues

**Database Connection Failed**
```bash
# Check MongoDB status
sudo systemctl status mongod

# Test connection
mongosh --eval "db.adminCommand('ping')"
```

**Socket.io Connection Issues**
```javascript
// Debug client-side connection
const socket = io('http://localhost:5000', {
  transports: ['websocket', 'polling']
});

socket.on('connect_error', (error) => {
  console.log('Connection failed:', error);
});
```

**Memory Leaks**
```bash
# Monitor with PM2
pm2 monit

# Check heap usage
node --inspect index.js
```

---

## 📈 Performance Optimization

### Database Optimization
- **Indexing**: Strategic compound indexes
- **Aggregation Pipelines**: Efficient data processing
- **Connection Pooling**: Optimized MongoDB connections
- **Caching**: Redis for frequently accessed data

### Server Optimization
- **Clustering**: PM2 process management
- **Compression**: Gzip response compression
- **Rate Limiting**: API protection with express-rate-limit
- **Load Balancing**: Nginx reverse proxy configuration

---

<div align="center">

**Part of the QWERTY Quest project** • **[Main README](../README.md)** • **[Client README](../typemaster-client/README.md)**

Made with ❤️ by [Amit Raj](https://github.com/Asclepius-crown)

</div></content>
</xai:function_call name="filePath">C:\Users\Amit Raj\OneDrive\Desktop\final\QWERTY Quest\typemaster-server\README.md
