const dotenv = require('dotenv');
const socketIo = require('socket.io');
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
    let activeRaces = new Map(); // raceId -> { participants, text, startTime, ... }

    io.on('connection', (socket) => {
      console.log('User connected:', socket.id);

      socket.on('join-queue', async (data) => {
        const { userId } = data;
        matchmakingQueue.push({ socketId: socket.id, userId });

        if (matchmakingQueue.length >= 2) {
          // Start race
          const queueParticipants = matchmakingQueue.splice(0, 2); // Take first 2
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
            progress: new Map()
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
                startTime: activeRaces.get(raceId).startTime
              });
            }
          });
        } else {
          socket.emit('waiting-for-opponent');
        }
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
              await Race.updateOne(
                { _id: race.id, 'participants.userId': userId },
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
            const winner = race.participants.reduce((prev, curr) => (curr.wpm > prev.wpm ? curr : prev));
            
            await Race.findByIdAndUpdate(race.id, {
              winner: winner.userId,
              endTime: new Date()
            });

            // Update user stats (Only Win count and Bonus XP if applicable)
            // Note: bestWPM, avgWPM, and base XP are already updated above.
            
            // Just update the winner
            const winnerUser = await User.findById(winner.userId);
            if (winnerUser) {
                winnerUser.stats.racesWon += 1;
                // Optional: Bonus XP for winning?
                // winnerUser.stats.xp += 50; 
                await winnerUser.save();
            }

            io.to(raceId).emit('race-results', {
              participants: race.participants,
              winner: winner.userId
            });

            activeRaces.delete(raceId);
          }
        }
      });

      socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Remove from queue if waiting
        matchmakingQueue = matchmakingQueue.filter(p => p.socketId !== socket.id);
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