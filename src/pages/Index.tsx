import { useState, useRef, useEffect, useCallback } from "react";

const MIN = 1;
const MAX = 250;
const WARNING_THRESHOLD = 99;

// Угол стрелки: от -135° (1) до +135° (250)
function valueToAngle(value: number): number {
  return -135 + ((value - MIN) / (MAX - MIN)) * 270;
}

function useAudioEngine() {
  const ctx = useRef<AudioContext | null>(null);

  const getCtx = useCallback(() => {
    if (!ctx.current) ctx.current = new AudioContext();
    return ctx.current;
  }, []);

  const playTick = useCallback((intensity: number = 0.3) => {
    const ac = getCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(800 + intensity * 400, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.05);
    gain.gain.setValueAtTime(0.15, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.08);
  }, [getCtx]);

  const playWarning = useCallback(() => {
    const ac = getCtx();
    const times = [0, 0.18, 0.36, 0.54];
    times.forEach((t) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, ac.currentTime + t);
      osc.frequency.exponentialRampToValueAtTime(440, ac.currentTime + t + 0.1);
      gain.gain.setValueAtTime(0.0, ac.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.35, ac.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.16);
      osc.start(ac.currentTime + t);
      osc.stop(ac.currentTime + t + 0.18);
    });
  }, [getCtx]);

  const playSpin = useCallback((fromAngle: number, toAngle: number) => {
    const ac = getCtx();
    const steps = Math.abs(toAngle - fromAngle) / 15;
    const duration = 1.2;
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * duration * 0.8;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(600 + i * 20, ac.currentTime + t);
      gain.gain.setValueAtTime(0.05, ac.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.06);
      osc.start(ac.currentTime + t);
      osc.stop(ac.currentTime + t + 0.06);
    }
  }, [getCtx]);

  return { playTick, playWarning, playSpin };
}

// Генерация делений шкалы
function generateTicks() {
  const ticks = [];
  for (let v = 0; v <= 250; v += 10) {
    const angle = valueToAngle(v) * (Math.PI / 180);
    const cx = 200, cy = 200, r = 155;
    const isMajor = v % 50 === 0;
    const isMed = v % 25 === 0 && !isMajor;
    const len = isMajor ? 22 : isMed ? 14 : 8;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + (r - len) * Math.cos(angle);
    const y2 = cy + (r - len) * Math.sin(angle);
    ticks.push({ x1, y1, x2, y2, isMajor, isMed, v });
  }
  return ticks;
}

function generateLabels() {
  const labels = [];
  for (let v = 0; v <= 250; v += 50) {
    const angle = valueToAngle(v) * (Math.PI / 180);
    const r = 122;
    const cx = 200, cy = 200;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    labels.push({ x, y, v });
  }
  return labels;
}

// Дуга зоны на шкале
function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const toRad = (d: number) => d * Math.PI / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

const ticks = generateTicks();
const labels = generateLabels();

export default function Index() {
  const [value, setValue] = useState<number | null>(null);
  const [angle, setAngle] = useState(-135);
  const [isSpinning, setIsSpinning] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const { playTick, playWarning, playSpin } = useAudioEngine();
  const prevAngleRef = useRef(-135);
  const warningIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const spin = useCallback(() => {
    if (isSpinning) return;
    setIsSpinning(true);
    setShowWarning(false);
    if (warningIntervalRef.current) clearInterval(warningIntervalRef.current);

    const newValue = Math.floor(Math.random() * MAX) + MIN;
    const newAngle = valueToAngle(newValue);
    const prevAngle = prevAngleRef.current;

    playSpin(prevAngle, newAngle);

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
          if (count >= 2) {
            clearInterval(warningIntervalRef.current!);
          }
        }, 750);
      } else {
        playTick(newValue / MAX);
      }
    }, 100);
  }, [isSpinning, playSpin, playWarning, playTick]);

  useEffect(() => {
    return () => {
      if (warningIntervalRef.current) clearInterval(warningIntervalRef.current);
    };
  }, []);

  const needleAngle = angle;
  const isWarning = value !== null && value > WARNING_THRESHOLD;

  return (
    <div className="app-bg min-h-screen flex flex-col items-center justify-center p-4">
      <div className="meter-container">

        <h1 className="meter-title">ПОЛУЛЯХ-МЕТР</h1>
        <p className="meter-subtitle">Измеритель случайных величин</p>

        <div className="speedometer-wrap" style={{ position: "relative" }}>
          {/* Предупреждение */}
          {showWarning && (
            <div className="warning-flash">
              ⚠ ПРЕВЫШЕНИЕ НОРМЫ
            </div>
          )}

          <svg
            viewBox="0 0 400 360"
            width="420"
            height="378"
            style={{ display: "block", margin: "0 auto" }}
          >
            <defs>
              {/* Металлический градиент корпуса */}
              <radialGradient id="bodyGrad" cx="45%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#6e7a8a" />
                <stop offset="30%" stopColor="#3a4250" />
                <stop offset="70%" stopColor="#1e232c" />
                <stop offset="100%" stopColor="#0d0f14" />
              </radialGradient>

              {/* Блик на корпусе */}
              <radialGradient id="glassGrad" cx="40%" cy="25%" r="70%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
                <stop offset="50%" stopColor="rgba(255,255,255,0.04)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.3)" />
              </radialGradient>

              {/* Кольцо хром */}
              <linearGradient id="chromRing" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#e8eaed" />
                <stop offset="20%" stopColor="#9ca3af" />
                <stop offset="40%" stopColor="#f3f4f6" />
                <stop offset="60%" stopColor="#6b7280" />
                <stop offset="80%" stopColor="#d1d5db" />
                <stop offset="100%" stopColor="#4b5563" />
              </linearGradient>

              {/* Внутренний циферблат */}
              <radialGradient id="dialGrad" cx="50%" cy="40%" r="60%">
                <stop offset="0%" stopColor="#2a2e38" />
                <stop offset="100%" stopColor="#0a0c10" />
              </radialGradient>

              {/* Стрелка */}
              <linearGradient id="needleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ff3c1a" />
                <stop offset="60%" stopColor="#ff6b3d" />
                <stop offset="100%" stopColor="#cc2200" />
              </linearGradient>

              {/* Фильтр свечения */}
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <filter id="redGlow">
                <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <filter id="shadowFilter" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="rgba(0,0,0,0.7)" />
              </filter>

              <clipPath id="dialClip">
                <circle cx="200" cy="200" r="168" />
              </clipPath>
            </defs>

            {/* Внешняя тень */}
            <circle cx="200" cy="205" r="178" fill="rgba(0,0,0,0.5)" filter="url(#shadowFilter)" />

            {/* Хромовое кольцо */}
            <circle cx="200" cy="200" r="182" fill="url(#chromRing)" />
            <circle cx="200" cy="200" r="176" fill="#111318" />

            {/* Корпус */}
            <circle cx="200" cy="200" r="172" fill="url(#bodyGrad)" />

            {/* Циферблат */}
            <circle cx="200" cy="200" r="168" fill="url(#dialGrad)" />

            {/* Зелёная зона 1-99 */}
            <path
              d={describeArc(200, 200, 148, -135, valueToAngle(99))}
              fill="none"
              stroke="rgba(52, 211, 153, 0.25)"
              strokeWidth="14"
              strokeLinecap="butt"
            />

            {/* Жёлтая зона 99-175 */}
            <path
              d={describeArc(200, 200, 148, valueToAngle(99), valueToAngle(175))}
              fill="none"
              stroke="rgba(251, 191, 36, 0.25)"
              strokeWidth="14"
              strokeLinecap="butt"
            />

            {/* Красная зона 175-250 */}
            <path
              d={describeArc(200, 200, 148, valueToAngle(175), 135)}
              fill="none"
              stroke="rgba(239, 68, 68, 0.3)"
              strokeWidth="14"
              strokeLinecap="butt"
            />

            {/* Яркая дуга-трек */}
            <path
              d={describeArc(200, 200, 163, -135, 135)}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="3"
            />

            {/* Деления */}
            {ticks.map((t, i) => (
              <line
                key={i}
                x1={t.x1} y1={t.y1}
                x2={t.x2} y2={t.y2}
                stroke={t.isMajor ? "#e2e8f0" : t.isMed ? "#94a3b8" : "#475569"}
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
                fill="#94a3b8"
                fontSize="13"
                fontFamily="'Roboto Condensed', sans-serif"
                fontWeight="700"
              >
                {l.v}
              </text>
            ))}

            {/* Отметка 99 */}
            <circle
              cx={200 + 148 * Math.cos(valueToAngle(99) * Math.PI / 180)}
              cy={200 + 148 * Math.sin(valueToAngle(99) * Math.PI / 180)}
              r="4"
              fill="#fbbf24"
              filter="url(#glow)"
            />

            {/* Стрелка */}
            <g
              transform={`rotate(${needleAngle}, 200, 200)`}
              style={{
                transition: isSpinning
                  ? "none"
                  : "transform 1.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                transformOrigin: "200px 200px",
              }}
            >
              {/* Тень стрелки */}
              <polygon
                points="196,200 204,200 202,65 198,65"
                fill="rgba(0,0,0,0.4)"
                transform="translate(3,4)"
              />
              {/* Стрелка */}
              <polygon
                points="197.5,200 202.5,200 201,68 199,68"
                fill="url(#needleGrad)"
                filter={isWarning ? "url(#redGlow)" : undefined}
              />
              {/* Кончик */}
              <polygon
                points="199,68 201,68 200,58"
                fill="#ff1a00"
                filter={isWarning ? "url(#redGlow)" : undefined}
              />
              {/* Хвост */}
              <polygon
                points="196,200 204,200 202,230 198,230"
                fill="#374151"
              />
            </g>

            {/* Центральная гайка */}
            <circle cx="200" cy="200" r="14" fill="url(#chromRing)" />
            <circle cx="200" cy="200" r="10" fill="#1f2937" />
            <circle cx="200" cy="200" r="5" fill="#374151" />
            <circle cx="197" cy="197" r="2" fill="rgba(255,255,255,0.3)" />

            {/* Стекло */}
            <circle cx="200" cy="200" r="168" fill="url(#glassGrad)" />

            {/* Нижняя панель с значением */}
            <rect x="140" y="265" width="120" height="44" rx="8"
              fill="rgba(0,0,0,0.6)"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="1"
            />

            {value !== null ? (
              <>
                <text
                  x="200" y="282"
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
                  x="200" y="300"
                  textAnchor="middle"
                  fill={isWarning ? "#f87171" : "#64748b"}
                  fontSize="10"
                  fontFamily="'Roboto Condensed', sans-serif"
                  letterSpacing="1"
                >
                  ПЛ
                </text>
              </>
            ) : (
              <text
                x="200" y="291"
                textAnchor="middle"
                fill="#475569"
                fontSize="13"
                fontFamily="'Roboto Condensed', sans-serif"
              >
                — —
              </text>
            )}
          </svg>
        </div>

        {/* Единица измерения */}
        <div className="unit-label">
          {value !== null
            ? `${value} ${getDeclension(value)}`
            : "нажмите кнопку для измерения"}
        </div>

        {/* Кнопка */}
        <button
          className={`spin-button ${isSpinning ? "spinning" : ""} ${isWarning ? "danger" : ""}`}
          onClick={spin}
          disabled={isSpinning}
        >
          {isSpinning ? "ИЗМЕРЕНИЕ..." : "ИЗМЕРИТЬ"}
        </button>

        {isWarning && (
          <div className="warning-text">
            ⚠ ВНИМАНИЕ: превышена норма в 99 Пл
          </div>
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
