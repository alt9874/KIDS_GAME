import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import crypto from 'crypto';
import multer from 'multer';
import fs from 'fs';
const firebaseConfig = JSON.parse(fs.readFileSync('./src/firebase-applet-config.json', 'utf-8'));

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- [Upload Directory Setup] ---
const publicDir = path.join(process.cwd(), 'public');
const uploadDir = path.join(publicDir, 'uploads');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  
  // Serve uploads directory - must be accessible in both dev and prod
  app.use('/uploads', express.static(uploadDir));

  // --- [API: File Upload] ---
  app.post("/api/upload", (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        // A Multer error occurred when uploading.
        return res.status(400).json({ error: `Multer error: ${err.message}` });
      } else if (err) {
        // An unknown error occurred when uploading.
        return res.status(500).json({ error: `Upload error: ${err.message}` });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const fileUrl = `/uploads/${req.file.filename}`;
      res.json({ url: fileUrl });
    });
  });

  // --- [API: IP-based Visit Tracking] ---
  app.post("/api/track-visit", async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      const referrer = req.body.referrer || 'Direct';
      
      // Sanitize referrer for Firestore field path (no dots, slashes, etc.)
      // Replace any character that is not alphanumeric, underscore, or hyphen
      const sanitizedReferrer = referrer.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      // Create a hash of the IP for privacy and to use as a document ID
      const ipHash = crypto.createHash('sha256').update(`${today}-${ip}`).digest('hex');
      
      const dailyVisitRef = doc(db, 'visits', today);
      const ipRef = doc(db, 'visits', today, 'ips', ipHash);

      const ipDoc = await getDoc(ipRef);
      
      if (!ipDoc.exists()) {
        // First time this IP visits today
        const dailyDoc = await getDoc(dailyVisitRef);
        
        if (!dailyDoc.exists()) {
          await setDoc(dailyVisitRef, {
            date: today,
            count: 1,
            referrers: { [sanitizedReferrer]: 1 },
            lastUpdated: serverTimestamp()
          });
        } else {
          await updateDoc(dailyVisitRef, {
            count: increment(1),
            [`referrers.${sanitizedReferrer}`]: increment(1),
            lastUpdated: serverTimestamp()
          });
        }
        
        // Mark this IP as tracked for today
        await setDoc(ipRef, { tracked: true, timestamp: serverTimestamp() });
        res.json({ status: "ok", newVisit: true });
      } else {
        res.json({ status: "ok", newVisit: false });
      }
    } catch (error) {
      console.error("Visit tracking error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Server error:", err);
    res.status(err.status || 500).json({ 
      error: err.message || "Internal server error",
      details: process.env.NODE_ENV !== "production" ? err.stack : undefined
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
