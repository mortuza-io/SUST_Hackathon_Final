import "dotenv/config";
import express from "express";
import session from "express-session";
import http from "node:http";
import { Server } from "socket.io";
import bcrypt from "bcryptjs";
import connectDB from "./config/database.js";
import User from "./models/user.model.js";
import Agent from "./models/agent.model.js";
import { analyzeAgent } from "./data/analyzer.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true }
});

app.use(express.json());
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "agentpulse-dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24, httpOnly: true, sameSite: "lax" }
});
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

io.on("connection", socket => {
  const user = socket.request.session?.user;
  if (!user) return socket.disconnect(true);
  socket.join(user.role === "admin" ? "admins" : `agent:${user.id}`);
});

async function emitAdminUpdate() {
  const agents = (await Agent.find().sort({ createdAt: -1 })).map(agentIntelligence);
  const healthy = agents.filter(a => a.status === "Healthy").length;
  const warning = agents.filter(a => a.status === "Warning").length;
  const critical = agents.filter(a => a.status === "Critical").length;
  io.to("admins").emit("admin:overview-updated", {
    metrics: { totalAgents: agents.length, activeToday: agents.filter(a => a.activeToday).length, lowCashAlerts: agents.filter(a => a.cash < 15000).length, highRisk: critical },
    status: { healthy, warning, critical },
    alerts: agents.filter(a => a.alert).sort((a, b) => ({ Critical: 0, Warning: 1, Healthy: 2 }[a.status]) - ({ Critical: 0, Warning: 1, Healthy: 2 }[b.status])).slice(0, 12),
    agents
  });
}

const ADMIN_PHONE = process.env.ADMIN_PHONE || "01700000000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_NAME = process.env.ADMIN_NAME || "Platform Admin";

async function ensureAdminAccount() {
  const phone = String(ADMIN_PHONE).trim();
  const existingAdmin = await User.findOne({ role: "admin" }).select("+password");

  if (existingAdmin) {
    console.log(`Admin account ready: ${existingAdmin.phone}`);
    return existingAdmin;
  }

  const phoneOwner = await User.findOne({ phone }).select("+password");
  if (phoneOwner && phoneOwner.role !== "admin") {
    throw new Error(`ADMIN_PHONE ${phone} is already used by an agent account`);
  }

  const passwordHash = await bcrypt.hash(String(ADMIN_PASSWORD), 12);
  const admin = await User.create({
    id: "ADMIN001",
    username: ADMIN_NAME,
    district: "Head Office",
    phone,
    password: passwordHash,
    role: "admin",
    isActive: true
  });

  console.log(`Default admin created in MongoDB: ${admin.phone}`);
  return admin;
}

async function verifyPassword(user, enteredPassword) {
  const storedPassword = String(user.password || "");
  const isHash = storedPassword.startsWith("$2a$") || storedPassword.startsWith("$2b$");

  if (isHash) return bcrypt.compare(String(enteredPassword), storedPassword);

  const matchesLegacyPassword = storedPassword === String(enteredPassword);
  if (matchesLegacyPassword) {
    user.password = await bcrypt.hash(String(enteredPassword), 12);
    await user.save();
  }
  return matchesLegacyPassword;
}

function calculateRisk(agent) {
  if (agent.cash < 10000 || agent.bkash_balance < 20000 || agent.nagad_balance < 20000 || agent.rocket_balance < 10000) agent.liquidityPressure = "High";
  else if (agent.cash < 25000 || agent.bkash_balance < 50000 || agent.nagad_balance < 50000 || agent.rocket_balance < 30000) agent.liquidityPressure = "Medium";
  else agent.liquidityPressure = "Low";
  return agent.liquidityPressure;
}

function generateHistory() {
  let cash = 30000 + Math.floor(Math.random() * 55000);
  let bkash = 50000 + Math.floor(Math.random() * 120000);
  let nagad = 20000 + Math.floor(Math.random() * 150000);
  let rocket = 10000 + Math.floor(Math.random() * 80000);
  const providers = ["bKash", "Nagad", "Rocket"];
  const history = [];
  let id = 1;

  for (let day = 29; day >= 0; day--) {
    const date = new Date();
    date.setDate(date.getDate() - day);
    const count = Math.floor(Math.random() * 8) + 8;
    for (let t = 0; t < count; t++) {
      const provider = providers[Math.floor(Math.random() * providers.length)];
      const type = Math.random() < 0.68 ? "Cash Out" : "Cash In";
      const amount = Math.floor(Math.random() * 4900) + 100;
      const createdAt = new Date(date);
      createdAt.setHours(Math.floor(Math.random() * 15) + 8, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));

      let completed = false;
      if (type === "Cash Out" && cash >= amount) {
        cash -= amount;
        if (provider === "bKash") bkash += amount;
        else if (provider === "Nagad") nagad += amount;
        else rocket += amount;
        completed = true;
      } else if (type === "Cash In") {
        const key = provider === "bKash" ? "bkash" : provider === "Nagad" ? "nagad" : "rocket";
        const balances = { bkash, nagad, rocket };
        if (balances[key] >= amount) {
          if (key === "bkash") bkash -= amount;
          else if (key === "nagad") nagad -= amount;
          else rocket -= amount;
          cash += amount;
          completed = true;
        }
      }
      if (completed) history.push({ id: id++, provider, type, amount, createdAt });
    }
  }
  history.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { cash, bkash, nagad, rocket, history };
}

function requireAgent(req, res, next) {
  if (!req.session.user || req.session.user.role !== "agent") return res.status(401).json({ message: "Agent login required" });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") return res.status(401).json({ message: "Admin login required" });
  next();
}

function transactionDate(t) { return new Date(t.createdAt || t.date); }
function sameDay(a, b) { return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10); }
function agentIntelligence(agent) {
  calculateRisk(agent);
  const intelligence = analyzeAgent(agent);
  const now = new Date();
  const recent = (agent.transactionHistory || []).filter(t => (now - transactionDate(t)) <= 24 * 60 * 60 * 1000);
  const lastActivity = agent.transactionHistory?.length ? transactionDate(agent.transactionHistory[0]) : agent.createdAt;
  const priority = { Critical: 0, Warning: 1, Healthy: 2 };
  const worstForecast = [...(intelligence.forecasts || [])].sort((a, b) => priority[a.severity] - priority[b.severity])[0];
  const status = worstForecast?.severity || (agent.liquidityPressure === "High" ? "Critical" : agent.liquidityPressure === "Medium" ? "Warning" : "Healthy");
  const alert = status === "Healthy" ? null : worstForecast?.message || "Liquidity risk detected.";

  return {
    id: agent.id,
    agentName: agent.agentName,
    district: agent.district,
    cash: agent.cash,
    bkash_balance: agent.bkash_balance,
    nagad_balance: agent.nagad_balance,
    rocket_balance: agent.rocket_balance,
    liquidityPressure: agent.liquidityPressure,
    status,
    recentTransactions: recent.length,
    todayCashIn: intelligence.todaySummary.cashIn,
    todayCashOut: intelligence.todaySummary.cashOut,
    predictedMinutesLeft: worstForecast?.shortageInMinutes ?? null,
    forecastProvider: worstForecast?.provider || null,
    forecastConfidence: worstForecast?.confidence || 0,
    forecasts: intelligence.forecasts,
    baseline: intelligence.baseline,
    lastActivity,
    activeToday: lastActivity ? sameDay(new Date(lastActivity), now) : false,
    alert
  };
}

app.post("/api/register", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const district = String(req.body.district || "").trim();
    const phone = String(req.body.phone || "").trim();
    const password = String(req.body.password || "");
    if (!username || !district || !phone || !password) return res.status(400).json({ message: "All fields are required" });
    if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
    if (await User.findOne({ phone })) return res.status(400).json({ message: "Phone number is already registered" });

    const lastUser = await User.findOne({ role: "agent" }).sort({ createdAt: -1 });
    const lastNumber = Number(String(lastUser?.id || "AG000").replace(/\D/g, "")) || 0;
    const id = `AG${String(lastNumber + 1).padStart(3, "0")}`;
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ id, username, district, phone, password: passwordHash, role: "agent" });

    const data = generateHistory();
    const agent = new Agent({
      id, agentName: username, district, cash: data.cash, bkash_balance: data.bkash,
      nagad_balance: data.nagad, rocket_balance: data.rocket, transactions_last_hour: 10,
      transactionHistory: data.history
    });
    calculateRisk(agent);
    await agent.save();
    await emitAdminUpdate();

    res.status(201).json({ success: true, message: "Agent account created successfully", user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const phone = String(req.body.phone || "").trim();
    const password = String(req.body.password || "");
    const requestedRole = String(req.body.role || "agent").toLowerCase();

    if (!phone || !password) {
      return res.status(400).json({ message: "Phone and password are required" });
    }

    const user = await User.findOne({ phone, role: requestedRole }).select("+password");
    if (!user || !user.isActive || !(await verifyPassword(user, password))) {
      return res.status(401).json({ message: `Invalid ${requestedRole} phone or password` });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      district: user.district,
      role: user.role
    };

    if (user.role === "admin") {
      return res.json({
        success: true,
        message: "Admin login successful",
        role: "admin",
        admin: user.toJSON()
      });
    }

    let agent = await Agent.findOne({ id: user.id });
    if (!agent) {
      const data = generateHistory();
      agent = new Agent({
        id: user.id,
        agentName: user.username,
        district: user.district,
        cash: data.cash,
        bkash_balance: data.bkash,
        nagad_balance: data.nagad,
        rocket_balance: data.rocket,
        transactions_last_hour: 10,
        transactionHistory: data.history
      });
      calculateRisk(agent);
      await agent.save();
    }

    return res.json({ success: true, message: "Login successful", role: "agent", agent });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// Compatibility endpoint; authentication still happens against MongoDB.
app.post("/api/admin/login", async (req, res) => {
  req.body.role = "admin";
  try {
    const phone = String(req.body.phone || "").trim();
    const password = String(req.body.password || "");
    const user = await User.findOne({ phone, role: "admin" }).select("+password");

    if (!user || !user.isActive || !(await verifyPassword(user, password))) {
      return res.status(401).json({ message: "Invalid admin phone or password" });
    }

    req.session.user = { id: user.id, username: user.username, district: user.district, role: "admin" };
    return res.json({ success: true, message: "Admin login successful", role: "admin", admin: user.toJSON() });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ success: true })));

app.get("/api/analyze", requireAgent, async (req, res) => {
  try {
    const agent = await Agent.findOne({ id: req.session.user.id });
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    res.json(analyzeAgent(agent));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/transactions/regenerate", requireAgent, async (req, res) => {
  try {
    const agent = await Agent.findOne({ id: req.session.user.id });
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    const data = generateHistory();
    Object.assign(agent, { cash: data.cash, bkash_balance: data.bkash, nagad_balance: data.nagad, rocket_balance: data.rocket, transactions_last_hour: 10, transactionHistory: data.history });
    calculateRisk(agent);
    await agent.save();
    const analysis = analyzeAgent(agent);
    io.to(`agent:${agent.id}`).emit("agent:analysis-updated", analysis);
    await emitAdminUpdate();
    res.json({ success: true, message: "Transaction history regenerated successfully", agent, analysis });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/api/admin/overview", requireAdmin, async (req, res) => {
  try {
    const agents = (await Agent.find().sort({ createdAt: -1 })).map(agentIntelligence);
    const healthy = agents.filter(a => a.status === "Healthy").length;
    const warning = agents.filter(a => a.status === "Warning").length;
    const critical = agents.filter(a => a.status === "Critical").length;
    res.json({
      metrics: { totalAgents: agents.length, activeToday: agents.filter(a => a.activeToday).length, lowCashAlerts: agents.filter(a => a.cash < 15000).length, highRisk: critical },
      status: { healthy, warning, critical },
      alerts: agents.filter(a => a.alert).sort((a, b) => ({ Critical: 0, Warning: 1, Healthy: 2 }[a.status]) - ({ Critical: 0, Warning: 1, Healthy: 2 }[b.status])).slice(0, 12),
      agents
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/api/admin/agents/:id", requireAdmin, async (req, res) => {
  try {
    const agent = await Agent.findOne({ id: req.params.id });
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    res.json({ agent: agentIntelligence(agent), analysis: analyzeAgent(agent), transactionHistory: agent.transactionHistory || [] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

async function startServer() {
  await connectDB();
  await ensureAdminAccount();

  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log(`Server running on port ${port}`));
}

startServer().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
