import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Gemini Setup
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.warn("⚠️ GEMINI_API_KEY is not set or using placeholder value. AI features may fail.");
  }
  
  const genAI = new GoogleGenerativeAI(apiKey || "");

  // API Routes
  app.post("/api/review-causality", async (req, res) => {
    console.log("Received /api/review-causality request");
    try {
      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }
      if (!process.env.GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is missing in process.env");
        return res.status(500).json({ error: "API key is not configured" });
      }

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      console.log("Successfully generated AI review");
      res.json({ text });
    } catch (error: any) {
      console.error("AI Review Error:", error);
      res.status(500).json({ error: error.message || "Failed to review causality" });
    }
  });

  app.post("/api/review-solutions", async (req, res) => {
    console.log("Received /api/review-solutions request");
    try {
      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }
      if (!process.env.GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is missing in process.env");
        return res.status(500).json({ error: "API key is not configured" });
      }

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      console.log("Successfully generated solution review");
      res.json({ text });
    } catch (error: any) {
      console.error("AI Solution Review Error:", error);
      res.status(500).json({ error: error.message || "Failed to review solutions" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
