"use client";

import { useState } from "react";

const PALETTE = [
  "e8b923", "4f9d69", "e2725b", "5b8def", "c65fb3", "3fb7c9", "f2a154", "8b6ff2",
];

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

function initialsOf(seed: string): string {
  return (
    seed
      .replace(/[^a-zA-Z0-9 ]/g, " ")
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function Avatar({ seed, size = 40, ring }: { seed: string; size?: number; ring?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const hash = hashSeed(seed);
  const color = PALETTE[hash % PALETTE.length];
  const src = `https://api.dicebear.com/9.x/personas/svg?seed=${encodeURIComponent(seed)}&backgroundType=gradientLinear&backgroundColor=${color}`;

  return (
    <div
      className="relative rounded-full shrink-0 overflow-hidden flex items-center justify-center font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, #${color}, #${color}aa)`,
        boxShadow: ring ? `0 0 0 3px ${ring}` : "0 1px 4px rgba(0,0,0,0.5)",
      }}
    >
      <span>{initialsOf(seed)}</span>
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="absolute inset-0 w-full h-full object-cover transition-opacity"
          style={{ opacity: loaded ? 1 : 0 }}
        />
      )}
    </div>
  );
}
