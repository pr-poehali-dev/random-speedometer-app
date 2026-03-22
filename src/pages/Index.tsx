import { useState, useRef, useEffect, useCallback } from "react";

const MIN = 1;
const MAX = 250;
const WARNING_THRESHOLD = 99;
const CX = 200;
const CY = 200;
const R = 160; // радиус циферблата

// Шкала: -225° (левый нижний угол) → +45° (правый нижний угол) = 270°
function valueToAngle(value: number): number {
  return -225 + ((value - MIN) / (MAX - MIN)) * 270;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s = polar(cx, cy, r, startDeg);
  const e = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

function generateTicks() {
  const ticks = [];
  for (let v = 0; v <= 250; v += 5) {
    const deg = valueToAngle(v);
    const isMajor = v % 50 === 0;
    const isMed = v % 25 === 0 && !isMajor;
    const outerR = R - 8;
    const len = isMajor ? 22 : isMed ? 14 : 8;
    const p1 = polar(CX, CY, outerR, deg);
    const p2 = polar(CX, CY, outerR - len, deg);
    ticks.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, isMajor, isMed, v });
  }
  return ticks;
}

function generateLabels() {
  const labels = [];
  for (let v = 0; v <= 250; v += 50) {
    const deg = valueToAngle(v);
    const p = polar(CX, CY, R - 42, deg);
    labels.push({ x: p.x, y: p.y, v });
  }
  return labels;
}

const ticks = generateTicks();
const labels = generateLabels();

function useAudioEngine() {
  const ctx = useRef<AudioContext | null>(null);
  const getCtx = useCallback(() => {
    if (!ctx.current) ctx.current = new AudioContext();
    return ctx.current;
  }, []);

  const playTick = useCallback((intensity = 0.3) => {
    const ac = getCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(800 + intensity * 400, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.05);
    gain.gain.setValueAtTime(0.15, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
    osc.start(); osc.stop(ac.currentTime + 0.08);
  }, [getCtx]);

  const playWarning = useCallback(() => {
    const ac = getCtx();
    [0, 0.18, 0.36, 0.54].forEach((t) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, ac.currentTime + t);
      osc.frequency.exponentialRampToValueAtTime(440, ac.currentTime + t + 0.1);
      gain.gain.setValueAtTime(0, ac.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.35, ac.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.16);
      osc.start(ac.currentTime + t); osc.stop(ac.currentTime + t + 0.18);
    });
  }, [getCtx]);

  const playSpin = useCallback((fromAngle: number, toAngle: number) => {
    const ac = getCtx();
    const steps = Math.max(4, Math.abs(toAngle - fromAngle) / 12);
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * 1.0;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(500 + i * 18, ac.currentTime + t);
      gain.gain.setValueAtTime(0.04, ac.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.06);
      osc.start(ac.currentTime + t); osc.stop(ac.currentTime + t + 0.06);
    }
  }, [getCtx]);

  return { playTick, playWarning, playSpin };
}

export default function Index() {
  const [value, setValue] = useState<number | null>(null);
  const [needleDeg, setNeedleDeg] = useState(valueToAngle(MIN));
  const [isSpinning, setIsSpinning] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const { playTick, playWarning, playSpin } = useAudioEngine();
  const prevDegRef = useRef(valueToAngle(MIN));
  const warningIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const spin = useCallback(() => {
    if (isSpinning) return;
    setIsSpinning(true);
    setShowWarning(false);
    if (warningIntervalRef.current) clearInterval(warningIntervalRef.current);

    const newValue = Math.floor(Math.random() * MAX) + MIN;
    const newDeg = valueToAngle(newValue);
    playSpin(prevDegRef.current, newDeg);

    setTimeout(() => {
      setValue(newValue);
      setNeedleDeg(newDeg);
      prevDegRef.current = newDeg;
      setIsSpinning(false);
      if (newValue > WARNING_THRESHOLD) {
        setShowWarning(true);
        playWarning();
        let count = 0;
        warningIntervalRef.current = setInterval(() => {
          count++;
          playWarning();
          if (count >= 2) clearInterval(warningIntervalRef.current!);
        }, 750);
      } else {
        playTick(newValue / MAX);
      }
    }, 100);
  }, [isSpinning, playSpin, playWarning, playTick]);

  useEffect(() => () => {
    if (warningIntervalRef.current) clearInterval(warningIntervalRef.current);
  }, []);

  const isWarning = value !== null && value > WARNING_THRESHOLD;

  // Стрелка: вращаем transform rotate вокруг центра CX,CY
  const needleTipR = R - 22;
  const needleTailR = 28;

  return (
    <div className="app-bg min-h-screen flex flex-col items-center justify-center p-4">
      <div className="meter-container">
        <h1 className="meter-title">ПОЛУЛЯХ-МЕТР</h1>
        <p className="meter-subtitle">Измеритель случайных величин</p>

        <div className="speedometer-wrap">
          {showWarning && (
            <div className="warning-flash">⚠ ПРЕВЫШЕНИЕ НОРМЫ</div>
          )}

          <svg
            viewBox="0 0 400 400"
            width="420"
            height="420"
            style={{ display: "block", margin: "0 auto" }}
          >
            <defs>
              <radialGradient id="bodyGrad" cx="42%" cy="32%" r="68%">
                <stop offset="0%"   stopColor="#5e6b7c" />
                <stop offset="30%"  stopColor="#2d3340" />
                <stop offset="72%"  stopColor="#191d25" />
                <stop offset="100%" stopColor="#0b0d11" />
              </radialGradient>

              <radialGradient id="dialGrad" cx="50%" cy="38%" r="62%">
                <stop offset="0%"   stopColor="#23283200" />
                <stop offset="40%"  stopColor="#1a1e28" />
                <stop offset="100%" stopColor="#07080b" />
              </radialGradient>

              <linearGradient id="chromRing" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#eceef0" />
                <stop offset="18%"  stopColor="#8a9098" />
                <stop offset="40%"  stopColor="#f2f3f4" />
                <stop offset="60%"  stopColor="#575d63" />
                <stop offset="80%"  stopColor="#cdd1d4" />
                <stop offset="100%" stopColor="#3f4448" />
              </linearGradient>

              <linearGradient id="needleGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stopColor="#ff4422" />
                <stop offset="45%"  stopColor="#ff6040" />
                <stop offset="100%" stopColor="#aa1500" />
              </linearGradient>

              <radialGradient id="glassGrad" cx="36%" cy="22%" r="72%">
                <stop offset="0%"   stopColor="rgba(255,255,255,0.16)" />
                <stop offset="50%"  stopColor="rgba(255,255,255,0.03)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.22)" />
              </radialGradient>

              <radialGradient id="hubGrad" cx="35%" cy="30%" r="70%">
                <stop offset="0%"   stopColor="#c8cdd3" />
                <stop offset="40%"  stopColor="#7a8290" />
                <stop offset="100%" stopColor="#2a2f38" />
              </radialGradient>

              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="redGlow">
                <feGaussianBlur stdDeviation="5" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="dropShadow">
                <feDropShadow dx="0" dy="10" stdDeviation="18" floodColor="rgba(0,0,0,0.85)"/>
              </filter>
            </defs>

            {/* Внешняя тень */}
            <circle cx={CX} cy={CY + 10} r="192" fill="rgba(0,0,0,0.4)" filter="url(#dropShadow)" />

            {/* Хромовое кольцо */}
            <circle cx={CX} cy={CY} r="192" fill="url(#chromRing)" />
            <circle cx={CX} cy={CY} r="184" fill="#0f1116" />

            {/* Корпус */}
            <circle cx={CX} cy={CY} r="180" fill="url(#bodyGrad)" />

            {/* Циферблат */}
            <circle cx={CX} cy={CY} r="174" fill="url(#dialGrad)" />

            {/* Цветные зоны */}
            {/* Зелёная 1–99 */}
            <path
              d={describeArc(CX, CY, R - 18, valueToAngle(MIN), valueToAngle(99))}
              fill="none" stroke="rgba(52,211,153,0.22)" strokeWidth="14"
            />
            {/* Жёлтая 99–175 */}
            <path
              d={describeArc(CX, CY, R - 18, valueToAngle(99), valueToAngle(175))}
              fill="none" stroke="rgba(251,191,36,0.22)" strokeWidth="14"
            />
            {/* Красная 175–250 */}
            <path
              d={describeArc(CX, CY, R - 18, valueToAngle(175), valueToAngle(MAX))}
              fill="none" stroke="rgba(239,68,68,0.28)" strokeWidth="14"
            />

            {/* Внешняя дорожка */}
            <path
              d={describeArc(CX, CY, R + 4, valueToAngle(MIN), valueToAngle(MAX))}
              fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3"
            />

            {/* Деления */}
            {ticks.map((t, i) => (
              <line
                key={i}
                x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                stroke={t.isMajor ? "#dde3ea" : t.isMed ? "#8895a6" : "#3b4356"}
                strokeWidth={t.isMajor ? 2.5 : t.isMed ? 1.8 : 1.2}
              />
            ))}

            {/* Подписи */}
            {labels.map((l, i) => (
              <text
                key={i}
                x={l.x} y={l.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#7a8899"
                fontSize="14"
                fontFamily="'Roboto Condensed', sans-serif"
                fontWeight="700"
              >
                {l.v}
              </text>
            ))}

            {/* Отметка 99 */}
            {(() => {
              const p = polar(CX, CY, R - 18, valueToAngle(99));
              return <circle cx={p.x} cy={p.y} r="5" fill="#fbbf24" filter="url(#glow)" />;
            })()}

            {/* Стрелка — вращается вокруг центра CX,CY */}
            <g
              transform={`rotate(${needleDeg}, ${CX}, ${CY})`}
              style={{
                transition: isSpinning
                  ? "none"
                  : "transform 1.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            >
              {/* Тень стрелки */}
              <polygon
                points={`${CX - 5},${CY + needleTailR} ${CX + 5},${CY + needleTailR} ${CX + 2},${CY - needleTipR} ${CX - 2},${CY - needleTipR}`}
                fill="rgba(0,0,0,0.4)"
                transform="translate(3,5)"
              />
              {/* Тело стрелки */}
              <polygon
                points={`${CX - 5},${CY + needleTailR} ${CX + 5},${CY + needleTailR} ${CX + 1.5},${CY - needleTipR} ${CX - 1.5},${CY - needleTipR}`}
                fill="url(#needleGrad)"
                filter={isWarning ? "url(#redGlow)" : undefined}
              />
              {/* Кончик */}
              <circle
                cx={CX} cy={CY - needleTipR} r="3"
                fill="#ff1a00"
                filter={isWarning ? "url(#redGlow)" : undefined}
              />
              {/* Хвост */}
              <polygon
                points={`${CX - 5},${CY + needleTailR} ${CX + 5},${CY + needleTailR} ${CX + 3},${CY + needleTailR + 12} ${CX - 3},${CY + needleTailR + 12}`}
                fill="#2a303c"
              />
            </g>

            {/* Центральная втулка */}
            <circle cx={CX} cy={CY} r="18" fill="url(#hubGrad)" />
            <circle cx={CX} cy={CY} r="12" fill="#1c2030" />
            <circle cx={CX} cy={CY} r="5"  fill="#2e3444" />
            <circle cx={CX - 3} cy={CY - 3} r="2.5" fill="rgba(255,255,255,0.3)" />

            {/* Стекло-блик */}
            <circle cx={CX} cy={CY} r="174" fill="url(#glassGrad)" />

            {/* Дисплей значения */}
            <rect x={CX - 52} y={CY + 52} width="104" height="46" rx="8"
              fill="rgba(0,0,0,0.7)"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
            {value !== null ? (
              <>
                <text
                  x={CX} y={CY + 71}
                  textAnchor="middle"
                  fill={isWarning ? "#f87171" : "#e2e8f0"}
                  fontSize="22"
                  fontFamily="'Oswald', sans-serif"
                  fontWeight="700"
                  filter={isWarning ? "url(#redGlow)" : undefined}
                >
                  {value}
                </text>
                <text
                  x={CX} y={CY + 89}
                  textAnchor="middle"
                  fill={isWarning ? "#f87171" : "#3d4559"}
                  fontSize="9"
                  fontFamily="'Roboto Condensed', sans-serif"
                  letterSpacing="2"
                >
                  ПОЛУЛЯХ
                </text>
              </>
            ) : (
              <text
                x={CX} y={CY + 78}
                textAnchor="middle"
                fill="#333c50"
                fontSize="14"
                fontFamily="'Roboto Condensed', sans-serif"
              >
                — —
              </text>
            )}
          </svg>
        </div>

        <div className="unit-label">
          {value !== null
            ? `${value} ${getDeclension(value)}`
            : "нажмите кнопку для измерения"}
        </div>

        <button
          className={`spin-button ${isSpinning ? "spinning" : ""} ${isWarning ? "danger" : ""}`}
          onClick={spin}
          disabled={isSpinning}
        >
          {isSpinning ? "ИЗМЕРЕНИЕ..." : "ИЗМЕРИТЬ"}
        </button>

        {isWarning && (
          <div className="warning-text">⚠ ВНИМАНИЕ: превышена норма в 99 Пл</div>
        )}
      </div>
    </div>
  );
}

function getDeclension(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return "полулях";
  if (mod10 === 1) return "полулях";
  if (mod10 >= 2 && mod10 <= 4) return "полуляха";
  return "полулях";
}
