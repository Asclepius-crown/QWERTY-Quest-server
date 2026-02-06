const dotenv = require('dotenv');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const Text = require('./models/Text');
const Race = require('./models/Race');
const User = require('./models/User');
const app = require('./app');
const connectDB = require('./db');

dotenv.config();

// Seed sample texts
const seedTexts = async () => {
  try {
    const count = await Text.countDocuments();
    if (count === 0) {
      const texts = [
        {
          content: "The quick brown fox jumps over the lazy dog. This pangram contains every letter of the alphabet at least once.",
          difficulty: 'easy',
          category: 'general'
        },
        {
          content: "In a hole in the ground there lived a hobbit. Not a nasty, dirty, wet hole, filled with the ends of worms and an oozy smell.",
          difficulty: 'easy',
          category: 'quotes'
        },
        {
          content: "function calculateWPM(text, timeInMinutes) { const words = text.split(' ').length; return Math.round(words / timeInMinutes); }",
          difficulty: 'hard',
          category: 'code'
        },
        {
          content: "To be or not to be, that is the question. Whether 'tis nobler in the mind to suffer the slings and arrows of outrageous fortune.",
          difficulty: 'medium',
          category: 'quotes'
        },
        {
          content: "The only way to do great work is to love what you do. If you haven't found it yet, keep looking. Don't settle.",
          difficulty: 'medium',
          category: 'quotes'
        }
      ];
      await Text.insertMany(texts);
      console.log('Sample texts seeded');
    }
  } catch (err) {
    console.error('Seeding error:', err);
  }
};

const startServer = async () => {
  try {
    await connectDB();
    await seedTexts();
    
    // Global error handler (if not already attached to app)
    app.use((err, req, res, next) => {
      console.error(err.stack);
      res.status(500).json({ error: err.message, stack: err.stack });
    });

    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => console.log(`Server started on port ${PORT}`));

    // Socket.io
    const io = socketIo(server, {
      cors: {
        origin: [
          process.env.CLIENT_URL,
          'https://qwerty-quest-client.vercel.app',
          'http://localhost:3000',
          'http://localhost:5173'
        ],
        credentials: true
      }
    });

    let matchmakingQueue = [];
    let rankedQueue = []; // Separate queue for ranked matches
    let activeRaces = new Map(); // raceId -> { participants, text, startTime, ... }
    let connectedUsers = new Map(); // userId -> socketId (for notifications/invites)
    let privateLobbies = new Map(); // roomId -> [participants]
    let matchmakingStartTimes = new Map(); // userId -> timestamp when joined queue
    let rankedMatchmakingStartTimes = new Map(); // userId -> timestamp when joined ranked queue
    
    // Expose connectedUsers to routes via app.locals
    app.locals.connectedUsers = connectedUsers;

    io.on('connection', (socket) => {
      console.log('User connected:', socket.id);

      socket.on('register', (userId) => {
        connectedUsers.set(userId, socket.id);
      });

      // --- Challenge System ---
      socket.on('send-challenge', async ({ targetUserId, senderName }) => {
        const targetSocketId = connectedUsers.get(targetUserId);
        if (targetSocketId) {
          io.to(targetSocketId).emit('challenge-received', { 
            challengerId: socket.userId, // Assuming we had userId, but we can pass it from client
            challengerName: senderName 
          });
        }
      });

      socket.on('respond-challenge', ({ challengerId, accepted, responderId }) => {
        const challengerSocketId = connectedUsers.get(challengerId);
        
        if (accepted) {
          const roomId = `private_${Date.now()}_${Math.random()}`;
          // Notify both to join this room
          if (challengerSocketId) io.to(challengerSocketId).emit('challenge-accepted', { roomId });
          socket.emit('challenge-accepted', { roomId }); // Notify responder
        } else {
          if (challengerSocketId) io.to(challengerSocketId).emit('challenge-declined');
        }
      });

      // --- Direct Messaging / Poke ---
      socket.on('send-poke', ({ targetUserId, senderName, message }) => {
        const targetSocketId = connectedUsers.get(targetUserId);
        if (targetSocketId) {
          io.to(targetSocketId).emit('poke-received', { 
            senderId: socket.userId, // sender userId if available or pass it in data
            senderName,
            message 
          });
        }
      });

      // --- Private Lobby Join ---
      socket.on('join-private', async (data) => {
        const { userId, roomId } = data;
        
        if (!privateLobbies.has(roomId)) {
           privateLobbies.set(roomId, []);
        }
        
        const lobby = privateLobbies.get(roomId);
        // Avoid duplicate join
        if (!lobby.find(p => p.userId === userId)) {
            lobby.push({ socketId: socket.id, userId });
        }

        if (lobby.length === 2) {
           // Start Private Race
           const participants = lobby;
           // Remove from waiting map
           privateLobbies.delete(roomId);

           // Reuse race start logic
           const textDoc = await Text.findOne({ difficulty: 'medium' }); // Default medium for now
           if (!textDoc) return;

           // Fetch user details
           const participantsWithUserDetails = await Promise.all(
            participants.map(async (p) => {
              const user = await User.findById(p.userId);
              return {
                ...p,
                username: user?.username || 'Unknown',
                displayName: user?.displayName || user?.username || 'Unknown'
              };
            })
           );

           const race = new Race({
            participants: participantsWithUserDetails.map(p => ({ userId: p.userId })),
            text: textDoc._id,
            type: 'multiplayer' // or 'private'
           });
           await race.save();

           activeRaces.set(roomId, {
            id: race._id,
            participants: participantsWithUserDetails,
            text: textDoc.content,
            textId: textDoc._id,
            startTime: Date.now() + 3000,
            progress: new Map()
           });

           // Emit start
           participantsWithUserDetails.forEach(p => {
             const sock = io.sockets.sockets.get(p.socketId);
             if (sock) {
               sock.join(roomId);
               sock.emit('race-matched', {
                 raceId: roomId,
                 text: textDoc.content,
                 participants: participantsWithUserDetails.map(user => ({ 
                   userId: user.userId,
                   username: user.username,
                   displayName: user.displayName
                 })),
                 startTime: activeRaces.get(roomId).startTime
               });
             }
           });
        }
      });

      socket.on('join-queue', async (data) => {
        const { userId } = data;
        matchmakingQueue.push({ socketId: socket.id, userId, joinTime: Date.now() });
        matchmakingStartTimes.set(userId, Date.now());

        if (matchmakingQueue.length >= 2) {
          // Start race
          const queueParticipants = matchmakingQueue.splice(0, 2); // Take first 2
          
          // Calculate matchmaking times for both participants
          const { trackMatchmakingTime } = require('./routes/stats');
          queueParticipants.forEach(p => {
            const startTime = matchmakingStartTimes.get(p.userId);
            if (startTime) {
              const waitTime = (Date.now() - startTime) / 1000; // Convert to seconds
              trackMatchmakingTime(waitTime);
              matchmakingStartTimes.delete(p.userId);
            }
          });
          const raceId = `race_${Date.now()}_${Math.random()}`;

          // Get random text
          const textDoc = await Text.findOne({ difficulty: 'medium' });
          if (!textDoc) return;

          // Fetch user details for participants
          const participantsWithUserDetails = await Promise.all(
            queueParticipants.map(async (p) => {
              const user = await User.findById(p.userId);
              return {
                ...p,
                username: user?.username || 'Unknown',
                displayName: user?.displayName || user?.username || 'Unknown'
              };
            })
          );

          const race = new Race({
            participants: participantsWithUserDetails.map(p => ({ userId: p.userId })),
            text: textDoc._id,
            type: 'multiplayer'
          });
          await race.save();

          activeRaces.set(raceId, {
            id: race._id,
            participants: participantsWithUserDetails,
            text: textDoc.content,
            textId: textDoc._id,
            startTime: Date.now() + 3000, // 3 second countdown
            progress: new Map(),
            type: 'multiplayer'
          });

          // Emit to participants
          participantsWithUserDetails.forEach(p => {
            const sock = io.sockets.sockets.get(p.socketId);
            if (sock) {
              sock.join(raceId);
              sock.emit('race-matched', {
                raceId,
                text: textDoc.content,
                participants: participantsWithUserDetails.map(p => ({ 
                  userId: p.userId,
                  username: p.username,
                  displayName: p.displayName
                })),
                startTime: activeRaces.get(raceId).startTime,
                type: 'multiplayer'
              });
            }
          });
        } else {
          socket.emit('waiting-for-opponent');
        }
      });

      // --- Ranked Matchmaking ---
      socket.on('join-ranked-queue', async (data) => {
        const { userId } = data;
        
        // Get user's ELO for skill-based matching
        const user = await User.findById(userId);
        if (!user) {
          socket.emit('ranked-queue-error', { message: 'User not found' });
          return;
        }
        
        const userElo = user.stats.elo || 1000;
        
        // Add to ranked queue with ELO
        rankedQueue.push({ 
          socketId: socket.id, 
          userId, 
          joinTime: Date.now(),
          elo: userElo
        });
        rankedMatchmakingStartTimes.set(userId, Date.now());
        
        // Try to find a match within acceptable ELO range
        const ELO_THRESHOLD = 200; // Maximum ELO difference for matching
        
        const potentialOpponents = rankedQueue.filter(p => 
          p.userId !== userId && Math.abs(p.elo - userElo) <= ELO_THRESHOLD
        );
        
        if (potentialOpponents.length > 0) {
          // Find closest ELO match
          const opponent = potentialOpponents.reduce((closest, current) => 
            Math.abs(current.elo - userElo) < Math.abs(closest.elo - userElo) ? current : closest
          );
          
          // Remove both players from queue
          rankedQueue = rankedQueue.filter(p => p.userId !== userId && p.userId !== opponent.userId);
          
          // Calculate matchmaking times
          const { trackMatchmakingTime } = require('./routes/stats');
          [userId, opponent.userId].forEach(id => {
            const startTime = rankedMatchmakingStartTimes.get(id);
            if (startTime) {
              const waitTime = (Date.now() - startTime) / 1000;
              trackMatchmakingTime(waitTime);
              rankedMatchmakingStartTimes.delete(id);
            }
          });
          
          const raceId = `ranked_${Date.now()}_${Math.random()}`;
          
          // Get random text for ranked match
          const textDoc = await Text.findOne({ difficulty: 'medium' });
          if (!textDoc) return;
          
          // Fetch user details
          const queueParticipants = [
            { socketId: socket.id, userId, elo: userElo },
            opponent
          ];
          
          const participantsWithUserDetails = await Promise.all(
            queueParticipants.map(async (p) => {
              const player = await User.findById(p.userId);
              return {
                ...p,
                username: player?.username || 'Unknown',
                displayName: player?.displayName || player?.username || 'Unknown',
                rank: player?.stats?.rank || 'Bronze',
                elo: player?.stats?.elo || 1000
              };
            })
          );
          
          const race = new Race({
            participants: participantsWithUserDetails.map(p => ({ userId: p.userId })),
            text: textDoc._id,
            type: 'ranked',
            rankedData: {
              averageElo: (userElo + opponent.elo) / 2,
              rankTier: user.stats.rank
            }
          });
          await race.save();
          
          activeRaces.set(raceId, {
            id: race._id,
            participants: participantsWithUserDetails,
            text: textDoc.content,
            textId: textDoc._id,
            startTime: Date.now() + 3000,
            progress: new Map(),
            type: 'ranked'
          });
          
          // Emit to participants
          participantsWithUserDetails.forEach(p => {
            const sock = io.sockets.sockets.get(p.socketId);
            if (sock) {
              sock.join(raceId);
              sock.emit('race-matched', {
                raceId,
                text: textDoc.content,
                participants: participantsWithUserDetails.map(p => ({ 
                  userId: p.userId,
                  username: p.username,
                  displayName: p.displayName,
                  rank: p.rank,
                  elo: p.elo
                })),
                startTime: activeRaces.get(raceId).startTime,
                type: 'ranked'
              });
            }
          });
        } else {
          socket.emit('waiting-for-opponent', { queueType: 'ranked' });
        }
      });
      
      socket.on('leave-ranked-queue', (data) => {
        const { userId } = data;
        rankedQueue = rankedQueue.filter(p => p.userId !== userId);
        rankedMatchmakingStartTimes.delete(userId);
        socket.emit('left-ranked-queue');
      });

      socket.on('race-progress', (data) => {
        const { raceId, userId, currentIndex, wpm, accuracy } = data;
        const race = activeRaces.get(raceId);
        if (race) {
          race.progress.set(userId, { currentIndex, wpm, accuracy });
          socket.to(raceId).emit('opponent-progress', { userId, currentIndex, wpm, accuracy });
        }
      });

      socket.on('race-finished', async (data) => {
        const { raceId, userId, wpm, accuracy, errors, timeTaken, replayData } = data;
        console.log(`[Race Finished] Race: ${raceId}, User: ${userId}, WPM: ${wpm}`);

        const race = activeRaces.get(raceId);
        if (race) {
          const participant = race.participants.find(p => p.userId === userId);
          if (participant) {
            participant.wpm = wpm;
            participant.accuracy = accuracy;
            participant.errors = errors;
            participant.timeTaken = timeTaken;
            participant.replayData = replayData;
            participant.completedAt = new Date();

            // Persist INDIVIDUAL result immediately
            try {
              const result = await Race.updateOne(
                { 
                  _id: race.id, 
                  'participants.userId': new mongoose.Types.ObjectId(userId) 
                },
                { 
                  $set: { 
                    'participants.$.wpm': wpm,
                    'participants.$.accuracy': accuracy,
                    'participants.$.errors': errors,
                    'participants.$.timeTaken': timeTaken,
                    'participants.$.completedAt': participant.completedAt,
                    'participants.$.replayData': replayData
                  }
                }
              );
              console.log('[DB Update] Result:', result);

              // Update user stats immediately
              const user = await User.findById(userId);
              if (user) {
                user.stats.bestWPM = Math.max(user.stats.bestWPM, wpm);
                user.stats.xp += Math.floor(wpm / 10);
                
                // Update average WPM
                // Ensure racesCompleted is initialized (handle migration case)
                if (user.stats.racesCompleted === undefined) user.stats.racesCompleted = 0;
                
                const previousTotal = user.stats.racesCompleted;
                user.stats.racesCompleted += 1;
                
                // Calculate new average
                // ((oldAvg * oldTotal) + newWPM) / newTotal
                user.stats.avgWPM = Math.round(
                  ((user.stats.avgWPM * previousTotal) + wpm) / user.stats.racesCompleted
                );

                await user.save();
              }

            } catch (err) {
              console.error('Error saving race progress:', err);
            }
          }

          // Check if all finished
          const finished = race.participants.every(p => p.completedAt);
          if (finished) {
            // Determine winner (highest WPM)
            const sortedParticipants = [...race.participants].sort((a, b) => b.wpm - a.wpm);
            const winner = sortedParticipants[0];
            const isDraw = sortedParticipants.length > 1 && sortedParticipants[0].wpm === sortedParticipants[1].wpm;
            
            await Race.findByIdAndUpdate(race.id, {
              winner: isDraw ? null : winner.userId,
              endTime: new Date()
            });

            // Handle Ranked Match ELO Calculations
            if (race.type === 'ranked' && race.participants.length === 2) {
              const player1 = race.participants[0];
              const player2 = race.participants[1];
              
              const user1 = await User.findById(player1.userId);
              const user2 = await User.findById(player2.userId);
              
              if (user1 && user2) {
                let result1, result2;
                
                if (isDraw) {
                  result1 = 0.5;
                  result2 = 0.5;
                } else if (player1.userId === winner.userId) {
                  result1 = 1;
                  result2 = 0;
                } else {
                  result1 = 0;
                  result2 = 1;
                }
                
                const oldElo1 = user1.stats.elo || 1000;
                const oldElo2 = user2.stats.elo || 1000;
                
                const change1 = User.calculateEloChange(oldElo1, oldElo2, result1);
                const change2 = User.calculateEloChange(oldElo2, oldElo1, result2);
                
                user1.stats.elo = oldElo1 + change1;
                user2.stats.elo = oldElo2 + change2;
                
                // Update ranked win/loss/draw stats
                if (result1 === 1) {
                  user1.stats.rankedWins = (user1.stats.rankedWins || 0) + 1;
                  user2.stats.rankedLosses = (user2.stats.rankedLosses || 0) + 1;
                } else if (result1 === 0) {
                  user1.stats.rankedLosses = (user1.stats.rankedLosses || 0) + 1;
                  user2.stats.rankedWins = (user2.stats.rankedWins || 0) + 1;
                } else {
                  user1.stats.rankedDraws = (user1.stats.rankedDraws || 0) + 1;
                  user2.stats.rankedDraws = (user2.stats.rankedDraws || 0) + 1;
                }
                
                // Update regular win count for winner
                if (!isDraw) {
                  const winnerUser = winner.userId === player1.userId ? user1 : user2;
                  winnerUser.stats.racesWon += 1;
                }
                
                await user1.save();
                await user2.save();
                
                // Update race with ELO changes
                await Race.findByIdAndUpdate(race.id, {
                  'rankedData.eloChanges': [
                    { userId: player1.userId, oldElo: oldElo1, newElo: user1.stats.elo, change: change1 },
                    { userId: player2.userId, oldElo: oldElo2, newElo: user2.stats.elo, change: change2 }
                  ]
                });
                
                // Emit detailed results for ranked matches
                io.to(raceId).emit('race-results', {
                  participants: race.participants,
                  winner: isDraw ? null : winner.userId,
                  type: 'ranked',
                  eloChanges: [
                    { userId: player1.userId, change: change1, newElo: user1.stats.elo },
                    { userId: player2.userId, change: change2, newElo: user2.stats.elo }
                  ],
                  isDraw
                });
              }
            } else {
              // Non-ranked match - just update winner
              const winnerUser = await User.findById(winner.userId);
              if (winnerUser && !isDraw) {
                winnerUser.stats.racesWon += 1;
                await winnerUser.save();
              }
              
              io.to(raceId).emit('race-results', {
                participants: race.participants,
                winner: isDraw ? null : winner.userId,
                type: race.type || 'multiplayer'
              });
            }

            activeRaces.delete(raceId);
          }
        }
      });

      socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Remove from queue if waiting
        matchmakingQueue = matchmakingQueue.filter(p => p.socketId !== socket.id);
        rankedQueue = rankedQueue.filter(p => p.socketId !== socket.id);
      });
    });

  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = app;