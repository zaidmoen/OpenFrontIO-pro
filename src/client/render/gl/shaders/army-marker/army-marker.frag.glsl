#version 300 es
precision highp float;

in vec2 vLocal;
flat in vec3 vColor;
flat in float vStrength;
flat in float vSelected;
flat in float vSniper;
out vec4 outColor;

float roundedBoxDistance(vec2 point, vec2 halfSize, float radius) {
  vec2 q = abs(point) - halfSize + vec2(radius);
  return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  // Keep each moving squad readable as a compact, upright battlefield marker.
  float outerDistance = roundedBoxDistance(vLocal, vec2(0.82, 0.52), 0.12);
  float innerDistance = roundedBoxDistance(vLocal, vec2(0.72, 0.42), 0.08);
  float outerMask = 1.0 - smoothstep(-0.025, 0.025, outerDistance);
  float innerMask = 1.0 - smoothstep(-0.02, 0.02, innerDistance);
  float borderMask = max(0.0, outerMask - innerMask);

  vec2 point = vLocal;
  float strength = clamp(vStrength, 0.0, 1.0);
  float teamBand = 1.0 - smoothstep(-0.06, 0.05, point.y);
  teamBand *= innerMask;

  vec3 frameColor = mix(vec3(0.012, 0.02, 0.035), vec3(1.0, 0.78, 0.28), vSelected);
  vec3 badgeColor = mix(vec3(0.055, 0.075, 0.10), vColor * 0.52, teamBand * 0.86);
  vec3 color = mix(badgeColor, frameColor, borderMask);

  // A short pennant and pole make the badge read as a moving battalion.
  float pole = 1.0 - smoothstep(0.025, 0.055, abs(point.x + 0.44));
  pole *= smoothstep(-0.32, -0.28, point.y) * (1.0 - smoothstep(0.17, 0.21, point.y));
  float flagRight = 0.24 - (point.y + 0.28) * 0.68;
  float flag = step(-0.38, point.x) * (1.0 - step(flagRight, point.x));
  flag *= step(-0.29, point.y) * (1.0 - step(0.025, point.y)) * innerMask;
  vec3 flagColor = min(vec3(1.0), vColor * 1.18 + vec3(0.12));
  color = mix(color, vec3(0.82, 0.88, 0.95), pole * innerMask);
  color = mix(color, flagColor, flag);

  // Sniper squads carry a small diamond badge; infantry use the plain pennant.
  float sniperDiamond = 1.0 - smoothstep(0.045, 0.08, abs(point.x - 0.38) + abs(point.y + 0.16));
  sniperDiamond *= vSniper * innerMask;
  color = mix(color, vec3(0.92, 0.95, 1.0), sniperDiamond);

  // The short status bar scales with the unit's remaining strength.
  float barArea = step(0.25, point.y) * (1.0 - step(0.37, point.y));
  barArea *= step(-0.61, point.x) * (1.0 - step(0.61, point.x)) * innerMask;
  float barFill = 1.0 - step(-0.61 + 1.22 * strength, point.x);
  vec3 barColor = mix(vec3(1.0, 0.65, 0.16), vec3(0.30, 0.94, 0.46), strength);
  color = mix(color, vec3(0.018, 0.026, 0.04), barArea);
  color = mix(color, barColor, barArea * barFill);

  float selectedRing = 1.0 - smoothstep(0.035, 0.075, abs(outerDistance - 0.035));
  selectedRing *= vSelected;
  color = mix(color, vec3(1.0, 0.82, 0.34), selectedRing * 0.85);

  float alpha = max(outerMask, selectedRing * 0.9);
  if (alpha <= 0.01) discard;
  outColor = vec4(color, alpha);
}
