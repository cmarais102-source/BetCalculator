import { useState, useCallback } from "react";

// ─── helpers ────────────────────────────────────────────────────────────────
const f2 = (n) => Number(n.toFixed(2));
const fmt = (n) => `$${Math.abs(n).toFixed(2)}`;
const fmtS = (n) => (n >= 0 ? "+" : "-") + fmt(n);
const pct = (n) => `${(n * 100).toFixed(1)}%`;
const impliedProb = (odds) => odds > 1 ? 1 / odds : 0;

const BOOKIES = [
  "Sportsbet","Ladbrokes","TAB","Neds","bet365",
  "Unibet","PointsBet","PlayUp","Palmerbet","BlueBet","Other"
];

const LEG_TYPES = [
  { value: "team_win",       label: "Team Win / Loss",       icon: "🏆", certainty: "low"    },
  { value: "disposal_over",  label: "Disposals Over X",      icon: "📊", certainty: "high"   },
  { value: "disposal_under", label: "Disposals Under X",     icon: "📊", certainty: "medium" },
  { value: "clearance_over", label: "Clearances Over X",     icon: "⚙️", certainty: "high"   },
  { value: "tackle_over",    label: "Tackles Over X",        icon: "💪", certainty: "medium" },
  { value: "goal_scorer",    label: "Goal Scorer (Anytime)", icon: "🎯", certainty: "medium" },
  { value: "kick_over",      label: "Kicks Over X",          icon: "👟", certainty: "high"   },
  { value: "mark_over",      label: "Marks Over X",          icon: "🙌", certainty: "medium" },
  { value: "other",          label: "Other",                 icon: "➕", certainty: "unknown"},
];

const CERTAINTY_COLOR = { high: "#00e676", medium: "#ffab40", low: "#ff5252", unknown: "#90a4ae" };
const CERTAINTY_LABEL = { high: "High ✓", medium: "Medium ~", low: "Long Shot", unknown: "?" };

// ─── solve for stakes given: fav_odds, multi_odds, total_budget, bonus_pct ──
// We want: fav_stake * fav_odds >= total AND multi_stake * multi_odds >= total
// Constraint: fav_stake + multi_stake = total_budget
// Optimal: equate returns -> fav_stake * fav_odds = multi_stake * multi_odds
// => fav_stake = total_budget * multi_odds / (fav_odds + multi_odds)
// => multi_stake = total_budget * fav_odds  / (fav_odds + multi_odds)
function solveStakes(favOdds, multiOdds, budget) {
  if (favOdds <= 1 || multiOdds <= 1 || budget <= 0) return null;
  const favStake   = f2(budget * multiOdds / (favOdds + multiOdds));
  const multiStake = f2(budget - favStake);
  const favReturn  = f2(favStake * favOdds);
  const multiReturn= f2(multiStake * multiOdds);
  const minReturn  = Math.min(favReturn, multiReturn);
  const maxReturn  = Math.max(favReturn, multiReturn);
  const profit     = f2(minReturn - budget);
  const viable     = minReturn > budget;
  return { favStake, multiStake, favReturn, multiReturn, minReturn, maxReturn, profit, viable };
}

// given fixed fav_stake, solve multi_stake so multi_return >= fav_return
function solveFromFavStake(favOdds, multiOdds, favStake, bonusPct) {
  if (favOdds <= 1 || multiOdds <= 1 || favStake <= 0) return null;
  const favReturn   = f2(favStake * favOdds);
  // multi_stake needed so multiReturn >= favReturn
  const multiStakeNeeded = f2(favReturn / multiOdds);
  const multiReturn = f2(multiStakeNeeded * multiOdds);
  const totalStake  = f2(favStake + multiStakeNeeded);
  const bonusBack   = f2(multiStakeNeeded * (bonusPct / 100)); // if multi loses 1 leg
  const minReturn   = Math.min(favReturn, multiReturn);
  const profit      = f2(minReturn - totalStake);
  const viable      = minReturn >= totalStake;
  return { favStake, multiStake: multiStakeNeeded, favReturn, multiReturn,
           totalStake, bonusBack, profit, viable };
}

// ─── components ─────────────────────────────────────────────────────────────

function OddsInput({ label, value, onChange, placeholder = "1.75", bookie, onBookieChange }) {
  return (
    <div className="odds-input-group">
      <div className="oil-label">{label}</div>
      <div className="oil-row">
        <select className="oil-bookie" value={bookie} onChange={e => onBookieChange(e.target.value)}>
          {BOOKIES.map(b => <option key={b}>{b}</option>)}
        </select>
        <div className="oil-odds-wrap">
          <span className="oil-at">@</span>
          <input
            type="number" min="1.01" step="0.05"
            placeholder={placeholder}
            value={value}
            onChange={e => onChange(e.target.value)}
            className="oil-odds"
          />
        </div>
        {value > 1 && (
          <div className="oil-implied">
            Implied: {pct(impliedProb(parseFloat(value)))}
          </div>
        )}
      </div>
    </div>
  );
}

function LegRow({ leg, index, onChange, onRemove, canRemove }) {
  const lt = LEG_TYPES.find(l => l.value === leg.type) || LEG_TYPES[0];
  return (
    <div className="leg-row">
      <div className="leg-index">{index + 1}</div>
      <div className="leg-icon">{lt.icon}</div>
      <input
        className="leg-desc"
        placeholder={`e.g. ${index === 0 ? "C.Oliver 25+ disposals" : index === 1 ? "Z.Merrett 5+ clearances" : "Underdog team to win"}`}
        value={leg.desc}
        onChange={e => onChange("desc", e.target.value)}
      />
      <select className="leg-type-sel" value={leg.type} onChange={e => onChange("type", e.target.value)}>
        {LEG_TYPES.map(lt => <option key={lt.value} value={lt.value}>{lt.label}</option>)}
      </select>
      <div className="leg-odds-wrap">
        <span className="leg-at">@</span>
        <input
          type="number" min="1.01" step="0.05" placeholder="1.85"
          className="leg-odds" value={leg.odds}
          onChange={e => onChange("odds", e.target.value)}
        />
      </div>
      <div
        className="leg-certainty"
        style={{ color: CERTAINTY_COLOR[lt.certainty] }}
        title={`Typical certainty: ${CERTAINTY_LABEL[lt.certainty]}`}
      >
        {CERTAINTY_LABEL[lt.certainty]}
      </div>
      {canRemove && (
        <button className="leg-remove" onClick={onRemove}>✕</button>
      )}
    </div>
  );
}

function ViabilityMeter({ result }) {
  if (!result) return null;
  const { viable, minReturn, totalStake, profit } = result;
  const excess = ((minReturn / totalStake - 1) * 100).toFixed(1);
  return (
    <div className={`viability-meter ${viable ? "viable" : "not-viable"}`}>
      <div className="vm-icon">{viable ? "✅" : "❌"}</div>
      <div className="vm-text">
        <strong>{viable ? "STRUCTURE VIABLE" : "STRUCTURE NOT VIABLE"}</strong>
        <span>
          {viable
            ? `Guaranteed ${excess}% above total stake on worst outcome`
            : `Worst outcome returns ${fmt(minReturn)} on ${fmt(totalStake)} staked — need better odds`}
        </span>
      </div>
    </div>
  );
}

function ResultCard({ label, value, sub, color, icon }) {
  return (
    <div className="result-card" style={{ borderColor: color + "44" }}>
      <div className="rc-icon">{icon}</div>
      <div className="rc-label">{label}</div>
      <div className="rc-value" style={{ color }}>{value}</div>
      {sub && <div className="rc-sub">{sub}</div>}
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
export default function App() {
  // Favourite
  const [favOdds, setFavOdds]     = useState("1.75");
  const [favBookie, setFavBookie] = useState("Sportsbet");

  // Multi
  const [multiBookie, setMultiBookie] = useState("Ladbrokes");
  const [legs, setLegs] = useState([
    { id: 1, desc: "", type: "disposal_over", odds: "" },
    { id: 2, desc: "", type: "clearance_over", odds: "" },
    { id: 3, desc: "", type: "team_win",       odds: "" },
  ]);

  // Settings
  const [mode, setMode]           = useState("budget"); // "budget" | "fav_fixed"
  const [budget, setBudget]       = useState("80");
  const [favFixed, setFavFixed]   = useState("50");
  const [bonusPct, setBonusPct]   = useState("80");
  const [promoActive, setPromoActive] = useState(true);

  // Derived
  const multiOdds = legs.reduce((acc, l) => {
    const o = parseFloat(l.odds);
    return o > 1 ? acc * o : acc;
  }, 1);
  const allLegsSet = legs.every(l => parseFloat(l.odds) > 1);
  const favOddsVal = parseFloat(favOdds) || 0;

  const result = useCallback(() => {
    if (!allLegsSet || favOddsVal <= 1) return null;
    if (mode === "budget") {
      const budgetVal = parseFloat(budget) || 0;
      return solveStakes(favOddsVal, multiOdds, budgetVal);
    } else {
      const fs = parseFloat(favFixed) || 0;
      return solveFromFavStake(favOddsVal, multiOdds, fs, parseFloat(bonusPct));
    }
  }, [allLegsSet, favOddsVal, multiOdds, mode, budget, favFixed, bonusPct]);

  const res = result();

  const updateLeg = (id, field, val) =>
    setLegs(ls => ls.map(l => l.id === id ? { ...l, [field]: val } : l));
  const addLeg = () =>
    setLegs(ls => [...ls, { id: Date.now(), desc: "", type: "disposal_over", odds: "" }]);
  const removeLeg = (id) =>
    setLegs(ls => ls.filter(l => l.id !== id));

  // Sensitivity: vary favourite odds
  const sensitivityRows = [0.9, 0.95, 1, 1.05, 1.1].map(mult => {
    const fo = f2(favOddsVal * mult);
    const r = mode === "budget"
      ? solveStakes(fo, multiOdds, parseFloat(budget)||0)
      : solveFromFavStake(fo, multiOdds, parseFloat(favFixed)||0, parseFloat(bonusPct));
    return { fo, r };
  }).filter(x => x.r);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&family=Syne+Mono&display=swap');

        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

        :root{
          --bg:#07090f;
          --s1:#0f1320;
          --s2:#161c2e;
          --s3:#1d2540;
          --border:#ffffff11;
          --border2:#ffffff1e;
          --acc:#7fffb2;
          --acc2:#ff6b6b;
          --acc3:#ffc947;
          --acc4:#60a5fa;
          --text:#dce6f5;
          --muted:#6b7a99;
          --font:'Syne',sans-serif;
          --mono:'JetBrains Mono',monospace;
          --r:10px;
        }

        body{background:var(--bg);color:var(--text);font-family:var(--font);min-height:100vh}

        .app{max-width:1080px;margin:0 auto;padding:0 20px 80px}

        /* ── HEADER ── */
        .header{padding:32px 0 0;border-bottom:1px solid var(--border2);margin-bottom:30px}
        .header-eyebrow{
          font-family:var(--mono);font-size:.7rem;color:var(--acc);
          letter-spacing:.14em;text-transform:uppercase;margin-bottom:10px;
          display:flex;align-items:center;gap:8px
        }
        .header-eyebrow::before{content:'';width:28px;height:1px;background:var(--acc)}
        .header-title{
          font-size:2.6rem;font-weight:800;line-height:1.05;letter-spacing:-.02em;
          margin-bottom:6px
        }
        .header-title em{color:var(--acc);font-style:normal}
        .header-sub{color:var(--muted);font-size:.85rem;margin-bottom:28px;line-height:1.6}

        /* ── GRID ── */
        .main-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}
        .card{background:var(--s1);border:1px solid var(--border2);border-radius:14px;padding:22px}
        .card-title{
          font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;
          color:var(--muted);margin-bottom:16px;display:flex;align-items:center;gap:8px
        }
        .card-title .ct-accent{color:var(--acc)}

        /* ── ODDS INPUT ── */
        .odds-input-group{margin-bottom:14px}
        .oil-label{font-size:.68rem;font-weight:700;text-transform:uppercase;
          letter-spacing:.08em;color:var(--muted);margin-bottom:5px}
        .oil-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .oil-bookie{
          background:var(--s2);border:1px solid var(--border2);border-radius:7px;
          color:var(--text);padding:7px 10px;font-family:var(--font);font-size:.8rem;
          outline:none;cursor:pointer
        }
        .oil-bookie option{background:var(--s2)}
        .oil-odds-wrap{display:flex;align-items:center;gap:5px;
          background:var(--s3);border:1px solid var(--border2);border-radius:7px;
          padding:6px 10px}
        .oil-at{color:var(--muted);font-size:.85rem;font-family:var(--mono)}
        .oil-odds{
          background:transparent;border:none;color:var(--acc);
          font-family:var(--mono);font-size:1.05rem;font-weight:500;
          width:72px;outline:none;text-align:center
        }
        .oil-implied{font-family:var(--mono);font-size:.7rem;color:var(--muted)}

        /* ── LEGS ── */
        .legs-header{
          display:flex;justify-content:space-between;align-items:center;
          margin-bottom:10px
        }
        .legs-title{font-size:.68rem;font-weight:700;text-transform:uppercase;
          letter-spacing:.08em;color:var(--muted)}
        .add-leg{
          background:var(--s3);border:1px solid var(--acc)44;color:var(--acc);
          padding:4px 12px;border-radius:6px;cursor:pointer;
          font-size:.75rem;font-family:var(--font);font-weight:700;
          letter-spacing:.05em;transition:all .2s
        }
        .add-leg:hover{background:var(--acc)18}

        .leg-row{
          display:flex;align-items:center;gap:7px;
          background:var(--s2);border:1px solid var(--border);
          border-radius:8px;padding:8px 10px;margin-bottom:7px;
          transition:border-color .2s
        }
        .leg-row:hover{border-color:var(--border2)}
        .leg-index{font-family:var(--mono);font-size:.7rem;color:var(--acc);
          width:16px;text-align:center;flex-shrink:0}
        .leg-icon{font-size:.95rem;flex-shrink:0}
        .leg-desc{
          flex:1;background:transparent;border:none;color:var(--text);
          font-family:var(--font);font-size:.82rem;outline:none;min-width:0
        }
        .leg-desc::placeholder{color:var(--muted)}
        .leg-type-sel{
          background:var(--s3);border:1px solid var(--border);border-radius:6px;
          color:var(--muted);padding:4px 6px;font-size:.72rem;
          font-family:var(--font);outline:none;flex-shrink:0
        }
        .leg-type-sel option{background:var(--s2)}
        .leg-odds-wrap{display:flex;align-items:center;gap:4px;flex-shrink:0}
        .leg-at{color:var(--muted);font-size:.8rem;font-family:var(--mono)}
        .leg-odds{
          width:60px;background:var(--s3);border:1px solid var(--border);
          border-radius:6px;color:var(--acc3);padding:4px 6px;
          font-family:var(--mono);font-size:.88rem;outline:none;text-align:center
        }
        .leg-certainty{font-size:.65rem;font-family:var(--mono);flex-shrink:0;
          font-weight:500;white-space:nowrap}
        .leg-remove{background:none;border:none;color:var(--muted);cursor:pointer;
          font-size:.8rem;flex-shrink:0;opacity:.5;transition:opacity .2s}
        .leg-remove:hover{opacity:1;color:var(--acc2)}

        /* combined odds pill */
        .multi-odds-row{
          display:flex;align-items:center;justify-content:space-between;
          background:var(--s3);border:1px solid var(--acc)22;
          border-radius:8px;padding:10px 14px;margin-top:10px
        }
        .mo-label{font-size:.7rem;color:var(--muted);text-transform:uppercase;
          letter-spacing:.06em;font-weight:700}
        .mo-val{font-family:var(--mono);font-size:1.4rem;color:var(--acc3);font-weight:500}
        .mo-implied{font-family:var(--mono);font-size:.75rem;color:var(--muted)}

        /* ── SETTINGS ── */
        .mode-btns{display:flex;gap:7px;margin-bottom:16px}
        .mode-btn{
          flex:1;background:var(--s2);border:1px solid var(--border2);
          color:var(--muted);padding:8px;border-radius:8px;cursor:pointer;
          font-size:.75rem;font-family:var(--font);font-weight:700;
          text-transform:uppercase;letter-spacing:.05em;transition:all .2s
        }
        .mode-btn.active{background:var(--acc)15;border-color:var(--acc)44;color:var(--acc)}
        .settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .sf{display:flex;flex-direction:column;gap:4px}
        .sf label{font-size:.65rem;font-weight:700;text-transform:uppercase;
          letter-spacing:.08em;color:var(--muted)}
        .sf input{
          background:var(--s2);border:1px solid var(--border2);border-radius:7px;
          color:var(--text);padding:8px 10px;font-family:var(--mono);font-size:.9rem;
          outline:none;transition:border-color .2s
        }
        .sf input:focus{border-color:var(--acc)44}
        .promo-toggle{
          display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer;
          font-size:.8rem;color:var(--text)
        }
        .promo-toggle input{accent-color:var(--acc)}

        /* ── VIABILITY ── */
        .viability-meter{
          display:flex;align-items:center;gap:14px;
          border-radius:10px;padding:14px 18px;
          margin:20px 0;border:1px solid;
        }
        .viability-meter.viable{
          background:#7fffb208;border-color:#7fffb244
        }
        .viability-meter.not-viable{
          background:#ff6b6b08;border-color:#ff6b6b44
        }
        .vm-icon{font-size:1.6rem}
        .vm-text{display:flex;flex-direction:column;gap:2px}
        .vm-text strong{font-size:.85rem;letter-spacing:.04em}
        .vm-text span{font-size:.78rem;color:var(--muted)}

        /* ── RESULTS ── */
        .results-section{grid-column:1/-1}
        .results-grid{
          display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px
        }
        .result-card{
          background:var(--s1);border:1px solid;border-radius:12px;
          padding:16px;display:flex;flex-direction:column;gap:4px
        }
        .rc-icon{font-size:1.2rem;margin-bottom:2px}
        .rc-label{font-size:.65rem;font-weight:700;text-transform:uppercase;
          letter-spacing:.08em;color:var(--muted)}
        .rc-value{font-family:var(--mono);font-size:1.5rem;font-weight:500}
        .rc-sub{font-size:.7rem;color:var(--muted);line-height:1.4}

        /* ── FLOW DIAGRAM ── */
        .flow-diagram{
          background:var(--s1);border:1px solid var(--border2);
          border-radius:14px;padding:22px;margin-bottom:20px
        }
        .flow-title{font-size:.72rem;font-weight:700;text-transform:uppercase;
          letter-spacing:.1em;color:var(--muted);margin-bottom:18px}
        .flow-row{
          display:grid;grid-template-columns:1fr auto 1fr auto 1fr;
          align-items:center;gap:10px;margin-bottom:10px
        }
        .flow-bet{
          background:var(--s2);border:1px solid var(--border2);
          border-radius:10px;padding:12px 14px
        }
        .fb-bookie{font-family:var(--mono);font-size:.65rem;color:var(--muted);margin-bottom:4px}
        .fb-name{font-size:.8rem;font-weight:700;margin-bottom:6px}
        .fb-stake{font-family:var(--mono);font-size:1.1rem;color:var(--acc3)}
        .fb-at{font-family:var(--mono);font-size:.75rem;color:var(--muted)}
        .fb-odds{font-family:var(--mono);color:var(--acc);font-size:.9rem}
        .flow-arrow{font-size:1.2rem;color:var(--muted);text-align:center}
        .flow-outcome{
          background:var(--s3);border:1px solid;border-radius:10px;
          padding:10px 14px;text-align:center
        }
        .fo-label{font-size:.65rem;color:var(--muted);text-transform:uppercase;
          letter-spacing:.06em;margin-bottom:3px;font-weight:700}
        .fo-val{font-family:var(--mono);font-size:1.1rem;font-weight:500}
        .fo-profit{font-size:.7rem;font-family:var(--mono)}
        .bonus-note{
          background:var(--acc3)10;border:1px solid var(--acc3)33;
          border-radius:8px;padding:10px 14px;margin-top:10px;
          font-size:.77rem;color:var(--acc3);line-height:1.5
        }

        /* ── SENSITIVITY ── */
        .sensitivity{
          background:var(--s1);border:1px solid var(--border2);
          border-radius:14px;padding:22px;margin-bottom:20px
        }
        .sens-title{font-size:.72rem;font-weight:700;text-transform:uppercase;
          letter-spacing:.1em;color:var(--muted);margin-bottom:14px}
        .sens-table{width:100%;border-collapse:collapse;font-size:.8rem}
        .sens-table th{font-size:.65rem;font-weight:700;text-transform:uppercase;
          letter-spacing:.07em;color:var(--muted);padding:7px 10px;text-align:left;
          border-bottom:1px solid var(--border2)}
        .sens-table td{padding:8px 10px;border-bottom:1px solid var(--border);
          font-family:var(--mono)}
        .sens-table tr:last-child td{border:none}
        .sens-table tr.current td{background:var(--acc)08;color:var(--acc)}
        .tag-viable{color:var(--acc);font-size:.65rem}
        .tag-not{color:var(--acc2);font-size:.65rem}

        /* ── TIPS ── */
        .tips-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px}
        .tip-card{
          background:var(--s2);border:1px solid var(--border);
          border-radius:10px;padding:14px
        }
        .tip-head{font-size:.72rem;font-weight:700;text-transform:uppercase;
          letter-spacing:.06em;color:var(--acc4);margin-bottom:6px}
        .tip-body{font-size:.78rem;color:var(--muted);line-height:1.6}
        .tip-body strong{color:var(--text)}

        /* ── EMPTY / PROMPT ── */
        .prompt-state{
          grid-column:1/-1;text-align:center;padding:50px 20px;
          color:var(--muted);font-size:.9rem
        }
        .prompt-state .big{font-size:2.5rem;margin-bottom:12px}
        .prompt-state p{line-height:1.7;max-width:420px;margin:0 auto}

        /* responsive */
        @media(max-width:720px){
          .main-grid{grid-template-columns:1fr}
          .results-grid{grid-template-columns:1fr 1fr}
          .flow-row{grid-template-columns:1fr;gap:6px}
          .flow-arrow{display:none}
          .tips-grid{grid-template-columns:1fr}
          .header-title{font-size:2rem}
          .leg-type-sel{display:none}
        }
      `}</style>

      <div className="app">
        {/* HEADER */}
        <div className="header">
          <div className="header-eyebrow">AFL Betting Tool</div>
          <h1 className="header-title">
            Guaranteed Return<br /><em>Structure Finder</em>
          </h1>
          <p className="header-sub">
            Enter your favourite's odds + build your 3-leg SGM. The calculator finds the exact stake split
            so <strong>both outcomes return more than your total stake</strong> — win the multi or win the single, you profit either way.
          </p>
        </div>

        <div className="main-grid">

          {/* ── LEFT: FAVOURITE ── */}
          <div>
            <div className="card">
              <div className="card-title">
                <span className="ct-accent">①</span> Favourite — Single Bet
              </div>
              <OddsInput
                label="Favourite team to win"
                value={favOdds}
                onChange={setFavOdds}
                placeholder="1.75"
                bookie={favBookie}
                onBookieChange={setFavBookie}
              />
              <div className="card-title" style={{marginTop:20}}>
                <span className="ct-accent">②</span> Stake Settings
              </div>
              <div className="mode-btns">
                <button className={`mode-btn ${mode==="budget"?"active":""}`}
                  onClick={() => setMode("budget")}>
                  Set Total Budget
                </button>
                <button className={`mode-btn ${mode==="fav_fixed"?"active":""}`}
                  onClick={() => setMode("fav_fixed")}>
                  Fix Fav Stake
                </button>
              </div>
              <div className="settings-grid">
                {mode === "budget" ? (
                  <div className="sf" style={{gridColumn:"1/-1"}}>
                    <label>Total Budget ($)</label>
                    <input type="number" min="0" step="5" value={budget}
                      onChange={e => setBudget(e.target.value)}
                      placeholder="80" />
                  </div>
                ) : (
                  <div className="sf" style={{gridColumn:"1/-1"}}>
                    <label>Favourite Stake ($)</label>
                    <input type="number" min="0" step="5" value={favFixed}
                      onChange={e => setFavFixed(e.target.value)}
                      placeholder="50" />
                  </div>
                )}
                <div className="sf">
                  <label>Bonus Bet Return %</label>
                  <input type="number" min="0" max="100" value={bonusPct}
                    onChange={e => setBonusPct(e.target.value)} />
                </div>
                <div className="sf" style={{justifyContent:"flex-end"}}>
                  <label>&nbsp;</label>
                  <label className="promo-toggle">
                    <input type="checkbox" checked={promoActive}
                      onChange={e => setPromoActive(e.target.checked)} />
                    Promo active (1 leg fails = bonus back)
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT: MULTI ── */}
          <div>
            <div className="card">
              <div className="card-title">
                <span className="ct-accent">③</span> SGM — 3+ Leg Multi &nbsp;
                <span style={{marginLeft:"auto"}}>
                  <select className="oil-bookie" value={multiBookie}
                    onChange={e => setMultiBookie(e.target.value)}>
                    {BOOKIES.map(b => <option key={b}>{b}</option>)}
                  </select>
                </span>
              </div>

              <div className="legs-header">
                <span className="legs-title">Legs (aim: 2 high-certainty + 1 long-shot)</span>
                <button className="add-leg" onClick={addLeg}>+ Leg</button>
              </div>

              {legs.map((leg, i) => (
                <LegRow
                  key={leg.id}
                  leg={leg}
                  index={i}
                  onChange={(f, v) => updateLeg(leg.id, f, v)}
                  onRemove={() => removeLeg(leg.id)}
                  canRemove={legs.length > 2}
                />
              ))}

              <div className="multi-odds-row">
                <span className="mo-label">Combined SGM Odds</span>
                <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                  <span className="mo-val">{multiOdds > 1 ? multiOdds.toFixed(2) + "x" : "—"}</span>
                  {multiOdds > 1 && (
                    <span className="mo-implied">Implied {pct(impliedProb(multiOdds))}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── RESULTS ── */}
          {res ? (
            <>
              <div className="results-section">
                <ViabilityMeter result={res} />

                <div className="results-grid">
                  <ResultCard
                    icon="🏆" label="Fav Stake"
                    value={fmt(res.favStake)}
                    sub={`${favBookie} @ ${favOddsVal}x`}
                    color="#60a5fa"
                  />
                  <ResultCard
                    icon="🎯" label="SGM Stake"
                    value={fmt(res.multiStake)}
                    sub={`${multiBookie} @ ${multiOdds.toFixed(2)}x`}
                    color="#ffc947"
                  />
                  <ResultCard
                    icon="💰" label="Total Staked"
                    value={fmt(res.totalStake || res.favStake + res.multiStake)}
                    sub="Combined across both bookies"
                    color="#a78bfa"
                  />
                  <ResultCard
                    icon={res.viable ? "✅" : "⚠️"}
                    label="Min Guaranteed Return"
                    value={fmt(res.minReturn)}
                    sub={res.viable
                      ? `Profit: +${fmt(res.profit)} guaranteed`
                      : "Below stake — not viable"}
                    color={res.viable ? "#7fffb2" : "#ff6b6b"}
                  />
                </div>

                {/* FLOW DIAGRAM */}
                <div className="flow-diagram">
                  <div className="flow-title">📊 How It Plays Out — Scenario Breakdown</div>

                  {/* scenario 1: fav wins */}
                  <div className="flow-row">
                    <div className="flow-bet">
                      <div className="fb-bookie">{favBookie}</div>
                      <div className="fb-name">✅ Favourite Wins</div>
                      <div className="fb-stake">{fmt(res.favStake)}</div>
                      <div className="fb-at">@ <span className="fb-odds">{favOddsVal}x</span></div>
                    </div>
                    <div className="flow-arrow">→</div>
                    <div className="flow-outcome"
                      style={{borderColor:res.favReturn>=(res.totalStake||res.favStake+res.multiStake)?"#7fffb244":"#ff6b6b44"}}>
                      <div className="fo-label">You collect</div>
                      <div className="fo-val" style={{color:"#7fffb2"}}>{fmt(res.favReturn)}</div>
                      <div className="fo-profit" style={{color:"#7fffb2"}}>
                        +{fmt(res.favReturn - (res.totalStake||res.favStake+res.multiStake))} profit
                      </div>
                    </div>
                    <div className="flow-arrow">+</div>
                    <div className="flow-bet" style={{opacity:.5}}>
                      <div className="fb-bookie">{multiBookie}</div>
                      <div className="fb-name">❌ SGM loses</div>
                      <div className="fb-stake">{fmt(res.multiStake)}</div>
                      <div className="fb-at">lost</div>
                    </div>
                  </div>

                  {/* scenario 2: multi wins */}
                  <div className="flow-row">
                    <div className="flow-bet" style={{opacity:.5}}>
                      <div className="fb-bookie">{favBookie}</div>
                      <div className="fb-name">❌ Favourite loses</div>
                      <div className="fb-stake">{fmt(res.favStake)}</div>
                      <div className="fb-at">lost</div>
                    </div>
                    <div className="flow-arrow">→</div>
                    <div className="flow-outcome"
                      style={{borderColor:res.multiReturn>=(res.totalStake||res.favStake+res.multiStake)?"#7fffb244":"#ff6b6b44"}}>
                      <div className="fo-label">You collect</div>
                      <div className="fo-val" style={{color:"#7fffb2"}}>{fmt(res.multiReturn)}</div>
                      <div className="fo-profit" style={{color:"#7fffb2"}}>
                        +{fmt(res.multiReturn - (res.totalStake||res.favStake+res.multiStake))} profit
                      </div>
                    </div>
                    <div className="flow-arrow">+</div>
                    <div className="flow-bet">
                      <div className="fb-bookie">{multiBookie}</div>
                      <div className="fb-name">✅ SGM wins</div>
                      <div className="fb-stake">{fmt(res.multiStake)}</div>
                      <div className="fb-at">@ <span className="fb-odds">{multiOdds.toFixed(2)}x</span></div>
                    </div>
                  </div>

                  {/* scenario 3: promo */}
                  {promoActive && res.bonusBack !== undefined && (
                    <div className="bonus-note">
                      🎁 <strong>Promo Scenario:</strong> If the SGM loses by 1 leg (promo triggers),
                      you get <strong>{fmt(res.bonusBack)}</strong> back as bonus bets
                      ({bonusPct}% of {fmt(res.multiStake)} SGM stake).
                      Favourite return <strong>{fmt(res.favReturn)}</strong> + bonus bets <strong>{fmt(res.bonusBack)}</strong>
                      &nbsp;= <strong>{fmt(res.favReturn + res.bonusBack)}</strong> total value.
                    </div>
                  )}
                </div>

                {/* SENSITIVITY TABLE */}
                {sensitivityRows.length > 0 && (
                  <div className="sensitivity">
                    <div className="sens-title">📉 Sensitivity — Favourite Odds Variance</div>
                    <table className="sens-table">
                      <thead>
                        <tr>
                          <th>Fav Odds</th>
                          <th>Fav Stake</th>
                          <th>SGM Stake</th>
                          <th>Total</th>
                          <th>Min Return</th>
                          <th>Profit</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sensitivityRows.map(({fo, r}, i) => (
                          <tr key={i} className={Math.abs(fo - favOddsVal) < 0.01 ? "current" : ""}>
                            <td>{fo.toFixed(2)}x {Math.abs(fo - favOddsVal) < 0.01 ? "◀ current" : ""}</td>
                            <td>{fmt(r.favStake)}</td>
                            <td>{fmt(r.multiStake)}</td>
                            <td>{fmt(r.totalStake || r.favStake + r.multiStake)}</td>
                            <td>{fmt(r.minReturn)}</td>
                            <td style={{color: r.profit >= 0 ? "#7fffb2" : "#ff6b6b"}}>
                              {r.profit >= 0 ? "+" : ""}{fmt(r.profit)}
                            </td>
                            <td>
                              {r.viable
                                ? <span className="tag-viable">✓ Viable</span>
                                : <span className="tag-not">✗ Not viable</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* TIPS */}
                <div className="tips-grid">
                  <div className="tip-card">
                    <div className="tip-head">🎯 Picking Good SGM Legs</div>
                    <div className="tip-body">
                      Use <strong>2 high-certainty legs</strong> (disposals/clearances for in-form mids)
                      and <strong>1 long-shot</strong> (underdog win) to push multi odds above 2.5x
                      without sacrificing hit rate on the promo trigger.
                    </div>
                  </div>
                  <div className="tip-card">
                    <div className="tip-head">📊 Where to Find Odds</div>
                    <div className="tip-body">
                      Compare live odds at <strong>odds.com.au</strong> or <strong>oddschecker.com.au</strong>.
                      Takes ~60 seconds. Paste them here and the calculator handles the rest.
                    </div>
                  </div>
                  <div className="tip-card">
                    <div className="tip-head">⚙️ Viability Rule of Thumb</div>
                    <div className="tip-body">
                      Structure is viable when <strong>fav_odds + multi_odds &gt; fav_odds × multi_odds</strong>.
                      A favourite at 1.75 needs a multi above ~<strong>2.33x</strong> to guarantee profit.
                    </div>
                  </div>
                  <div className="tip-card">
                    <div className="tip-head">💡 Account Protection</div>
                    <div className="tip-body">
                      Spread stakes across <strong>different bookies</strong> for each side.
                      Fav on TAB, multi on Sportsbet. Reduces pattern recognition and keeps both
                      accounts healthier for longer.
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="prompt-state">
              <div className="big">🏉</div>
              <p>
                Enter the favourite's odds and fill in all three SGM leg odds above.
                The calculator will instantly show you optimal stakes and whether the
                structure guarantees a profit on both outcomes.
              </p>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
