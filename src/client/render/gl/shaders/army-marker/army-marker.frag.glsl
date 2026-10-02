#version 300 es
precision highp float;

in vec2 vLocal;
flat in vec3 vColor;
flat in float vStrength;
flat in float vSelected;
flat in float vSniper;
flat in float vVariant;
out vec4 outColor;

void main() {
  if (vVariant > 1.5) {
    // Tiny muzzle flash and streak. The projectile is client-side decoration.
    float head = 1.0 - smoothstep(0.08, 0.2, length(vLocal - vec2(0.0, -0.16)));
    float streak = (1.0 - smoothstep(0.035, 0.09, abs(vLocal.x))) *
      smoothstep(-0.05, 0.03, vLocal.y) * (1.0 - smoothstep(0.72, 0.9, vLocal.y));
    float alpha = max(head, streak * 0.6) * clamp(vStrength, 0.0, 1.0);
    if (alpha <= 0.01) discard;
    outColor = vec4(vColor, alpha);
    return;
  }
  if (vVariant > 0.5) {
    // Round ranks identify the national reserve, separate from ordered arrows.
    float radius = length(vLocal);
    float disc = 1.0 - smoothstep(0.25, 0.32, radius);
    float rim = (1.0 - smoothstep(0.035, 0.07, abs(radius - 0.42))) * 0.8;
    float alpha = max(disc, rim) * (0.38 + clamp(vStrength, 0.0, 1.0) * 0.62);
    if (alpha <= 0.01) discard;
    outColor = vec4(vColor, alpha);
    return;
  }
  // Tip points up; tail extends down. Snipers have a diamond tip.
  float halfWidth = vSniper > 0.5
    ? max(0.0, (0.18 - abs(vLocal.y + 0.28)) * 1.9)
    : max(0.0, (vLocal.y + 0.32) * 0.75);
  float head = 1.0 - smoothstep(halfWidth - 0.035, halfWidth + 0.035, abs(vLocal.x));
  head *= 1.0 - smoothstep(0.25, 0.31, vLocal.y);
  head *= smoothstep(-0.36, -0.3, vLocal.y);
  float shaft = 1.0 - smoothstep(0.085, 0.12, abs(vLocal.x));
  shaft *= smoothstep(-0.06, 0.0, vLocal.y) * (1.0 - smoothstep(0.53, 0.9, vLocal.y));
  float glow = (1.0 - smoothstep(0.18, 0.65, length(vLocal - vec2(0.0, -0.04)))) * 0.18;
  float alpha = max(max(head, shaft * 0.7), glow);
  if (vSelected > 0.5) {
    float ring = 1.0 - smoothstep(0.035, 0.07, abs(length(vLocal) - 0.53));
    alpha = max(alpha, ring * 0.75);
  }
  if (alpha <= 0.01) discard;
  float strength = clamp(vStrength, 0.0, 1.0);
  outColor = vec4(mix(vColor * 0.55, vColor, strength), alpha * (0.38 + strength * 0.62));
}
