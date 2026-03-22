import { useState, useRef, useEffect, useCallback } from "react";

const MIN = 1;
const MAX = 250;
const WARNING_THRESHOLD = 99;

// Полукруг: от 180° (левый край) до 0° (правый край)
// Центр стрелки — нижняя середина циферблата
// Угол: 180° = значение MIN, 0° = значение MAX
function valueToAngle(value: number): number {
  return 180 - ((value - MIN) / (MAX - MIN)) * 180;
}

// Координаты точки на окружности (cx, cy) — углы в градусах
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number, cy: number, r: number,
  startDeg: number, endDeg: number
) {
  const s = polar(cx, cy, r, startDeg);
  const e = polar(cx, cy, r, endDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  const sweep = endDeg < startDeg ? 0 : 1;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} ${sweep} ${e.x} ${e.y}`;
}

// Полукруг: от 180° до 0° (против часовой)
function generateTicks(cx: number, cy: number) {
  const ticks = [];
  for (let v = 0; v <= 250; v += 5) {
    const angleDeg = valueToAngle(v);
    const isMajor = v % 50 === 0;
    const isMed = v % 25 === 0 && !isMajor;
    const r = 155;
    const len = isMajor ? 22 : isMed ? 14 : 8;
    const p1 = polar(cx, cy, r, angleDeg);
    const p2 = polar(cx, cy, r - len, angleDeg);
    ticks.push({ ...p1, x2: p2.x, y2: p2.y, isMajor, isMed, v });
  }
  return ticks;
}

function generateLabels(cx: number, cy: number) {
  const labels = [];
  for (let v = 0; v <= 250; v += 50) {
    const angleDeg = valueToAngle(v);
    const p = polar(cx, cy, 122, angleDeg);
    labels.push({ x: p.x, y: p.y, v });
  }
  return labels;
}

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

// Центр стрелки — нижняя середина полукруга
const CX = 210;
const CY = 230; // центр — с запасом от нижнего края

const ticks = generateTicks(CX, CY);
const labels = generateLabels(CX, CY);

export default function Index() {
  const [value, setValue] = useState<number | null>(null);
  const [angle, setAngle] = useState(180); // стрелка стартует влево (MIN)
  const [isSpinning, setIsSpinning] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const { playTick, playWarning, playSpin } = useAudioEngine();
  const prevAngleRef = useRef(180);
  const warningIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const spin = useCallback(() => {
    if (isSpinning) return;
    setIsSpinning(true);
    setShowWarning(false);
    if (warningIntervalRef.current) clearInterval(warningIntervalRef.current);

    const newValue = Math.floor(Math.random() * MAX) + MIN;
    const newAngle = valueToAngle(newValue);
    playSpin(prevAngleRef.current, newAngle);

    setTimeout(() => {
      setValue(newValue);
      setAngle(newAngle);
      prevAngleRef.current = newAngle;
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

  // Длина стрелки
  const needleLen = 140;
  const needleTip = polar(CX, CY, needleLen, angle);
  const needleTail = polar(CX, CY, 22, angle + 180);
  // Боковые точки основания стрелки
  const needleL = polar(CX, CY, 8, angle + 90);
  const needleR = polar(CX, CY, 8, angle - 90);

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
            viewBox="0 0 420 260"
            width="480"
            height="298"
            style={{ display: "block", margin: "0 auto" }}
          >
            <defs>
              <radialGradient id="bodyGrad" cx="45%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#5a6475" />
                <stop offset="35%" stopColor="#2e3440" />
                <stop offset="75%" stopColor="#1a1e26" />
                <stop offset="100%" stopColor="#0c0e13" />
              </radialGradient>

              <radialGradient id="dialGrad" cx="50%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#252a34" />
                <stop offset="100%" stopColor="#08090d" />
              </radialGradient>

              <linearGradient id="chromRing" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#eaecee" />
                <stop offset="22%"  stopColor="#8d9399" />
                <stop offset="42%"  stopColor="#f0f1f2" />
                <stop offset="62%"  stopColor="#5c6166" />
                <stop offset="82%"  stopColor="#cdd0d3" />
                <stop offset="100%" stopColor="#424749" />
              </linearGradient>

              <linearGradient id="needleGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stopColor="#ff4422" />
                <stop offset="50%"  stopColor="#ff6644" />
                <stop offset="100%" stopColor="#cc1a00" />
              </linearGradient>

              <radialGradient id="glassGrad" cx="38%" cy="20%" r="75%">
                <stop offset="0%"   stopColor="rgba(255,255,255,0.14)" />
                <stop offset="55%"  stopColor="rgba(255,255,255,0.03)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.25)" />
              </radialGradient>

              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="redGlow">
                <feGaussianBlur stdDeviation="5" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="shadow">
                <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="rgba(0,0,0,0.8)"/>
              </filter>

              {/* Обрезаем по полукругу */}
              <clipPath id="halfClip">
                <rect x="0" y="0" width="420" height={CY} />
              </clipPath>
              <clipPath id="dialClip">
                <path d={`M ${CX - 170} ${CY} A 170 170 0 0 1 ${CX + 170} ${CY} Z`} />
              </clipPath>
            </defs>

            {/* Тень под корпусом */}
            <ellipse cx={CX} cy={CY + 8} rx="182" ry="18" fill="rgba(0,0,0,0.55)" />

            {/* Хромовое кольцо — полукруг */}
            <path
              d={`M ${CX - 182} ${CY} A 182 182 0 0 1 ${CX + 182} ${CY} Z`}
              fill="url(#chromRing)"
              filter="url(#shadow)"
            />

            {/* Внутренняя тёмная обводка */}
            <path
              d={`M ${CX - 175} ${CY} A 175 175 0 0 1 ${CX + 175} ${CY} Z`}
              fill="#0e1015"
            />

            {/* Корпус */}
            <path
              d={`M ${CX - 170} ${CY} A 170 170 0 0 1 ${CX + 170} ${CY} Z`}
              fill="url(#bodyGrad)"
            />

            {/* Циферблат */}
            <path
              d={`M ${CX - 165} ${CY} A 165 165 0 0 1 ${CX + 165} ${CY} Z`}
              fill="url(#dialGrad)"
            />

            {/* Зелёная зона 1–99 */}
            <path
              d={describeArc(CX, CY, 148, 180, valueToAngle(99))}
              fill="none" stroke="rgba(52,211,153,0.22)" strokeWidth="13"
            />
            {/* Жёлтая зона 99–175 */}
            <path
              d={describeArc(CX, CY, 148, valueToAngle(99), valueToAngle(175))}
              fill="none" stroke="rgba(251,191,36,0.22)" strokeWidth="13"
            />
            {/* Красная зона 175–250 */}
            <path
              d={describeArc(CX, CY, 148, valueToAngle(175), 0)}
              fill="none" stroke="rgba(239,68,68,0.28)" strokeWidth="13"
            />

            {/* Внешний трек-дуга */}
            <path
              d={describeArc(CX, CY, 162, 180, 0)}
              fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3"
            />

            {/* Деления — только в верхней полуплоскости */}
            {ticks.map((t, i) => (
              <line
                key={i}
                x1={t.x} y1={t.y}
                x2={t.x2} y2={t.y2}
                stroke={t.isMajor ? "#dde2ea" : t.isMed ? "#8a95a8" : "#3e4758"}
                strokeWidth={t.isMajor ? 2.5 : t.isMed ? 1.8 : 1.2}
              />
            ))}

            {/* Подписи */}
            {labels.map((l, i) => (
              <text
                key={i}
                x={l.x} y={l.y + 5}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#7a8899"
                fontSize="13"
                fontFamily="'Roboto Condensed', sans-serif"
                fontWeight="700"
              >
                {l.v}
              </text>
            ))}

            {/* Отметка 99 */}
            {(() => {
              const p = polar(CX, CY, 148, valueToAngle(99));
              return <circle cx={p.x} cy={p.y} r="4.5" fill="#fbbf24" filter="url(#glow)" />;
            })()}

            {/* Стрелка */}
            <g style={{
              transition: isSpinning
                ? "none"
                : "transform 1.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}>
              {/* Тень */}
              <polygon
                points={`${needleL.x + 3},${needleL.y + 4} ${needleR.x + 3},${needleR.y + 4} ${needleTip.x + 2},${needleTip.y + 3} ${needleTail.x + 3},${needleTail.y + 4}`}
                fill="rgba(0,0,0,0.45)"
              />
              {/* Тело */}
              <polygon
                points={`${needleL.x},${needleL.y} ${needleR.x},${needleR.y} ${needleTip.x},${needleTip.y} ${needleTail.x},${needleTail.y}`}
                fill="url(#needleGrad)"
                filter={isWarning ? "url(#redGlow)" : undefined}
              />
              {/* Кончик */}
              <circle
                cx={needleTip.x} cy={needleTip.y} r="3"
                fill="#ff1a00"
                filter={isWarning ? "url(#redGlow)" : undefined}
              />
            </g>

            {/* Центральная втулка */}
            <circle cx={CX} cy={CY} r="16" fill="url(#chromRing)" />
            <circle cx={CX} cy={CY} r="11" fill="#1a1e28" />
            <circle cx={CX} cy={CY} r="5"  fill="#2a2f3c" />
            <circle cx={CX - 3} cy={CY - 3} r="2" fill="rgba(255,255,255,0.28)" />

            {/* Стекло-блик */}
            <path
              d={`M ${CX - 165} ${CY} A 165 165 0 0 1 ${CX + 165} ${CY} Z`}
              fill="url(#glassGrad)"
            />

            {/* Нижняя панель значения */}
            <rect x={CX - 62} y={CY - 50} width="124" height="42" rx="8"
              fill="rgba(0,0,0,0.65)"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
            {value !== null ? (
              <>
                <text
                  x={CX} y={CY - 35}
                  textAnchor="middle"
                  fill={isWarning ? "#f87171" : "#e2e8f0"}
                  fontSize="20"
                  fontFamily="'Oswald', sans-serif"
                  fontWeight="700"
                  filter={isWarning ? "url(#redGlow)" : undefined}
                >
                  {value}
                </text>
                <text
                  x={CX} y={CY - 18}
                  textAnchor="middle"
                  fill={isWarning ? "#f87171" : "#4a5568"}
                  fontSize="9"
                  fontFamily="'Roboto Condensed', sans-serif"
                  letterSpacing="2"
                >
                  ПОЛУЛЯХ
                </text>
              </>
            ) : (
              <text
                x={CX} y={CY - 26}
                textAnchor="middle"
                fill="#3a4255"
                fontSize="13"
                fontFamily="'Roboto Condensed', sans-serif"
              >
                — —
              </text>
            )}

            {/* Нижняя прямая линия + боковые заглушки */}
            <line x1={CX - 182} y1={CY} x2={CX + 182} y2={CY}
              stroke="url(#chromRing)" strokeWidth="5"
            />
            <rect x={CX - 184} y={CY} width="8" height="20" rx="2" fill="url(#chromRing)" />
            <rect x={CX + 176} y={CY} width="8" height="20" rx="2" fill="url(#chromRing)" />
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