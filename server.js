const express = require("express");
const path = require("path");
const app = express();

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Optional feedback endpoint
app.post("/feedback", (req, res) => {
  console.log("Feedback received:", req.body);
  res.status(200).json({ message: "Thank you for your feedback!" });
});

// ✅ Use Render/Vercel port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
