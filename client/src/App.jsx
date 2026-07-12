import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { Activity, AlertTriangle, ArrowDownLeft, ArrowUpRight, Banknote, Bell, BrainCircuit, ChevronRight, CircleDollarSign, Clock3, LogOut, RefreshCw, Search, ShieldCheck, Smartphone, TrendingDown, Users, WalletCards, X } from "lucide-react";

const money = new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 });
async function request(url, options = {}) {
  const response = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Something went wrong");
  return data;
}
const API = {
  login: (phone, password) => request("/api/login", { method: "POST", body: JSON.stringify({ phone, password, role: "agent" }) }),
  adminLogin: (phone, password) => request("/api/login", { method: "POST", body: JSON.stringify({ phone, password, role: "admin" }) }),
  register: payload => request("/api/register", { method: "POST", body: JSON.stringify(payload) }),
  logout: () => request("/api/logout", { method: "POST" }),
  analyze: () => request("/api/analyze"),
  regenerate: () => request("/api/transactions/regenerate", { method: "POST" }),
  adminOverview: () => request("/api/admin/overview"),
  agentDetail: id => request(`/api/admin/agents/${id}`),
};

export default function App() {
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem("liquidity_session")); } catch { return null; } });
  const login = data => { const next = data.role === "admin" ? { role: "admin", user: data.admin } : { role: "agent", user: data.agent }; localStorage.setItem("liquidity_session", JSON.stringify(next)); setSession(next); };
  const logout = async () => { try { await API.logout(); } catch {} localStorage.removeItem("liquidity_session"); setSession(null); };
  if (!session) return <Login onLogin={login} />;
  return session.role === "admin" ? <AdminDashboard admin={session.user} onLogout={logout} /> : <AgentDashboard agent={session.user} onLogout={logout} />;
}

function Login({ onLogin }) {
  const [mode, setMode] = useState("agent");
  const [view, setView] = useState("login");
  const [form, setForm] = useState({ username: "", district: "", phone: "", password: "" });
  const [state, setState] = useState({ loading: false, error: "", success: "" });
  const changeMode = next => { setMode(next); setView("login"); setState({ loading: false, error: "", success: "" }); };
  const submit = async e => {
    e.preventDefault();
    setState({ loading: true, error: "", success: "" });
    try {
      if (view === "register") {
        const result = await API.register(form);
        setView("login");
        setState({ loading: false, error: "", success: result.message || "Registration successful. You can sign in now." });
        return;
      }
      onLogin(await (mode === "admin" ? API.adminLogin(form.phone, form.password) : API.login(form.phone, form.password)));
    } catch (err) {
      setState({ loading: false, error: err.message, success: "" });
    }
  };
  return <div className="login-page"><div className="login-brand"><div className="brand-icon"><BrainCircuit /></div><span>Super Agent</span></div><div className="login-card"><span className="eyebrow">SECURE ACCESS</span><h1>{mode === "admin" ? "Admin control center" : view === "register" ? "Create agent account" : "Agent dashboard"}</h1><p>{view === "register" ? "Register an agent profile to start monitoring provider balances and liquidity risk." : "Sign in to monitor liquidity, predicted shortages, and transaction risk."}</p><div className="role-switch"><button type="button" className={mode === "agent" ? "active" : ""} onClick={() => changeMode("agent")}>Agent</button><button type="button" className={mode === "admin" ? "active" : ""} onClick={() => changeMode("admin")}>Admin only</button></div><form onSubmit={submit}>{view === "register" && <><label>Agent name<input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="Full name" required /></label><label>District<input value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} placeholder="District" required /></label></>}<label>Phone number<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder={mode === "admin" ? "Admin phone" : "Agent phone"} required /></label><label>Password<input type="password" minLength={view === "register" ? 6 : undefined} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Enter password" required /></label>{state.error && <div className="error-box">{state.error}</div>}{state.success && <div className="success-box">{state.success}</div>}<button className="primary wide" disabled={state.loading}>{state.loading ? (view === "register" ? "Creating account..." : "Signing in...") : view === "register" ? "Register agent" : `Sign in as ${mode}`}</button></form>{mode === "agent" && <button type="button" className="auth-link" onClick={() => { setView(view === "login" ? "register" : "login"); setState({ loading: false, error: "", success: "" }); }}>{view === "login" ? "New agent? Create an account" : "Already registered? Sign in"}</button>}</div></div>;
}

function AdminDashboard({ admin, onLogout }) {
  const [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [search, setSearch] = useState(""), [status, setStatus] = useState("All"), [selected, setSelected] = useState(null);
  const load = async () => { setLoading(true); setError(""); try { setData(await API.adminOverview()); } catch (e) { setError(e.message); } finally { setLoading(false); } };
  useEffect(() => {
    load();
    const socket = io({ withCredentials: true });
    socket.on("admin:overview-updated", next => { setData(next); setLoading(false); setError(""); });
    return () => socket.disconnect();
  }, []);
  const agents = useMemo(() => (data?.agents || []).filter(a => (status === "All" || a.status === status) && `${a.id} ${a.agentName} ${a.district}`.toLowerCase().includes(search.toLowerCase())), [data, search, status]);
  const openAgent = async id => { try { setSelected({ loading: true }); setSelected(await API.agentDetail(id)); } catch (e) { setError(e.message); setSelected(null); } };
  return <div className="app-shell"><Sidebar name={admin.username} role="Administrator" onLogout={onLogout} /><main className="main"><Topbar title="Liquidity & Risk Intelligence" subtitle="ADMIN OVERVIEW" /><div className="page-content">{error && <div className="error-box">{error}</div>}<section className="metric-grid"><Metric icon={<Users />} label="Total agents" value={data?.metrics.totalAgents || 0} /><Metric icon={<Clock3 />} label="Active today" value={data?.metrics.activeToday || 0} /><Metric icon={<Banknote />} label="Low cash alerts" value={data?.metrics.lowCashAlerts || 0} tone="warning" /><Metric icon={<AlertTriangle />} label="High risk" value={data?.metrics.highRisk || 0} tone="critical" /></section><section className="admin-grid"><div className="panel"><PanelTitle title="Live liquidity status" subtitle="Current health across all registered agents" /><div className="status-list"><StatusRow status="Healthy" count={data?.status.healthy || 0} total={data?.metrics.totalAgents || 1} /><StatusRow status="Warning" count={data?.status.warning || 0} total={data?.metrics.totalAgents || 1} /><StatusRow status="Critical" count={data?.status.critical || 0} total={data?.metrics.totalAgents || 1} /></div></div><div className="panel alerts-panel"><PanelTitle title="AI alerts" subtitle="Prioritized operational warnings" /><div className="alerts-list">{data?.alerts?.length ? data.alerts.slice(0, 4).map(a => <button key={a.id} className="alert-row" onClick={() => openAgent(a.id)}><StatusDot status={a.status} /><div><strong>{a.id} · {a.agentName}</strong><span>{a.alert}</span></div><ChevronRight /></button>) : <Empty text="No active alerts" />}</div></div></section><section className="panel agents-panel"><div className="table-heading"><PanelTitle title="Agent list" subtitle="Balances, district, activity and severity" /><div className="table-tools"><div className="search"><Search /><input placeholder="Search agents" value={search} onChange={e => setSearch(e.target.value)} /></div><select value={status} onChange={e => setStatus(e.target.value)}><option>All</option><option>Healthy</option><option>Warning</option><option>Critical</option></select></div></div><AgentTable agents={agents} onView={openAgent} /></section></div>{selected && <AgentDrawer data={selected} onClose={() => setSelected(null)} />}</main></div>;
}

function AgentDashboard({ agent, onLogout }) {
  const [analysis, setAnalysis] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [regenerating, setRegenerating] = useState(false), [search, setSearch] = useState("");
  const load = async () => { try { setAnalysis(await API.analyze()); setError(""); } catch (e) { setError(e.message); } finally { setLoading(false); } };
  useEffect(() => {
    load();
    const socket = io({ withCredentials: true });
    socket.on("agent:analysis-updated", next => { setAnalysis(next); setLoading(false); setError(""); });
    return () => socket.disconnect();
  }, []);
  const regenerate = async () => { setRegenerating(true); try { await API.regenerate(); await load(); } catch (e) { setError(e.message); } finally { setRegenerating(false); } };
  const tx = (analysis?.todayTransactions || []).filter(t => `${t.provider} ${t.type} ${t.amount}`.toLowerCase().includes(search.toLowerCase()));
  const b = analysis?.balances || {};
  return <div className="app-shell"><Sidebar name={agent.agentName} role={`${agent.id} · ${agent.district}`} onLogout={onLogout} /><main className="main"><Topbar title={`Welcome, ${agent.agentName?.split(" ")[0] || "Agent"}`} subtitle="AGENT DASHBOARD" action={<button className="primary" onClick={regenerate} disabled={regenerating}><RefreshCw className={regenerating ? "spin" : ""} />{regenerating ? "Regenerating..." : "Regenerate transactions"}</button>} /><div className="page-content">{error && <div className="error-box">{error}</div>}<section className="balance-grid"><Balance label="Physical cash" value={b.physicalCash} icon={<Banknote />} /><Balance label="bKash balance" value={b.bkash} icon={<Smartphone />} /><Balance label="Nagad balance" value={b.nagad} icon={<Smartphone />} /><Balance label="Rocket balance" value={b.rocket} icon={<WalletCards />} /></section><section className="panel intelligence-panel"><PanelTitle title="30-day transaction baseline" subtitle={`${analysis?.baseline?.transactionsUsed || 0} transactions across ${analysis?.baseline?.daysCovered || 0} active days`} /><BaselineGrid baseline={analysis?.baseline} /></section><section className="panel intelligence-panel"><PanelTitle title="4-hour liquidity forecast" subtitle="Provider-specific prediction using historical baseline and recent velocity" /><ForecastGrid forecasts={analysis?.forecasts || []} /></section><section className="admin-grid"><div className="panel"><PanelTitle title="Today's summary" subtitle="Live transaction activity" /><div className="summary-row"><Mini label="Transactions" value={analysis?.todaySummary?.transactions || 0} icon={<CircleDollarSign />} /><Mini label="Cash in" value={money.format(analysis?.todaySummary?.cashIn || 0)} icon={<ArrowDownLeft />} /><Mini label="Cash out" value={money.format(analysis?.todaySummary?.cashOut || 0)} icon={<ArrowUpRight />} /></div></div><div className="panel ai-card"><PanelTitle title="AI liquidity review" subtitle={`${b.liquidityPressure || "Low"} liquidity pressure`} /><p>{analysis?.aiAnalysis || (loading ? "Analyzing..." : "No analysis available.")}</p><div className="recommend"><ShieldCheck />{analysis?.recommendation}</div></div></section><section className="panel agents-panel"><div className="table-heading"><PanelTitle title="Recent transactions" subtitle="Today's latest activity" /><div className="search"><Search /><input placeholder="Search transactions" value={search} onChange={e => setSearch(e.target.value)} /></div></div><TransactionTable transactions={tx} /></section></div></main></div>;
}

function Sidebar({ name, role, onLogout }) { return <aside className="sidebar"><div className="logo"><div className="brand-icon"><BrainCircuit /></div><div><strong>Super Agent</strong><span></span></div></div><nav><a className="active">Overview</a><a>Agents</a><a>Risk alerts</a><a>Analytics</a></nav><div className="profile"><div className="avatar">{initials(name)}</div><div><strong>{name}</strong><span>{role}</span></div></div><button className="logout" onClick={onLogout}><LogOut />Sign out</button></aside>; }
function Topbar({ title, subtitle, action }) { return <header className="topbar"><div><span className="eyebrow">{subtitle}</span><h1>{title}</h1></div><div className="top-actions"><button className="icon"><Bell /></button>{action}</div></header>; }
function Metric({ icon, label, value, tone = "default" }) { return <article className={`metric ${tone}`}><div className="metric-icon">{icon}</div><div><span>{label}</span><strong>{value.toLocaleString()}</strong></div></article>; }
function PanelTitle({ title, subtitle }) { return <div className="panel-title"><h2>{title}</h2><p>{subtitle}</p></div>; }
function StatusDot({ status }) { return <span className={`status-dot ${status.toLowerCase()}`} />; }
function StatusRow({ status, count, total }) { return <div className="status-row"><div><StatusDot status={status} /><strong>{status} agents</strong></div><b>{count.toLocaleString()}</b><div className="status-track"><span className={status.toLowerCase()} style={{ width: `${Math.max(3, count / total * 100)}%` }} /></div></div>; }
function AgentTable({ agents, onView }) { return <div className="table-wrap"><table className="agents-table"><thead><tr><th>Agent</th><th>District</th><th>Cash</th><th>bKash</th><th>Nagad</th><th>Rocket</th><th>Forecast</th><th>Activity</th><th>Status</th><th></th></tr></thead><tbody>{agents.map(a => <tr key={a.id}><td><strong>{a.id}</strong><span>{a.agentName}</span></td><td>{a.district}</td><td>{money.format(a.cash || 0)}</td><td>{money.format(a.bkash_balance || 0)}</td><td>{money.format(a.nagad_balance || 0)}</td><td>{money.format(a.rocket_balance || 0)}</td><td><strong>{a.forecastProvider || "Stable"}</strong><span>{a.predictedMinutesLeft != null ? `${a.predictedMinutesLeft} min to threshold` : `${a.forecastConfidence || 0}% confidence`}</span></td><td>{a.activeToday ? "Active today" : "Inactive"}</td><td><span className={`badge ${a.status.toLowerCase()}`}><StatusDot status={a.status} />{a.status}</span></td><td><button className="view" onClick={() => onView(a.id)}>View details</button></td></tr>)}</tbody></table>{!agents.length && <Empty text="No matching agents found" />}</div>; }

function AgentDrawer({ data, onClose }) { if (data.loading) return <div className="drawer-overlay"><aside className="drawer"><button className="close" onClick={onClose}><X /></button><Empty text="Loading agent details..." /></aside></div>; const { agent, analysis, transactionHistory } = data; return <div className="drawer-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}><aside className="drawer"><button className="close" onClick={onClose}><X /></button><span className="eyebrow">AGENT INTELLIGENCE</span><h2>{agent.agentName}</h2><p className="drawer-sub">{agent.id} · {agent.district}</p><span className={`badge ${agent.status.toLowerCase()}`}><StatusDot status={agent.status} />{agent.status}</span>{agent.alert && <div className={`drawer-alert ${agent.status.toLowerCase()}`}><AlertTriangle />{agent.alert}</div>}<div className="drawer-balances provider-balances"><Balance label="Physical cash" value={agent.cash} icon={<Banknote />} /><Balance label="bKash float" value={agent.bkash_balance} icon={<Smartphone />} /><Balance label="Nagad float" value={agent.nagad_balance} icon={<Smartphone />} /><Balance label="Rocket float" value={agent.rocket_balance} icon={<WalletCards />} /></div><div className="detail-grid"><Mini label="Cash in today" value={money.format(agent.todayCashIn)} icon={<ArrowDownLeft />} /><Mini label="Cash out today" value={money.format(agent.todayCashOut)} icon={<ArrowUpRight />} /><Mini label="Transactions" value={agent.recentTransactions} icon={<CircleDollarSign />} /></div><div className="analysis-box"><BrainCircuit /><div><strong>AI analysis</strong><p>{analysis.aiAnalysis}</p></div></div><section className="drawer-section"><PanelTitle title="30-day baseline" subtitle={`${analysis.baseline?.transactionsUsed || 0} transactions used`} /><BaselineGrid baseline={analysis.baseline} compact /></section><section className="drawer-section"><PanelTitle title="Provider forecasts" subtitle="Predicted balances for the next four hours" /><ForecastGrid forecasts={analysis.forecasts || []} compact /></section><PanelTitle title="Recent transactions" subtitle="Latest five records" /><TransactionTable transactions={transactionHistory.slice(0, 5)} /></aside></div>; }

function BaselineGrid({ baseline, compact = false }) {
  if (!baseline) return <Empty text="Baseline is being calculated" />;
  return <div className={`baseline-grid ${compact ? "compact" : ""}`}>
    <BaselineItem label="Avg. daily cash in" value={money.format(baseline.averageDailyCashIn || 0)} />
    <BaselineItem label="Avg. daily cash out" value={money.format(baseline.averageDailyCashOut || 0)} />
    <BaselineItem label="Avg. transactions" value={`${baseline.averageDailyTransactions || 0}/day`} />
    <BaselineItem label="Peak cash-out time" value={baseline.peakCashOutWindow || "—"} />
    <BaselineItem label="Net cash drain" value={money.format(baseline.averageDailyNetCashDrain || 0)} />
    <BaselineItem label="History coverage" value={`${baseline.daysCovered || 0}/${baseline.historyDays || 30} days`} />
  </div>;
}
function BaselineItem({ label, value }) { return <div className="baseline-item"><span>{label}</span><strong>{value}</strong></div>; }
function ForecastGrid({ forecasts, compact = false }) {
  if (!forecasts.length) return <Empty text="Forecasts are being calculated" />;
  return <div className={`forecast-grid ${compact ? "compact" : ""}`}>{forecasts.map(forecast => <ForecastCard key={forecast.key} forecast={forecast} />)}</div>;
}
function ForecastCard({ forecast }) {
  return <article className={`forecast-card ${forecast.severity.toLowerCase()}`}>
    <div className="forecast-head"><div><span>{forecast.provider}</span><strong>{forecast.severity}</strong></div><Activity /></div>
    <div className="forecast-values"><div><span>Current</span><b>{money.format(forecast.currentBalance || 0)}</b></div><TrendingDown /><div><span>In 4 hours</span><b>{money.format(forecast.predictedBalance4h || 0)}</b></div></div>
    <p>{forecast.message}</p>
    <div className="forecast-meta"><span>{forecast.confidence}% confidence</span><span>{forecast.hourlyDrain ? `${money.format(forecast.hourlyDrain)}/hr drain` : "Stable trend"}</span></div>
  </article>;
}

function Balance({ label, value, icon }) { return <article className="balance"><div className="balance-icon">{icon}</div><div><span>{label}</span><strong>{money.format(value || 0)}</strong></div></article>; }
function Mini({ label, value, icon }) { return <div className="mini"><div>{icon}</div><span>{label}</span><strong>{value}</strong></div>; }
function TransactionTable({ transactions }) { return <div className="table-wrap"><table><thead><tr><th>Provider</th><th>Type</th><th>Date</th><th>Amount</th></tr></thead><tbody>{transactions.map((t, i) => <tr key={`${t.id}-${i}`}><td><strong>{t.provider}</strong></td><td>{t.type}</td><td>{formatDate(t.createdAt || t.date)}</td><td>{money.format(t.amount || 0)}</td></tr>)}</tbody></table>{!transactions.length && <Empty text="No transactions found" />}</div>; }
function Empty({ text }) { return <div className="empty">{text}</div>; }
function initials(name = "Admin") { return name.split(" ").map(x => x[0]).join("").slice(0, 2).toUpperCase(); }
function formatDate(v) { const d = new Date(v); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-BD", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
