import { useState, useRef, useCallback } from "react";

const SYSTEM_PROMPT = `あなたは野球のスコアシートを読み取る専門AIです。
手書きの野球スコアシート画像を解析し、以下のJSON形式で選手データを返してください。

返すJSONの形式：
{
  "gameInfo": {
    "date": "YYYY/MM/DD",
    "homeTeam": "チーム名",
    "awayTeam": "チーム名",
    "score": { "home": 数字, "away": 数字 }
  },
  "players": [
    {
      "number": "背番号(文字列)",
      "name": "選手名",
      "position": "ポジション略称",
      "atBats": 打数(数字),
      "hits": 安打数(数字),
      "doubles": 二塁打(数字),
      "triples": 三塁打(数字),
      "homeRuns": 本塁打(数字),
      "walks": 四球(数字),
      "strikeouts": 三振(数字),
      "sacrifices": 犠打(数字),
      "rbis": 打点(数字),
      "team": "チーム名"
    }
  ],
  "readConfidence": "high/medium/low",
  "notes": "読み取り備考（不明瞭な箇所など）"
}

スコアシートの記号の解釈：
- Ⅰ/1 = 一塁ゴロ, Ⅱ/2 = 二塁ゴロ, Ⅲ/3 = 三塁ゴロ
- F = フライ, K/三振マーク = 三振, B = 四球(BB)
- S = 安打, WP = ワイルドピッチ, E = エラー
- BD/DB = 死球, 犠 = 犠打, 本 = 本塁打

数字が不明な場合は0とし、notesに記載してください。
JSONのみ返し、説明文は不要です。`;

async function analyzeScoresheet(imageBase64, mediaType = "image/jpeg") {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 },
            },
            {
              type: "text",
              text: "このスコアシートを解析してJSONで返してください。",
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API Error: ${response.status}`);
  }

  const data = await response.json();

  if (data.stop_reason === "max_tokens") {
    throw new Error("AIの出力がトークン上限に達しました。もう一度試してください。");
  }

  const text = data.content.map((b) => b.text || "").join("");
  const stripped = text.replace(/```json\n?|```/g, "").trim();
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AIのレスポンスからJSONを検出できませんでした。");

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("JSON parse失敗。生レスポンス:", text);
    throw new Error(`JSON解析エラー: ${e.message}\n（コンソールに生レスポンスを出力しました）`);
  }
}

function calcAverage(hits, atBats) {
  if (atBats === 0) return ".---";
  return "." + String(Math.round((hits / atBats) * 1000)).padStart(3, "0");
}

function avgColor(hits, atBats) {
  if (atBats === 0) return "#888";
  const avg = hits / atBats;
  if (avg >= 0.350) return "#2d8a4e";
  if (avg >= 0.250) return "#185FA5";
  return "#b94040";
}

function ConfidenceBadge({ level }) {
  const map = {
    high:   { label: "高信頼度", bg: "#d4edda", color: "#2d8a4e" },
    medium: { label: "中信頼度", bg: "#fff3cd", color: "#856404" },
    low:    { label: "要確認",   bg: "#f8d7da", color: "#b94040" },
  };
  const s = map[level] || map.medium;
  return (
    <span style={{ fontSize: 11, background: s.bg, color: s.color, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

function PlayerTable({ players, onEdit }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f0f4f8" }}>
            {["#", "選手名", "チーム", "打数", "安打", "二塁", "三塁", "本塁", "四球", "三振", "打率"].map((h) => (
              <th key={h} style={{ padding: "8px 6px", textAlign: "center", fontWeight: 600, color: "#444", borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>{h}</th>
            ))}
            <th style={{ padding: "8px 6px" }}></th>
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <tr key={i} style={{ borderBottom: "0.5px solid #eee" }}>
              <td style={{ padding: "8px 6px", textAlign: "center", color: "#888" }}>{p.number}</td>
              <td style={{ padding: "8px 6px", fontWeight: 500 }}>{p.name}</td>
              <td style={{ padding: "8px 6px", fontSize: 11, color: "#666" }}>{p.team}</td>
              <td style={{ padding: "8px 6px", textAlign: "center" }}>{p.atBats}</td>
              <td style={{ padding: "8px 6px", textAlign: "center" }}>{p.hits}</td>
              <td style={{ padding: "8px 6px", textAlign: "center" }}>{p.doubles}</td>
              <td style={{ padding: "8px 6px", textAlign: "center" }}>{p.triples}</td>
              <td style={{ padding: "8px 6px", textAlign: "center" }}>{p.homeRuns}</td>
              <td style={{ padding: "8px 6px", textAlign: "center" }}>{p.walks}</td>
              <td style={{ padding: "8px 6px", textAlign: "center" }}>{p.strikeouts}</td>
              <td style={{ padding: "8px 6px", textAlign: "center", fontWeight: 700, color: avgColor(p.hits, p.atBats) }}>
                {calcAverage(p.hits, p.atBats)}
              </td>
              <td style={{ padding: "8px 2px" }}>
                <button onClick={() => onEdit(i)} style={{ fontSize: 11, padding: "2px 8px", cursor: "pointer", borderRadius: 4, border: "0.5px solid #ccc", background: "#fff" }}>
                  修正
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditModal({ player, onSave, onClose }) {
  const [form, setForm] = useState({ ...player });
  const fields = [
    { key: "name", label: "選手名", type: "text" },
    { key: "number", label: "背番号", type: "text" },
    { key: "atBats", label: "打数", type: "number" },
    { key: "hits", label: "安打", type: "number" },
    { key: "doubles", label: "二塁打", type: "number" },
    { key: "triples", label: "三塁打", type: "number" },
    { key: "homeRuns", label: "本塁打", type: "number" },
    { key: "walks", label: "四球", type: "number" },
    { key: "strikeouts", label: "三振", type: "number" },
    { key: "rbis", label: "打点", type: "number" },
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 340, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>データを修正</h3>
        {fields.map(({ key, label, type }) => (
          <div key={key} style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 3 }}>{label}</label>
            <input
              type={type}
              value={form[key] ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
              style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }}
            />
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={() => onSave(form)} style={{ flex: 1, padding: "10px", background: "#185FA5", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14 }}>保存</button>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", background: "#f0f0f0", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

export default function ScoreAI() {
  const [step, setStep] = useState("upload");
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageType, setImageType] = useState("image/jpeg");
  const [gameData, setGameData] = useState(null);
  const [players, setPlayers] = useState([]);
  const [editIdx, setEditIdx] = useState(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [history, setHistory] = useState([]);
  const fileRef = useRef();

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("画像ファイルを選択してください（JPG / PNG）");
      return;
    }
    setImageType(file.type);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl.split(",")[1]);
      setStep("upload");
      setError("");
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleAnalyze = async () => {
    if (!imageBase64) return;
    setStep("analyzing");
    setError("");
    try {
      setProgress("画像を送信中...");
      await new Promise((r) => setTimeout(r, 400));
      setProgress("AIがスコアシートを解析中...");
      const result = await analyzeScoresheet(imageBase64, imageType);
      setProgress("データを整理中...");
      await new Promise((r) => setTimeout(r, 300));
      setGameData(result.gameInfo);
      setPlayers(result.players || []);
      setHistory((h) => [
        { date: result.gameInfo?.date || "不明", title: `${result.gameInfo?.awayTeam || "???"} vs ${result.gameInfo?.homeTeam || "???"}`, confidence: result.readConfidence, players: result.players },
        ...h,
      ]);
      setStep("result");
    } catch (e) {
      setError(e.message || "解析に失敗しました。画像を確認して再試行してください。");
      setStep("error");
    }
  };

  const handleEdit = (idx) => setEditIdx(idx);
  const handleSave = (updated) => {
    setPlayers((ps) => ps.map((p, i) => (i === editIdx ? updated : p)));
    setEditIdx(null);
  };

  const teamStats = players.reduce((acc, p) => {
    if (!acc[p.team]) acc[p.team] = { hits: 0, atBats: 0, players: 0 };
    acc[p.team].hits += p.hits;
    acc[p.team].atBats += p.atBats;
    acc[p.team].players += 1;
    return acc;
  }, {});

  return (
    <div style={{ fontFamily: "'Noto Sans JP', sans-serif", maxWidth: 760, margin: "0 auto", padding: 20, color: "#222" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, background: "#185FA5", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 22 }}>⚾</span>
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>ScoreAI</h1>
          <p style={{ margin: 0, fontSize: 12, color: "#888" }}>手書きスコアシート → 成績データ自動変換</p>
        </div>
      </div>

      {(step === "upload" || step === "error") && (
        <div>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current.click()}
            style={{ border: "2px dashed #B5D4F4", borderRadius: 14, padding: 40, textAlign: "center", cursor: "pointer", marginBottom: 16, background: imagePreview ? "#f8fbff" : "#fff", transition: "border-color 0.2s" }}
          >
            {imagePreview ? (
              <img src={imagePreview} alt="preview" style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8, objectFit: "contain" }} />
            ) : (
              <>
                <div style={{ fontSize: 48, marginBottom: 8 }}>📷</div>
                <p style={{ fontWeight: 600, fontSize: 15, margin: "0 0 4px" }}>スコアシートの画像をここにドロップ</p>
                <p style={{ color: "#888", fontSize: 13, margin: 0 }}>またはタップしてファイルを選択（JPG / PNG）</p>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />

          {error && (
            <div style={{ background: "#fdf0f0", border: "1px solid #f5c6cb", borderRadius: 8, padding: "10px 14px", marginBottom: 12, color: "#b94040", fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={!imageBase64}
            style={{ width: "100%", padding: "14px", background: imageBase64 ? "#185FA5" : "#ccc", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: imageBase64 ? "pointer" : "not-allowed", transition: "background 0.2s" }}
          >
            🤖 AIで解析する
          </button>
        </div>
      )}

      {step === "analyzing" && (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 16, animation: "spin 1s linear infinite", display: "inline-block" }}>⚙️</div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontSize: 16, fontWeight: 600, color: "#185FA5" }}>{progress}</p>
          <p style={{ color: "#888", fontSize: 13 }}>手書き文字の解析には少し時間がかかります</p>
        </div>
      )}

      {step === "result" && gameData && (
        <div>
          <div style={{ background: "#185FA5", color: "#fff", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{gameData.date}</p>
                <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}>
                  {gameData.awayTeam} <span style={{ opacity: 0.7, fontWeight: 400 }}>vs</span> {gameData.homeTeam}
                </p>
              </div>
              {gameData.score && (
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontSize: 26, fontWeight: 800 }}>{gameData.score.away} - {gameData.score.home}</span>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {Object.entries(teamStats).map(([team, s]) => (
              <div key={team} style={{ flex: 1, background: "#f0f6ff", borderRadius: 10, padding: "12px 14px", border: "0.5px solid #B5D4F4" }}>
                <p style={{ margin: "0 0 4px", fontSize: 12, color: "#666" }}>{team}</p>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: avgColor(s.hits, s.atBats) }}>{calcAverage(s.hits, s.atBats)}</p>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "#888" }}>{s.atBats}打数{s.hits}安打</p>
              </div>
            ))}
          </div>

          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #e0e8f0", overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #e0e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>選手成績一覧</span>
              <span style={{ fontSize: 12, color: "#888" }}>{players.length}名</span>
            </div>
            <PlayerTable players={players} onEdit={handleEdit} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { setStep("upload"); setImagePreview(null); setImageBase64(null); }}
              style={{ flex: 1, padding: 12, background: "#f0f4f8", border: "none", borderRadius: 10, fontWeight: 600, cursor: "pointer", fontSize: 14 }}
            >
              別の試合を読み込む
            </button>
            <button
              onClick={() => {
                const csv = [
                  ["名前", "チーム", "打数", "安打", "二塁打", "三塁打", "本塁打", "四球", "三振", "打率"].join(","),
                  ...players.map((p) => [p.name, p.team, p.atBats, p.hits, p.doubles, p.triples, p.homeRuns, p.walks, p.strikeouts, calcAverage(p.hits, p.atBats)].join(","))
                ].join("\n");
                const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `scoreai_${gameData.date || "game"}.csv`; a.click();
              }}
              style={{ flex: 1, padding: 12, background: "#185FA5", color: "#fff", border: "none", borderRadius: 10, fontWeight: 600, cursor: "pointer", fontSize: 14 }}
            >
              CSVで保存
            </button>
          </div>
        </div>
      )}

      {editIdx !== null && (
        <EditModal player={players[editIdx]} onSave={handleSave} onClose={() => setEditIdx(null)} />
      )}

      {history.length > 0 && step !== "analyzing" && (
        <div style={{ marginTop: 24 }}>
          <p style={{ fontSize: 13, color: "#888", fontWeight: 600, marginBottom: 10 }}>読み取り履歴</p>
          {history.map((h, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #e0e8f0", padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>📋</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{h.title}</p>
                <p style={{ margin: 0, fontSize: 12, color: "#888" }}>{h.date} · {h.players?.length || 0}名</p>
              </div>
              <ConfidenceBadge level={h.confidence} />
            </div>
          ))}
        </div>
      )}

      {step === "upload" && !imagePreview && (
        <div style={{ marginTop: 28, background: "#f8fbff", borderRadius: 12, padding: 16, border: "0.5px solid #B5D4F4" }}>
          <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "#185FA5" }}>使い方</p>
          {[
            ["📷", "スコアシートを撮影またはアップロード"],
            ["🤖", "AIがスコア記号を自動解読"],
            ["✏️", "読み取り結果を確認・修正"],
            ["💾", "CSVで保存してスプレッドシートに取り込み"],
          ].map(([icon, text]) => (
            <div key={text} style={{ display: "flex", gap: 10, marginBottom: 8, fontSize: 13, color: "#444" }}>
              <span>{icon}</span><span>{text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
