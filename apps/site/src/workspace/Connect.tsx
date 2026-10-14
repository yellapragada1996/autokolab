import { reportError } from "../lib/errors";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { connectLine, createPairing, type Pairing } from "../lib/data";
import { go } from "../lib/router";
import { Button } from "../ui";
import { agentOnline } from "./story";
import { apiConnectLine, PROVIDERS, providerOf, suggestedName, validModel, validName, type AgentChoice, type ApiSetup } from "./agentOptions";
import type { Workspace } from "./useWorkspace";

const field: CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--bg)", color: "var(--text)", fontSize: 14 };

/** One choice, one local setup, then the same pairing service subscription agents already use. */
export function ConnectAgents({ ws, me, onClose }: { ws: Workspace; me: string; onClose?: () => void }) {
  const [step, setStep] = useState(1);
  const [choice, setChoice] = useState<AgentChoice | null>(null);
  const [model, setModel] = useState("");
  const [other, setOther] = useState("");
  const [name, setName] = useState("");
  const [dailyUsd, setDailyUsd] = useState(5);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [making, setMaking] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [baseline, setBaseline] = useState<Set<string>>(new Set());
  const panel = useRef<HTMLElement>(null);
  const current = useRef({ ws, choice, model, other, name, dailyUsd });
  current.current = { ws, choice, model, other, name, dailyUsd };
  const provider = choice ? providerOf(choice) : undefined;
  const chosenModel = model === "other" ? other.trim() : model;
  const duplicate = [...ws.people.agents.values()].some((a) => a.display_name === name);
  const valid = validName(name) && validModel(chosenModel) && !duplicate && Number.isFinite(dailyUsd) && dailyUsd >= 0 && dailyUsd <= 10_000;
  const setup: ApiSetup | null = provider ? { provider: provider.id, model: chosenModel, name, dailyUsd: provider.id === "ollama" ? 0 : dailyUsd } : null;
  const close = () => onClose ? onClose() : go({ view: "people", project: ws.project.slug });
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 1500); return () => clearTimeout(t); }, [copied]);

  const fresh = async () => {
    setMaking(true); setErr(""); setPairing(null); setCopied(false);
    setBaseline(new Set(current.current.ws.people.agents.keys()));
    try {
      const made = ws.demoInvites ? { code: "7KQM2PXA", project_id: ws.project.id, expires_at: new Date(Date.now() + 30 * 60_000).toISOString(), used_at: null } : await createPairing(ws.project.id);
      setNow(Date.now()); setPairing(made);
    } catch (e) { setErr(reportError(e, "make a pairing code")); }
    setMaking(false);
  };
  useEffect(() => { if (step === 3) void fresh(); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  const left = pairing ? Math.max(0, Math.ceil((Date.parse(pairing.expires_at) - now) / 60_000)) : 0;
  const line = pairing && step === 3 ? setup && valid ? apiConnectLine(pairing.code, setup) : connectLine(pairing.code) : "";
  const arrived = [...ws.people.agents.values()].find((a) => !baseline.has(a.id) && a.owner_profile_id === me && agentOnline(a) && (provider ? a.vendor === "opencode" && a.display_name === name && (a.effective_model ?? a.model) === `${provider.id}/${chosenModel}` : a.vendor === choice));
  // The preview can exercise the arrival state without creating an agent or contacting the server.
  const demoOnline = !!ws.demoInvites && new URLSearchParams(location.search).get("connect") === "online";
  const onlineName = arrived?.display_name ?? (demoOnline && provider ? name : null);
  const choose = (id: AgentChoice) => {
    setChoice(id); setErr(""); const p = providerOf(id);
    if (p) { setModel(p.models[0]); setOther(""); setName(suggestedName(ws.people.profiles.get(me)?.github_login ?? "my", id)); setDailyUsd(5); }
  };
  const firstTicket = () => {
    sessionStorage.setItem(`autokolab.captainDraft.${ws.project.id}`, `Give ${onlineName} a small first ticket to start with.`);
    close(); go({ view: "captain", project: ws.project.slug });
  };

  return (
    <div className="ak-look-backdrop" onClick={close}>
      <section ref={panel} tabIndex={-1} className="ak-look ak-add-agent" role="dialog" aria-modal="true" aria-labelledby="add-agent-title" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); closeRef.current(); }
        if (e.key === "Tab" && panel.current) {
          const nodes = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])')].filter((el) => (el as HTMLInputElement).type !== "radio" || (el as HTMLInputElement).checked || !(panel.current?.querySelector(`input[name="${(el as HTMLInputElement).name}"]:checked`)));
          const first = nodes[0], last = nodes.at(-1);
          if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { e.preventDefault(); first?.focus(); }
        }
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h1 id="add-agent-title" className="ak-look-title">Add an agent</h1>
          <Button variant="ghost" onClick={close}>Close</Button>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }} aria-label={`Step ${step} of 3`}>
          {["Choose", "Set up", "Connect"].map((s, i) => <span key={s} aria-current={step === i + 1 ? "step" : undefined} style={{ color: step === i + 1 ? "var(--text)" : undefined }}>{i > 0 && " · "}{i + 1} {s}</span>)}
        </p>
        {step === 1 && <>
          <h2 style={{ fontSize: 18 }}>Which agent do you want to add?</h2>
          {([{ label: "Uses a subscription you already have", options: [{ id: "claude", name: "Claude Code", description: "Runs with your Claude plan on your computer." }, { id: "codex", name: "Codex", description: "Runs with your ChatGPT plan on your computer." }] }, { label: "Any model, with an API key", options: PROVIDERS }] as const).map((group) => <fieldset key={group.label} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>{group.label}</legend>
            <div className="ak-agent-options">{group.options.map((p) => <label key={p.id} className="ak-agent-option">
              <input type="radio" name="agent-choice" value={p.id} checked={choice === p.id} onChange={() => choose(p.id as AgentChoice)} />
              <span><strong style={{ display: "block", fontSize: 14 }}>{p.name}</strong><span style={{ fontSize: 13, color: "var(--text-muted)" }}>{p.description}</span></span>
            </label>)}</div>
          </fieldset>)}
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>The key never comes to this website. You'll type it on your computer in step 3.</p>
          <Button disabled={!choice} onClick={() => setStep(provider ? 2 : 3)}>Continue</Button>
        </>}
        {step === 2 && provider && <form onSubmit={(e) => { e.preventDefault(); if (valid) setStep(3); }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label>Model<select value={model} onChange={(e) => setModel(e.target.value)} style={field}>{provider.models.map((m, i) => <option key={m} value={m}>{m}{i === 0 ? " — Recommended for coding" : ""}</option>)}<option value="other">Other…</option></select></label>
          {model === "other" && <label>Model name<input style={field} value={other} maxLength={80} onChange={(e) => setOther(e.target.value)} required aria-describedby="model-rule" /><span id="model-rule" style={{ fontSize: 12, color: "var(--text-muted)" }}>Use the model name from {provider.id === "ollama" ? "Ollama" : provider.name}.</span></label>}
          <label>Name<input style={field} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-describedby="name-rule" required /><span id="name-rule" style={{ fontSize: 12, color: duplicate ? "var(--coral)" : "var(--text-muted)" }}>{duplicate ? "That name is already in this project. Choose another." : "2–40 lowercase letters, digits or dashes; start with a letter or digit."}</span></label>
          {provider.id !== "ollama" ? <>
            <label>Stop for the day after spending<span style={{ display: "flex", alignItems: "center", gap: 8 }}>$<input type="number" min={0} max={10000} step="0.01" value={Number.isNaN(dailyUsd) ? "" : dailyUsd} onChange={(e) => setDailyUsd(e.target.value === "" ? NaN : Number(e.target.value))} style={field} required /></span></label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{[2, 5, 20, 0].map((n) => <Button key={n} type="button" variant="secondary" aria-pressed={dailyUsd === n} onClick={() => setDailyUsd(n)}>{n === 0 ? "No limit" : `$${n}`}</Button>)}</div>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Pay-per-use: {provider.name} bills your account for each task. When the limit is reached, this agent waits until tomorrow.</p>
          </> : <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Ollama runs locally: no key and no API spend. Install Ollama and download this model on that computer first.</p>}
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>It runs on a computer you choose, like your Claude Code and Codex agents. Your code and key stay there.</p>
          <div style={{ display: "flex", gap: 8 }}><Button type="button" variant="secondary" onClick={() => setStep(1)}>Back</Button><Button type="submit" disabled={!valid}>Continue to connect</Button></div>
        </form>}
        {step === 3 && <>
          {onlineName ? <div role="status" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <p style={{ color: "var(--green-text)", fontSize: 16 }}>✓ {onlineName} is online{provider ? `, running ${chosenModel}` : ""}.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><Button onClick={firstTicket}>Give it a first ticket</Button><Button variant="secondary" onClick={close}>Done</Button></div>
          </div> : <>
            <h2 style={{ fontSize: 18 }}>Connect it on your computer</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <code className="ak-connect-code" aria-label="Command to connect your agent">{line || (making ? "Making your code…" : "No code yet.")}</code>
              <Button disabled={!pairing || !left} onClick={async () => { try { await navigator.clipboard.writeText(line); setCopied(true); } catch { setErr("Couldn't copy; select the line and copy it."); } }}>{copied ? "Copied" : "Copy"}</Button>
            </div>
            {pairing && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{left ? `Code works for ${left} more minute${left === 1 ? "" : "s"}.` : "The code expired. Nothing has connected yet."}</p>}
            <ol style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8, fontSize: 14, lineHeight: 1.5 }}>
              <li>Run this in a terminal on that computer (or inside its container).</li>
              <li>{provider ? provider.keyUrl ? `It asks for your ${provider.name} API key. Paste it; it isn't shown or sent to AutoKolab.` : "It checks that Ollama is running and has your model. No key is needed." : "It connects the Claude Code and Codex it finds, using your existing sign-ins."}</li>
              <li>{provider?.keyUrl ? `It checks the key with ${provider.name} and starts the agent.` : "It starts the agent, which picks up work from this project."}</li>
            </ol>
            {provider?.keyUrl && <a href={provider.keyUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>Where do I get a {provider.name} API key?</a>}
            <p role="status" style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}><span className={left ? "ak-live" : undefined} style={{ width: 7, height: 7, borderRadius: "50%", background: left ? "var(--blue)" : "var(--text-dim)" }} />{left ? "Waiting for your computer…" : "Nothing has connected yet."}</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>If the terminal showed an error, fix it and run the line again. You need macOS or Linux, git and Node.js 20+.</p>
            <div style={{ display: "flex", gap: 8 }}><Button variant="secondary" disabled={making} onClick={() => setStep(provider ? 2 : 1)}>Back</Button>{(!pairing || !left) && <Button disabled={making} onClick={() => void fresh()}>Make a new code</Button>}</div>
          </>}
        </>}
        {err && <p role="alert" style={{ fontSize: 13, color: "var(--coral)" }}>{err}</p>}
      </section>
    </div>
  );
}
